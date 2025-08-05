const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ESP32AIAgent = require('./ai_agent');
const RemoteServerManager = require('./remote_manager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize AI Agent and Remote Server Manager
const aiAgent = new ESP32AIAgent();
const remoteManager = new RemoteServerManager();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store for active processes
const activeProcesses = new Map();

// Configuration defaults
const defaultConfig = {
    environment: 'OutdoorAP',
    comPort: 'COM10',
    baudRate: 921600,
    jobs: 0,
    fastBuild: true,
    clean: false,
    verbose: false,
    filesystemOnly: false,
    skipUpload: false,
    monitor: false
};

let currentConfig = { ...defaultConfig };

// Helper function to get COM ports
function getComPorts() {
    try {
        if (os.platform() === 'win32') {
            const result = spawn('powershell', [
                '-Command',
                "Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match 'COM\\d+' } | ForEach-Object { if ($_.Caption -match '(COM\\d+)') { $Matches[1] } } | Sort-Object"
            ], { encoding: 'utf8' });

            return new Promise((resolve) => {
                let output = '';
                result.stdout.on('data', (data) => {
                    output += data;
                });
                result.on('close', () => {
                    const ports = output.trim().split('\n').filter(port => port.trim());
                    resolve(ports.length > 0 ? ports : ['COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'COM10']);
                });
            });
        } else {
            // Linux/Mac
            return Promise.resolve(['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyACM0', '/dev/ttyACM1']);
        }
    } catch (error) {
        return Promise.resolve(['COM10']); // Fallback
    }
}

// Helper function to check project status
function getProjectStatus() {
    const buildPath = path.join('..', '.pio', 'build', currentConfig.environment);
    const status = {
        hasBuilds: false,
        lastBuild: null,
        firmwareSize: null,
        filesystemSize: null
    };

    try {
        if (fs.existsSync(buildPath)) {
            status.hasBuilds = true;

            const firmwarePath = path.join(buildPath, 'firmware.bin');
            if (fs.existsSync(firmwarePath)) {
                const stats = fs.statSync(firmwarePath);
                status.lastBuild = stats.mtime;
                status.firmwareSize = Math.round(stats.size / 1024 / 1024 * 100) / 100; // MB
            }

            const filesystemPath = path.join(buildPath, 'littlefs.bin');
            if (fs.existsSync(filesystemPath)) {
                const stats = fs.statSync(filesystemPath);
                status.filesystemSize = Math.round(stats.size / 1024 / 1024 * 100) / 100; // MB
            }
        }
    } catch (error) {
        console.error('Error checking project status:', error);
    }

    return status;
}

// Routes
app.get('/api/config', (req, res) => {
    res.json(currentConfig);
});

app.post('/api/config', (req, res) => {
    currentConfig = { ...currentConfig, ...req.body };
    res.json({ success: true, config: currentConfig });
});

app.get('/api/com-ports', async (req, res) => {
    try {
        const ports = await getComPorts();
        res.json(ports);
    } catch (error) {
        res.json(['COM10']); // Fallback
    }
});

app.get('/api/status', (req, res) => {
    const status = getProjectStatus();
    res.json(status);
});

// Build and execution endpoints
app.post('/api/execute', (req, res) => {
    const { action, config, remote } = req.body;

    // Update current config
    if (config) {
        currentConfig = { ...currentConfig, ...config };
    }

    const processId = Date.now().toString();
    res.json({ success: true, processId });

    // Execute the action (local or remote)
    if (remote && remote.enabled) {
        executeRemoteAction(action, processId, remote.serverId);
    } else {
        executeAction(action, processId);
    }
});

function executeAction(action, processId) {
    let scriptPath = '';
    let args = [];

    // Build arguments based on current config
    const buildArgs = () => {
        const baseArgs = [
            '-Environment', currentConfig.environment,
            '-ComPort', currentConfig.comPort,
            '-BaudRate', currentConfig.baudRate.toString()
        ];

        if (currentConfig.jobs > 0) {
            baseArgs.push('-Jobs', currentConfig.jobs.toString());
        }

        if (currentConfig.fastBuild) baseArgs.push('-FastBuild');
        if (currentConfig.clean) baseArgs.push('-Clean');
        if (currentConfig.verbose) baseArgs.push('-Verbose');
        if (currentConfig.filesystemOnly) baseArgs.push('-FilesystemOnly');
        if (currentConfig.skipUpload) baseArgs.push('-SkipUpload');
        if (currentConfig.monitor) baseArgs.push('-Monitor');

        return baseArgs;
    };

    switch (action) {
        case 'build':
            scriptPath = path.join('..', 'compile.ps1');
            args = [...buildArgs(), '-SkipUpload'];
            break;
        case 'upload':
            scriptPath = path.join('..', 'compile.ps1');
            args = [...buildArgs(), '-SkipBuild'];
            break;
        case 'build-upload':
            scriptPath = path.join('..', 'compile.ps1');
            args = buildArgs();
            break;
        case 'fast-build':
            scriptPath = path.join('..', 'fast_compile.ps1');
            args = buildArgs();
            break;
        case 'clean':
            scriptPath = path.join('..', 'compile.ps1');
            args = [...buildArgs(), '-Clean', '-SkipUpload'];
            break;
        case 'monitor':
            scriptPath = 'pio';
            args = ['device', 'monitor', '--port', currentConfig.comPort, '--baud', '115200'];
            break;
        case 'configure-wifi':
            scriptPath = path.join('..', 'configure_wifi.ps1');
            args = [];
            break;
        case 'configure-newton':
            scriptPath = path.join('..', 'configure_newton_m3.ps1');
            args = [];
            break;
        case 'validate-config':
            scriptPath = 'python';
            args = [path.join('..', 'validate_config.py')];
            break;
        case 'test-endpoints':
            scriptPath = path.join('..', 'test_api_endpoints.ps1');
            args = [];
            break;
        default:
            io.emit('process-error', { processId, error: 'Unknown action' });
            return;
    }

    // Determine if we need PowerShell
    const isPS1 = scriptPath.endsWith('.ps1');
    const command = isPS1 ? 'powershell' : scriptPath;
    const finalArgs = isPS1 ? ['-File', scriptPath, ...args] : args;

    // Start the process
    const process = spawn(command, finalArgs, {
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe']
    });

    activeProcesses.set(processId, process);

    io.emit('process-started', { processId, action, command: `${command} ${finalArgs.join(' ')}` });

    let outputBuffer = '';
    let errorBuffer = '';

    process.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;
        io.emit('process-output', { processId, type: 'stdout', data: output });
    });

    process.stderr.on('data', (data) => {
        const error = data.toString();
        errorBuffer += error;
        io.emit('process-output', { processId, type: 'stderr', data: error });
    });

    process.on('close', (code) => {
        activeProcesses.delete(processId);
        io.emit('process-finished', { processId, exitCode: code });

        // AI Analysis for errors
        if (code !== 0 && aiAgent.isAvailable()) {
            aiAgent.analyzeError(errorBuffer + outputBuffer, {
                action,
                config: currentConfig,
                exitCode: code
            }).then(analysis => {
                if (analysis) {
                    io.emit('ai-analysis', {
                        processId,
                        type: 'error',
                        analysis,
                        timestamp: new Date().toISOString()
                    });
                }
            }).catch(err => {
                console.error('AI error analysis failed:', err);
            });
        }
    });

    process.on('error', (error) => {
        activeProcesses.delete(processId);
        io.emit('process-error', { processId, error: error.message });
    });
}

// Remote execution function
async function executeRemoteAction(action, processId, serverId) {
    try {
        io.emit('process-started', { processId, action, command: `Remote: ${action}`, serverId });

        // Map action to remote command
        let command = '';
        const server = remoteManager.getServer(serverId);
        const workingDir = server.projectPath;

        switch (action) {
            case 'build':
                command = 'pio run';
                break;
            case 'upload':
                command = `pio run --target upload --upload-port ${currentConfig.comPort}`;
                break;
            case 'build-upload':
                command = `pio run --target upload --upload-port ${currentConfig.comPort}`;
                break;
            case 'fast-build':
                command = `pio run -j ${currentConfig.jobs || 'auto'}`;
                break;
            case 'clean':
                command = 'pio run --target clean';
                break;
            case 'monitor':
                command = `pio device monitor --port ${currentConfig.comPort} --baud 115200`;
                break;
            case 'configure-wifi':
                command = './configure_wifi.ps1';
                break;
            case 'validate-config':
                command = 'python3 validate_config.py';
                break;
            default:
                io.emit('process-error', { processId, error: 'Unknown remote action' });
                return;
        }

        // Execute command on remote server with streaming output
        await remoteManager.executeCommandStream(serverId, command, (output) => {
            io.emit('process-output', {
                processId,
                type: output.type,
                data: output.data
            });
        }, { cwd: workingDir });

        io.emit('process-finished', { processId, exitCode: 0, remote: true });

        // If this was a build, optionally download the artifacts
        if (action.includes('build') && !action.includes('upload')) {
            try {
                const remoteBuildPath = path.join(workingDir, '.pio/build', currentConfig.environment);
                const localBuildPath = path.join(__dirname, '..', '.pio', 'build', currentConfig.environment);
                
                await remoteManager.downloadBuild(serverId, remoteBuildPath, localBuildPath);
                io.emit('process-output', {
                    processId,
                    type: 'stdout',
                    data: '\n✓ Build artifacts downloaded to local machine\n'
                });
            } catch (downloadError) {
                io.emit('process-output', {
                    processId,
                    type: 'stderr',
                    data: `\nWarning: Failed to download build artifacts: ${downloadError.message}\n`
                });
            }
        }

    } catch (error) {
        io.emit('process-error', { processId, error: error.message, remote: true });
        io.emit('process-finished', { processId, exitCode: 1, remote: true });

        // AI Analysis for remote errors
        if (aiAgent.isAvailable()) {
            aiAgent.analyzeError(error.message, {
                action,
                config: currentConfig,
                remote: true,
                serverId,
                exitCode: 1
            }).then(analysis => {
                if (analysis) {
                    io.emit('ai-analysis', { 
                        processId, 
                        type: 'error', 
                        analysis,
                        remote: true,
                        timestamp: new Date().toISOString()
                    });
                }
            }).catch(err => {
                console.error('AI remote error analysis failed:', err);
            });
        }
    }
}

// Kill process endpoint
app.post('/api/kill/:processId', (req, res) => {
    const { processId } = req.params;
    const process = activeProcesses.get(processId);

    if (process) {
        process.kill();
        activeProcesses.delete(processId);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Process not found' });
    }
});

// AI Agent endpoints
app.get('/api/ai/config', (req, res) => {
    res.json(aiAgent.getConfig());
});

app.post('/api/ai/config', (req, res) => {
    try {
        aiAgent.updateConfig(req.body);
        res.json({ success: true, config: aiAgent.getConfig() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, context } = req.body;
        const response = await aiAgent.chat(message, context);
        res.json({ success: true, response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai/analyze-code', async (req, res) => {
    try {
        const { filePath, code } = req.body;
        const analysis = await aiAgent.analyzeCode(filePath, code);
        res.json({ success: true, analysis });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai/suggestions', async (req, res) => {
    try {
        const { input, projectState } = req.body;
        const suggestions = await aiAgent.getAutoSuggestions(input, projectState);
        res.json({ success: true, suggestions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ai/history', (req, res) => {
    res.json(aiAgent.getHistory());
});

app.delete('/api/ai/history', (req, res) => {
    aiAgent.clearHistory();
    res.json({ success: true });
});

// Remote Server endpoints
app.get('/api/remote/servers', (req, res) => {
    res.json(remoteManager.getServers());
});

app.get('/api/remote/status', (req, res) => {
    res.json(remoteManager.getConnectionStatus());
});

app.post('/api/remote/connect/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        await remoteManager.connect(serverId);
        res.json({ success: true, message: 'Connected successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/disconnect/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        await remoteManager.disconnect(serverId);
        res.json({ success: true, message: 'Disconnected successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/test/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const result = await remoteManager.testConnection(serverId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/execute/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const { command, cwd } = req.body;
        const result = await remoteManager.executeCommand(serverId, command, { cwd });
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/sync/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const { localPath, remotePath } = req.body;
        const result = await remoteManager.syncProject(serverId, localPath, remotePath);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/remote/info/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const info = await remoteManager.getServerInfo(serverId);
        res.json({ success: true, info });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/setup/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const results = await remoteManager.setupRemoteEnvironment(serverId);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/remote/server', async (req, res) => {
    try {
        const server = remoteManager.addServer(req.body);
        res.json({ success: true, server });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/remote/server/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const server = remoteManager.updateServer(serverId, req.body);
        res.json({ success: true, server });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/remote/server/:serverId', async (req, res) => {
    try {
        const { serverId } = req.params;
        const success = remoteManager.removeServer(serverId);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    // AI Socket handlers
    socket.on('ai-chat', async (data) => {
        try {
            const response = await aiAgent.chat(data.message, data.context);
            socket.emit('ai-response', {
                messageId: data.messageId,
                response,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            socket.emit('ai-error', {
                messageId: data.messageId,
                error: error.message
            });
        }
    });

    socket.on('ai-analyze-project', async () => {
        try {
            const projectState = {
                config: currentConfig,
                status: getProjectStatus(),
                timestamp: new Date().toISOString()
            };

            const analysis = await aiAgent.chat(
                'Analyze the current project state and provide insights and recommendations.',
                { type: 'project_analysis', projectState }
            );

            socket.emit('ai-project-analysis', { analysis, projectState });
        } catch (error) {
            socket.emit('ai-error', { error: error.message });
        }
    });

    // Remote server socket handlers
    socket.on('remote-sync', async (data) => {
        try {
            const { serverId, localPath, remotePath } = data;
            const result = await remoteManager.syncProject(serverId, localPath, remotePath);
            socket.emit('remote-sync-result', result);
        } catch (error) {
            socket.emit('remote-error', { error: error.message });
        }
    });

    socket.on('remote-execute', async (data) => {
        try {
            const { serverId, command, cwd } = data;
            await remoteManager.executeCommandStream(serverId, command, (output) => {
                socket.emit('remote-output', output);
            }, { cwd });
        } catch (error) {
            socket.emit('remote-error', { error: error.message });
        }
    });

    // Send initial data
    socket.emit('config-update', currentConfig);
    socket.emit('status-update', getProjectStatus());
    socket.emit('ai-status', {
        available: aiAgent.isAvailable(),
        config: aiAgent.getConfig()
    });
    socket.emit('remote-status', remoteManager.getConnectionStatus());
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 ESP32 Development UI Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server ready for real-time communication`);
    console.log(`🤖 AI Assistant: ${aiAgent.isAvailable() ? 'Available' : 'Configure API keys in web UI'}`);
    console.log(`🌐 Remote Servers: ${remoteManager.getServers().length} configured`);

    // Try to open browser automatically
    const open = require('child_process').spawn;
    try {
        if (os.platform() === 'win32') {
            open('start', [`http://localhost:${PORT}`], { shell: true });
        } else if (os.platform() === 'darwin') {
            open('open', [`http://localhost:${PORT}`]);
        } else {
            open('xdg-open', [`http://localhost:${PORT}`]);
        }
    } catch (error) {
        console.log(`🌐 Open your browser to http://localhost:${PORT}`);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');

    // Kill all active processes
    activeProcesses.forEach((process, processId) => {
        console.log(`   Killing process ${processId}`);
        process.kill();
    });

    // Disconnect all remote servers
    remoteManager.disconnectAll();

    server.close(() => {
        console.log('👋 Server shut down gracefully');
        process.exit(0);
    });
});
