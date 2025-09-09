// Remote Linux Server Manager for ESP32 Development
const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');

class RemoteServerManager {
    constructor() {
        this.connections = new Map();
        this.config = this.loadConfig();
        this.activeConnections = new Map();
    }

    loadConfig() {
        const configPath = path.join(__dirname, 'remote_config.json');
        try {
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (error) {
            console.log('Remote config not found, using defaults');
        }
        
        return {
            servers: [
                {
                    id: 'main_server',
                    name: 'Main Linux Server',
                    host: '94.200.149.94',
                    port: 22,
                    username: 'root',
                    keyPath: '',
                    password: '',
                    projectPath: '/home/esp32/projects',
                    enabled: true,
                    autoSync: false
                }
            ],
            defaultServer: 'main_server',
            syncOptions: {
                excludes: ['.git', 'node_modules', '.pio/build', '.vscode'],
                deleteRemote: false,
                preserveTimestamps: true
            }
        };
    }

    saveConfig() {
        const configPath = path.join(__dirname, 'remote_config.json');
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    }

    async connect(serverId) {
        const server = this.config.servers.find(s => s.id === serverId);
        if (!server) {
            throw new Error(`Server ${serverId} not found`);
        }

        const ssh = new NodeSSH();
        
        try {
            const connectConfig = {
                host: server.host,
                port: server.port,
                username: server.username
            };

            // Use SSH key if provided, otherwise password
            if (server.keyPath && fs.existsSync(server.keyPath)) {
                connectConfig.privateKeyPath = server.keyPath;
            } else if (server.password) {
                connectConfig.password = server.password;
            } else {
                throw new Error('No authentication method provided (key or password)');
            }

            await ssh.connect(connectConfig);
            this.activeConnections.set(serverId, ssh);
            
            console.log(`✓ Connected to ${server.name} (${server.host})`);
            return ssh;
        } catch (error) {
            console.error(`Failed to connect to ${server.name}:`, error.message);
            throw error;
        }
    }

    async disconnect(serverId) {
        const ssh = this.activeConnections.get(serverId);
        if (ssh) {
            ssh.dispose();
            this.activeConnections.delete(serverId);
            console.log(`✓ Disconnected from server ${serverId}`);
        }
    }

    async executeCommand(serverId, command, options = {}) {
        let ssh = this.activeConnections.get(serverId);
        
        if (!ssh) {
            ssh = await this.connect(serverId);
        }

        const server = this.config.servers.find(s => s.id === serverId);
        const workingDir = options.cwd || server.projectPath;

        try {
            const result = await ssh.execCommand(command, {
                cwd: workingDir,
                stream: 'both'
            });

            return {
                success: result.code === 0,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.code
            };
        } catch (error) {
            throw new Error(`Command execution failed: ${error.message}`);
        }
    }

    async executeCommandStream(serverId, command, outputCallback, options = {}) {
        let ssh = this.activeConnections.get(serverId);
        
        if (!ssh) {
            ssh = await this.connect(serverId);
        }

        const server = this.config.servers.find(s => s.id === serverId);
        const workingDir = options.cwd || server.projectPath;

        return new Promise((resolve, reject) => {
            ssh.exec(command, {
                cwd: workingDir,
                pty: true
            }, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }

                let exitCode = null;

                stream.on('close', (code) => {
                    exitCode = code;
                    resolve({ exitCode, success: code === 0 });
                });

                stream.on('data', (data) => {
                    outputCallback({
                        type: 'stdout',
                        data: data.toString(),
                        timestamp: new Date().toISOString()
                    });
                });

                stream.stderr.on('data', (data) => {
                    outputCallback({
                        type: 'stderr',
                        data: data.toString(),
                        timestamp: new Date().toISOString()
                    });
                });

                stream.on('error', (err) => {
                    reject(err);
                });
            });
        });
    }

    async syncProject(serverId, localPath, remotePath = null) {
        let ssh = this.activeConnections.get(serverId);
        
        if (!ssh) {
            ssh = await this.connect(serverId);
        }

        const server = this.config.servers.find(s => s.id === serverId);
        const targetPath = remotePath || server.projectPath;

        try {
            // Ensure remote directory exists
            await ssh.execCommand(`mkdir -p ${targetPath}`);

            // Upload project files
            const failed = [];
            const successful = [];

            await ssh.putDirectory(localPath, targetPath, {
                recursive: true,
                concurrency: 10,
                validate: (itemPath) => {
                    const relativePath = path.relative(localPath, itemPath);
                    
                    // Skip excluded directories/files
                    for (const exclude of this.config.syncOptions.excludes) {
                        if (relativePath.includes(exclude)) {
                            return false;
                        }
                    }
                    return true;
                },
                tick: (localPath, remotePath, error) => {
                    if (error) {
                        failed.push({ localPath, remotePath, error: error.message });
                    } else {
                        successful.push({ localPath, remotePath });
                    }
                }
            });

            return {
                success: failed.length === 0,
                successful: successful.length,
                failed: failed.length,
                errors: failed
            };
        } catch (error) {
            throw new Error(`Project sync failed: ${error.message}`);
        }
    }

    async downloadBuild(serverId, remoteBuildPath, localBuildPath) {
        let ssh = this.activeConnections.get(serverId);
        
        if (!ssh) {
            ssh = await this.connect(serverId);
        }

        try {
            // Ensure local directory exists
            if (!fs.existsSync(path.dirname(localBuildPath))) {
                fs.mkdirSync(path.dirname(localBuildPath), { recursive: true });
            }

            await ssh.getDirectory(localBuildPath, remoteBuildPath, {
                recursive: true,
                concurrency: 10
            });

            return { success: true };
        } catch (error) {
            throw new Error(`Build download failed: ${error.message}`);
        }
    }

    async getServerInfo(serverId) {
        try {
            const commands = [
                'uname -a',
                'cat /etc/os-release | head -5',
                'df -h /',
                'free -h',
                'nproc',
                'which platformio || echo "PlatformIO not found"',
                'which python3 || echo "Python3 not found"',
                'uptime'
            ];

            const results = {};
            
            for (const cmd of commands) {
                const result = await this.executeCommand(serverId, cmd);
                results[cmd] = result.stdout;
            }

            return results;
        } catch (error) {
            throw new Error(`Failed to get server info: ${error.message}`);
        }
    }

    async checkProjectExists(serverId, projectPath = null) {
        const server = this.config.servers.find(s => s.id === serverId);
        const checkPath = projectPath || server.projectPath;

        try {
            const result = await this.executeCommand(serverId, `test -d ${checkPath} && echo "exists" || echo "not found"`);
            return result.stdout.trim() === 'exists';
        } catch (error) {
            return false;
        }
    }

    async setupRemoteEnvironment(serverId) {
        const setupCommands = [
            'apt update -y',
            'apt install -y python3 python3-pip curl git build-essential',
            'python3 -m pip install --upgrade pip',
            'pip3 install platformio',
            'pio --version'
        ];

        const results = [];

        for (const cmd of setupCommands) {
            try {
                const result = await this.executeCommand(serverId, cmd);
                results.push({
                    command: cmd,
                    success: result.success,
                    output: result.stdout || result.stderr
                });
            } catch (error) {
                results.push({
                    command: cmd,
                    success: false,
                    output: error.message
                });
            }
        }

        return results;
    }

    getServers() {
        return this.config.servers;
    }

    getServer(serverId) {
        return this.config.servers.find(s => s.id === serverId);
    }

    addServer(serverConfig) {
        const newServer = {
            id: serverConfig.id || `server_${Date.now()}`,
            name: serverConfig.name || 'Unknown Server',
            host: serverConfig.host,
            port: serverConfig.port || 22,
            username: serverConfig.username || 'root',
            keyPath: serverConfig.keyPath || '',
            password: serverConfig.password || '',
            projectPath: serverConfig.projectPath || '/home/esp32/projects',
            enabled: serverConfig.enabled !== false,
            autoSync: serverConfig.autoSync || false
        };

        this.config.servers.push(newServer);
        this.saveConfig();
        return newServer;
    }

    updateServer(serverId, updates) {
        const serverIndex = this.config.servers.findIndex(s => s.id === serverId);
        if (serverIndex !== -1) {
            this.config.servers[serverIndex] = { ...this.config.servers[serverIndex], ...updates };
            this.saveConfig();
            return this.config.servers[serverIndex];
        }
        throw new Error(`Server ${serverId} not found`);
    }

    removeServer(serverId) {
        const serverIndex = this.config.servers.findIndex(s => s.id === serverId);
        if (serverIndex !== -1) {
            this.disconnect(serverId); // Disconnect if connected
            this.config.servers.splice(serverIndex, 1);
            this.saveConfig();
            return true;
        }
        return false;
    }

    async testConnection(serverId) {
        try {
            await this.connect(serverId);
            const result = await this.executeCommand(serverId, 'echo "Connection test successful"');
            return {
                success: true,
                message: result.stdout,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    disconnectAll() {
        for (const [serverId, ssh] of this.activeConnections) {
            ssh.dispose();
        }
        this.activeConnections.clear();
        console.log('✓ All remote connections closed');
    }

    getConnectionStatus() {
        const status = {};
        for (const server of this.config.servers) {
            status[server.id] = {
                connected: this.activeConnections.has(server.id),
                server: {
                    name: server.name,
                    host: server.host,
                    enabled: server.enabled
                }
            };
        }
        return status;
    }
}

module.exports = RemoteServerManager;
