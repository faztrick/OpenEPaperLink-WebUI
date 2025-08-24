// Agent Action Runner: encapsulates a minimal, allow-listed set of operations the AI can trigger.
// Each action returns a structured object and streams log events via a provided callback.
// This layer avoids the AI invoking arbitrary shell commands directly.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AgentActionRunner {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || path.join(__dirname, '..');
        this.logFn = options.logFn || (() => {});
        this.defaultEnv = options.env || process.env;
        this.active = new Map(); // processId -> child
        this.timeouts = new Map();
        this.allowed = {
            'build-fast': { kind: 'python', script: 'fast_compile.py', args: [] },
            'build': { kind: 'python', script: 'compile.py', args: ['-SkipUpload'] },
            'upload': { kind: 'python', script: 'compile.py', args: ['-SkipBuild'] },
            'build-upload': { kind: 'python', script: 'compile.py', args: [] },
            'monitor': { kind: 'pio', cmd: 'pio', args: ['device', 'monitor'] },
            'list-artifacts': { kind: 'internal' },
            'ping': { kind: 'internal' },
            'status': { kind: 'internal' },
            'ai-health': { kind: 'internal' },
            'kill': { kind: 'internal' },
            // Advanced / composite / process oriented actions (internal orchestrations)
            'list-processes': { kind: 'internal' },
            'build-upload-test': { kind: 'internal' },
            'run-python-script': { kind: 'internal' },
            'run-powershell-script': { kind: 'internal' },
            'graceful-restart': { kind: 'internal' }
        };
        this.maxRuntimeMs = options.maxRuntimeMs || 15 * 60 * 1000; // 15 minutes default safety
        // Whitelisted script directories for run-* actions
        this.safeScriptDirs = [
            path.join(this.projectRoot, 'scripts'),
            path.join(this.projectRoot, 'ESP32_AP-Flasher')
        ];
    }

    listActions() { return Object.keys(this.allowed); }

    // Execute an action. config carries runtime adjustments (environment, comPort, baudRate)
    execute(action, { config = {}, aiAgent = null } = {}) {
        if (!this.allowed[action]) {
            return { started: false, error: 'Action not allowed', action };
        }
        if (['list-artifacts','ping','status','ai-health','list-processes','build-upload-test','run-python-script','run-powershell-script','graceful-restart'].includes(action)) {
            return this._runInternal(action, { config, aiAgent });
        }
        // Provide processId for tracking
        const processId = Date.now().toString() + '-' + Math.random().toString(36).slice(2,8);
        const spec = this.allowed[action];
        let command, args;
        if (spec.kind === 'python') {
            command = this._resolvePython();
            args = [ path.join(this.projectRoot, spec.script), ...spec.args ];
            // Append dynamic config flags understood by compile scripts
            if (config.environment) { args.push('-Environment', config.environment); }
            if (config.comPort) { args.push('-ComPort', config.comPort); }
            if (config.baudRate) { args.push('-BaudRate', String(config.baudRate)); }
        } else if (spec.kind === 'pio') {
            command = spec.cmd;
            args = [...spec.args];
            if (config.comPort && args.includes('monitor')) {
                args.push('--port', config.comPort);
                if (config.baudRate) args.push('--baud', String(config.baudRate));
            }
        } else {
            return { started: false, error: 'Unsupported spec kind', action };
        }
        this.logFn('agent', `start action=${action} id=${processId} cmd=${command} ${args.join(' ')}`);
        const child = spawn(command, args, {
            cwd: this.projectRoot,
            env: this.defaultEnv,
            stdio: ['ignore','pipe','pipe'],
            shell: process.platform === 'win32'
        });
        this.active.set(processId, child);
        child.stdout.on('data', d => this.logFn('agent-out', d.toString().replace(/\r?\n/g,'\\n')));
        child.stderr.on('data', d => this.logFn('agent-err', d.toString().replace(/\r?\n/g,'\\n')));
        child.on('close', code => {
            clearTimeout(this.timeouts.get(processId));
            this.timeouts.delete(processId);
            this.active.delete(processId);
            this.logFn('agent', `end action=${action} id=${processId} code=${code}`);
        });
        // Safety timeout
        const to = setTimeout(() => {
            try { child.kill(); this.logFn('agent', `timeout kill id=${processId}`); } catch (_) {}
        }, this.maxRuntimeMs);
        this.timeouts.set(processId, to);
        return { started: true, processId, action, command, args };
    }

    kill(processId) {
        const child = this.active.get(processId);
        if (!child) return { success:false, error:'not-found', processId };
        try { child.kill(); this.active.delete(processId); return { success:true, processId }; } catch (e) { return { success:false, error:e.message, processId }; }
    }

    _runInternal(action, { config, aiAgent }) {
        if (action === 'ping') return { success: true, pong: true, ts: Date.now() };
        if (action === 'status') return { success:true, running: Array.from(this.active.keys()), actions: this.listActions(), ts: Date.now() };
        if (action === 'ai-health') return { success:true, ai: aiAgent ? aiAgent.getHealth() : null };
        if (action === 'list-processes') {
            const procs = [];
            for (const [id, child] of this.active.entries()) {
                procs.push({ id, pid: child.pid });
            }
            return { success:true, processes: procs };
        }
        if (action === 'graceful-restart') {
            // We do not immediately exit; caller can decide to act on this instruction.
            return { success:true, instruction: 'Send HTTP request to /api/server/restart (if implemented) or manually restart process. (Placeholder – no direct restart performed).'};
        }
        if (action === 'build-upload-test') {
            // Sequentially perform build-upload followed by tests (test_api_endpoints.py if present)
            try {
                const testScript = path.join(this.projectRoot, 'test_api_endpoints.py');
                const result = { success:true, steps:[] };
                // Reuse execute for build-upload
                const buildRes = this.execute('build-upload', { config });
                result.steps.push({ step: 'build-upload', started: buildRes.started, processId: buildRes.processId });
                if (!buildRes.started) return { success:false, error:'failed-start-build-upload', detail: buildRes };
                result.note = 'Build-upload started asynchronously; test phase will not run automatically in this simplified internal pipeline. Run tests separately via run-python-script.';
                return result;
            } catch (e) { return { success:false, error:e.message }; }
        }
        if (action === 'run-python-script') {
            try {
                const rel = (config && config.script) ? config.script : '';
                if (!rel) return { success:false, error:'script not specified (config.script)' };
                if (!/^[\w\-\/\\.]+$/.test(rel)) return { success:false, error:'invalid script name' };
                const target = this._resolveSafeScript(rel, ['.py']);
                if (!target) return { success:false, error:'script not allowed or not found' };
                return this._spawnDetached('python', [target], { label:'run-python-script' });
            } catch (e) { return { success:false, error:e.message }; }
        }
        if (action === 'run-powershell-script') {
            if (process.platform !== 'win32') return { success:false, error:'powershell only on win32' };
            try {
                const rel = (config && config.script) ? config.script : '';
                if (!rel) return { success:false, error:'script not specified (config.script)' };
                if (!/^[\w\-\/\\.]+$/.test(rel)) return { success:false, error:'invalid script name' };
                const target = this._resolveSafeScript(rel, ['.ps1']);
                if (!target) return { success:false, error:'script not allowed or not found' };
                return this._spawnDetached('pwsh', ['-NoProfile','-ExecutionPolicy','Bypass','-File', target], { label:'run-powershell-script' });
            } catch (e) { return { success:false, error:e.message }; }
        }
        if (action === 'list-artifacts') {
            try {
                const env = config.environment || 'OutdoorAP';
                const buildDir = path.join(this.projectRoot, '.pio', 'build', env);
                if (!fs.existsSync(buildDir)) return { success:true, artifacts:[], note:'build dir missing', env };
                const files = fs.readdirSync(buildDir).filter(f=>/\.bin$|\.elf$/.test(f));
                const artifacts = files.map(f=>{
                    const st = fs.statSync(path.join(buildDir,f));
                    return { name:f, size:st.size, mtime:st.mtime };
                });
                return { success:true, artifacts, env };
            } catch (e) { return { success:false, error:e.message }; }
        }
        return { success:false, error:'unknown-internal' };
    }

    _resolveSafeScript(relPath, allowedExts) {
        const candidate = path.isAbsolute(relPath) ? relPath : this.safeScriptDirs.map(d=> path.join(d, relPath)).find(p=>fs.existsSync(p));
        if (!candidate) return null;
        const ext = path.extname(candidate).toLowerCase();
        if (!allowedExts.includes(ext)) return null;
        // Ensure inside a safe dir
        const norm = path.normalize(candidate);
        if (!this.safeScriptDirs.some(d=> norm.startsWith(path.normalize(d+path.sep)))) return null;
        return candidate;
    }

    _spawnDetached(command, args, meta={}) {
        const processId = Date.now().toString() + '-' + Math.random().toString(36).slice(2,8);
        this.logFn('agent', `start ${meta.label||'proc'} id=${processId} cmd=${command} ${args.join(' ')}`);
        const child = spawn(command, args, {
            cwd: this.projectRoot,
            env: this.defaultEnv,
            stdio: ['ignore','pipe','pipe'],
            shell: process.platform === 'win32'
        });
        this.active.set(processId, child);
        child.stdout.on('data', d => this.logFn('agent-out', d.toString().replace(/\r?\n/g,'\\n')));
        child.stderr.on('data', d => this.logFn('agent-err', d.toString().replace(/\r?\n/g,'\\n')));
        child.on('close', code => {
            clearTimeout(this.timeouts.get(processId));
            this.timeouts.delete(processId);
            this.active.delete(processId);
            this.logFn('agent', `end ${meta.label||'proc'} id=${processId} code=${code}`);
        });
        const to = setTimeout(()=>{ try { child.kill(); this.logFn('agent', `timeout kill id=${processId}`); } catch(_){} }, this.maxRuntimeMs);
        this.timeouts.set(processId, to);
        return { success:true, started:true, processId, command, args };
    }

    _resolvePython() {
        // Reuse environment or fallback; user can override by setting PYTHON env variable
        return process.env.PYTHON || 'python';
    }
}

module.exports = AgentActionRunner;
