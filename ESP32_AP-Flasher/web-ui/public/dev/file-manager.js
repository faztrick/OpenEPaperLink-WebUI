// ESP32 Device File Manager
class DeviceFileManager {
    constructor() {
        this.currentDevice = '192.168.26.117';
        this.currentPath = '/';
        this.openTabs = new Map();
        this.activeTab = null;
        this.deviceConnected = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectToDevice();
        this.loadFileTree();
    }

    setupEventListeners() {
        // Device connection
        document.getElementById('connectDevice').addEventListener('click', () => this.connectToDevice());
        document.getElementById('deviceHost').addEventListener('change', (e) => {
            this.currentDevice = e.target.value;
            this.connectToDevice();
        });

        // File operations
        document.getElementById('refreshFiles').addEventListener('click', () => this.loadFileTree());
        document.getElementById('newFile').addEventListener('click', () => this.showNewFileModal());
        document.getElementById('saveFile').addEventListener('click', () => this.saveCurrentFile());
        document.getElementById('downloadFile').addEventListener('click', () => this.downloadCurrentFile());
        document.getElementById('deleteFile').addEventListener('click', () => this.deleteCurrentFile());

        // Search
        document.getElementById('searchFiles').addEventListener('input', (e) => this.searchFiles(e.target.value));

        // Code editor
        document.getElementById('codeEditor').addEventListener('input', () => this.markTabModified());

        // New file modal
        document.getElementById('createFileBtn').addEventListener('click', () => this.createNewFile());

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                modal.style.display = 'none';
            });
        });
    }

    async connectToDevice() {
        const statusEl = document.getElementById('deviceStatus');
        statusEl.className = 'status-indicator status-disconnected';

        try {
            // Test connection by listing files
            const response = await fetch(`/api/device-files/list?host=${this.currentDevice}&dir=/`);
            const data = await response.json();

            if (data.success) {
                this.deviceConnected = true;
                statusEl.className = 'status-indicator status-connected';
                this.showMessage('Connected to device', 'success');
                this.loadFileTree();
            } else {
                throw new Error(data.error || 'Connection failed');
            }
        } catch (error) {
            this.deviceConnected = false;
            this.showMessage(`Failed to connect: ${error.message}`, 'error');
            console.error('Device connection failed:', error);
        }
    }

    async loadFileTree(path = '/') {
        const treeEl = document.getElementById('fileTree');
        treeEl.innerHTML = '<div class="loading">Loading files...</div>';

        try {
            const response = await fetch(`/api/device-files/list?host=${this.currentDevice}&dir=${encodeURIComponent(path)}`);
            const data = await response.json();

            if (data.success && data.files) {
                this.renderFileTree(data.files, path);
                document.getElementById('currentPath').textContent = path;
                this.currentPath = path;
            } else {
                throw new Error(data.error || 'Failed to load files');
            }
        } catch (error) {
            treeEl.innerHTML = `<div class="error">Error loading files: ${error.message}</div>`;
            this.showMessage(`Error loading files: ${error.message}`, 'error');
        }
    }

    renderFileTree(files, currentPath) {
        const treeEl = document.getElementById('fileTree');
        treeEl.innerHTML = '';

        // Add parent directory link if not at root
        if (currentPath !== '/') {
            const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
            const parentItem = this.createFileItem('..', 'parent', true, parentPath);
            treeEl.appendChild(parentItem);
        }

        // Sort files: directories first, then files
        files.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        files.forEach(file => {
            const item = this.createFileItem(file.name, file.isDirectory ? 'folder' : 'file', file.isDirectory, file.path);
            treeEl.appendChild(item);
        });
    }

    createFileItem(name, type, isDirectory, path) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.dataset.path = path;
        item.dataset.isDirectory = isDirectory;

        const icon = document.createElement('i');
        icon.className = isDirectory ? 'fas fa-folder file-icon' : this.getFileIcon(name);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;

        item.appendChild(icon);
        item.appendChild(nameSpan);

        item.addEventListener('click', () => {
            if (isDirectory) {
                this.loadFileTree(path);
            } else {
                this.openFile(path);
            }
        });

        return item;
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'html': 'fab fa-html5 file-icon',
            'css': 'fab fa-css3-alt file-icon',
            'js': 'fab fa-js-square file-icon',
            'json': 'fas fa-file-code file-icon',
            'txt': 'fas fa-file-alt file-icon',
            'md': 'fab fa-markdown file-icon',
            'log': 'fas fa-file-alt file-icon',
            'cfg': 'fas fa-cog file-icon',
            'ini': 'fas fa-cog file-icon'
        };
        return iconMap[ext] || 'fas fa-file file-icon';
    }

    async openFile(path) {
        try {
            const response = await fetch(`/api/device-files/read?host=${this.currentDevice}&path=${encodeURIComponent(path)}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                this.openTab(path, data.content);
            } else {
                throw new Error(data.error || 'Failed to read file');
            }
        } catch (error) {
            this.showMessage(`Error reading file: ${error.message}`, 'error');
        }
    }

    openTab(path, content) {
        const fileName = path.split('/').pop();
        const tabId = path;

        // Check if tab is already open
        if (this.openTabs.has(tabId)) {
            this.switchToTab(tabId);
            return;
        }

        // Create new tab
        this.openTabs.set(tabId, {
            path,
            fileName,
            content,
            originalContent: content,
            modified: false
        });

        this.renderTabs();
        this.switchToTab(tabId);
    }

    renderTabs() {
        const tabsEl = document.getElementById('fileTabs');
        tabsEl.innerHTML = '';

        this.openTabs.forEach((tab, tabId) => {
            const tabEl = document.createElement('div');
            tabEl.className = `file-tab ${tabId === this.activeTab ? 'active' : ''}`;
            tabEl.dataset.tabId = tabId;

            const icon = document.createElement('i');
            icon.className = this.getFileIcon(tab.fileName);

            const name = document.createElement('span');
            name.textContent = tab.fileName + (tab.modified ? ' *' : '');

            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-btn';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tabId);
            });

            tabEl.appendChild(icon);
            tabEl.appendChild(name);
            tabEl.appendChild(closeBtn);

            tabEl.addEventListener('click', () => this.switchToTab(tabId));
            tabsEl.appendChild(tabEl);
        });
    }

    switchToTab(tabId) {
        if (!this.openTabs.has(tabId)) return;

        this.activeTab = tabId;
        const tab = this.openTabs.get(tabId);

        // Update editor
        const editor = document.getElementById('codeEditor');
        editor.value = tab.content;

        // Update file info
        document.getElementById('fileName').textContent = tab.fileName;
        document.getElementById('fileSize').textContent = `${tab.content.length} chars`;

        // Show editor
        document.getElementById('fileEditor').style.display = 'flex';
        document.getElementById('welcomeMessage').style.display = 'none';

        // Enable buttons
        document.getElementById('saveFile').disabled = !tab.modified;
        document.getElementById('downloadFile').disabled = false;
        document.getElementById('deleteFile').disabled = false;

        this.renderTabs();
    }

    closeTab(tabId) {
        const tab = this.openTabs.get(tabId);

        if (tab && tab.modified) {
            if (!confirm(`File ${tab.fileName} has unsaved changes. Close anyway?`)) {
                return;
            }
        }

        this.openTabs.delete(tabId);

        if (this.activeTab === tabId) {
            // Switch to another tab or show welcome
            const remainingTabs = Array.from(this.openTabs.keys());
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[0]);
            } else {
                this.activeTab = null;
                document.getElementById('fileEditor').style.display = 'none';
                document.getElementById('welcomeMessage').style.display = 'block';
            }
        }

        this.renderTabs();
    }

    markTabModified() {
        if (!this.activeTab) return;

        const tab = this.openTabs.get(this.activeTab);
        const editor = document.getElementById('codeEditor');

        tab.content = editor.value;
        tab.modified = tab.content !== tab.originalContent;

        document.getElementById('saveFile').disabled = !tab.modified;
        this.renderTabs();
    }

    async saveCurrentFile() {
        if (!this.activeTab) return;

        const tab = this.openTabs.get(this.activeTab);
        const saveBtn = document.getElementById('saveFile');

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            const response = await fetch('/api/device-files/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: this.currentDevice,
                    path: tab.path,
                    content: tab.content
                })
            });

            const data = await response.json();

            if (data.success) {
                tab.originalContent = tab.content;
                tab.modified = false;
                this.showMessage('File saved successfully', 'success');
                this.renderTabs();
            } else {
                throw new Error(data.error || 'Save failed');
            }
        } catch (error) {
            this.showMessage(`Error saving file: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        }
    }

    downloadCurrentFile() {
        if (!this.activeTab) return;

        const tab = this.openTabs.get(this.activeTab);
        const blob = new Blob([tab.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = tab.fileName;
        a.click();

        URL.revokeObjectURL(url);
    }

    async deleteCurrentFile() {
        if (!this.activeTab) return;

        const tab = this.openTabs.get(this.activeTab);

        if (!confirm(`Are you sure you want to delete ${tab.fileName}?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/device-files/delete?host=${this.currentDevice}&path=${encodeURIComponent(tab.path)}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.closeTab(this.activeTab);
                this.loadFileTree(this.currentPath);
                this.showMessage('File deleted successfully', 'success');
            } else {
                throw new Error(data.error || 'Delete failed');
            }
        } catch (error) {
            this.showMessage(`Error deleting file: ${error.message}`, 'error');
        }
    }

    showNewFileModal() {
        document.getElementById('newFileModal').style.display = 'flex';
        document.getElementById('newFileName').focus();
    }

    async createNewFile() {
        const fileName = document.getElementById('newFileName').value.trim();
        const template = document.getElementById('fileTemplate').value;

        if (!fileName) {
            this.showMessage('Please enter a file name', 'error');
            return;
        }

        const filePath = `${this.currentPath}/${fileName}`.replace('//', '/');
        const content = this.getFileTemplate(template);

        try {
            const response = await fetch('/api/device-files/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: this.currentDevice,
                    path: filePath,
                    content: content
                })
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('newFileModal').style.display = 'none';
                document.getElementById('newFileName').value = '';
                this.loadFileTree(this.currentPath);
                this.openFile(filePath);
                this.showMessage('File created successfully', 'success');
            } else {
                throw new Error(data.error || 'Create failed');
            }
        } catch (error) {
            this.showMessage(`Error creating file: ${error.message}`, 'error');
        }
    }

    getFileTemplate(type) {
        const templates = {
            'html': '<!DOCTYPE html>\n<html>\n<head>\n    <title>New Page</title>\n</head>\n<body>\n    <h1>Hello World</h1>\n</body>\n</html>',
            'css': '/* New stylesheet */\nbody {\n    font-family: Arial, sans-serif;\n    margin: 0;\n    padding: 20px;\n}',
            'js': '// New JavaScript file\nconsole.log("Hello from ESP32!");',
            'json': '{\n    "name": "config",\n    "version": "1.0.0"\n}',
            'txt': ''
        };
        return templates[type] || '';
    }

    searchFiles(query) {
        const items = document.querySelectorAll('.file-item');
        items.forEach(item => {
            const name = item.textContent.toLowerCase();
            const matches = name.includes(query.toLowerCase());
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    showMessage(message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            padding: 12px 20px; border-radius: 4px; color: white;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// Initialize the file manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.fileManager = new DeviceFileManager();
});

// Modal helper function
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}
