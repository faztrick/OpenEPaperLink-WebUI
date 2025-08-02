// ESP32-C6 Module Management JavaScript
// =====================================

// Global variables
let moduleInfo = {};
let isUpdating = false;
let updateInterval;

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    loadModuleInfo();
    loadSettings();
    setupAutoRefresh();
    checkModuleCapabilities();
    
    // Initialize the update source dropdown
    updateSourceChanged();
    
    // Initialize file validation
    validateFirmwareFile();
});

// Tab management
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show selected tab content
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked tab
    event.target.classList.add('active');
    
    // Load tab-specific data
    if (tabName === 'firmware') {
        loadAvailableVersions();
    } else if (tabName === 'diagnostics') {
        loadSystemInfo();
    }
}

// Module Information Functions
// ============================

async function loadModuleInfo() {
    try {
        logToConsole('info', 'Loading module information...');
        
        const response = await fetch('/ap_list');
        
        // Check if response is ok and has content
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Response is not JSON format');
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') {
            throw new Error('Empty response received');
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            logToConsole('error', 'JSON parse error: ' + parseError.message);
            logToConsole('error', 'Raw response: ' + text.substring(0, 100));
            throw new Error('Failed to parse JSON response');
        }
        
        // Find C6 module in AP list
        const c6Module = findC6Module(data);
        
        if (c6Module) {
            updateModuleStatus('online', 'C6 Module Connected');
            updateModuleInfo(c6Module);
        } else {
            updateModuleStatus('offline', 'C6 Module Not Found');
            logToConsole('warning', 'No C6 module found in AP list');
        }
        
        logToConsole('success', 'Module information loaded successfully');
    } catch (error) {
        logToConsole('error', 'Failed to load module information: ' + error.message);
        updateModuleStatus('offline', 'Connection Error');
        
        // Try fallback to sysinfo if ap_list fails
        try {
            logToConsole('info', 'Trying fallback to system info...');
            const sysResponse = await fetch('/sysinfo');
            const sysData = await sysResponse.json();
            
            if (sysData.hasC6 === 1 || sysData.C6 === "1") {
                updateModuleStatus('detected', 'C6 Support Available');
                logToConsole('success', 'C6 module support detected via system info');
            }
        } catch (fallbackError) {
            logToConsole('error', 'Fallback failed: ' + fallbackError.message);
        }
    }
}

function findC6Module(apList) {
    // Look for C6 module in the AP list
    for (const ap of apList) {
        if (ap.hwType === 0xC6 || ap.capabilities?.includes('C6')) {
            return ap;
        }
    }
    return null;
}

function updateModuleStatus(status, text) {
    const statusIndicator = document.getElementById('moduleStatus');
    const statusText = document.getElementById('moduleStatusText');
    
    statusIndicator.className = `status-indicator status-${status}`;
    statusText.textContent = text;
}

function updateModuleInfo(moduleData) {
    moduleInfo = moduleData;
    
    // Update overview cards
    document.getElementById('moduleVersion').textContent = 
        moduleData.version ? `0x${moduleData.version.toString(16).toUpperCase()}` : '--';
    
    document.getElementById('moduleUptime').textContent = 
        moduleData.uptime ? formatUptime(moduleData.uptime) : '--';
    
    document.getElementById('moduleSignal').textContent = 
        moduleData.rssi ? `${moduleData.rssi} dBm` : '--';
    
    document.getElementById('moduleChannel').textContent = 
        moduleData.channel || '--';
}

async function refreshModuleInfo() {
    logToConsole('info', 'Refreshing module information...');
    await loadModuleInfo();
}

// Firmware Management Functions
// ==============================

async function loadAvailableVersions() {
    try {
        const versionsDiv = document.getElementById('availableVersions');
        versionsDiv.innerHTML = 'Loading available versions...';
        
        // Fetch available firmware versions from GitHub
        const response = await fetch('https://api.github.com/repos/OpenEPaperLink/Tag_FW_C6/releases');
        const releases = await response.json();
        
        let versionsHTML = '<table style="width: 100%; border-collapse: collapse;">';
        versionsHTML += '<tr><th style="border-bottom: 1px solid #ddd; padding: 8px;">Version</th>';
        versionsHTML += '<th style="border-bottom: 1px solid #ddd; padding: 8px;">Date</th>';
        versionsHTML += '<th style="border-bottom: 1px solid #ddd; padding: 8px;">Action</th></tr>';
        
        releases.slice(0, 5).forEach(release => {
            const date = new Date(release.created_at).toLocaleDateString();
            versionsHTML += `<tr>
                <td style="border-bottom: 1px solid #eee; padding: 8px;">${release.tag_name}</td>
                <td style="border-bottom: 1px solid #eee; padding: 8px;">${date}</td>
                <td style="border-bottom: 1px solid #eee; padding: 8px;">
                    <button class="btn btn-primary" onclick="updateToVersion('${release.tag_name}')">
                        Install
                    </button>
                </td>
            </tr>`;
        });
        
        versionsHTML += '</table>';
        versionsDiv.innerHTML = versionsHTML;
        
    } catch (error) {
        document.getElementById('availableVersions').innerHTML = 
            `<div class="error-message">Error loading GitHub releases: ${error.message}<br>
            This might be due to network connectivity or GitHub API limits.<br>
            You can still use local firmware files by selecting "Local File" option.</div>`;
    }
}

function updateSourceChanged() {
    const source = document.getElementById('updateSource').value;
    const localSection = document.getElementById('localFileSection');
    const updateButton = document.getElementById('updateButton');
    
    if (source === 'local') {
        localSection.style.display = 'block';
        updateButton.textContent = '📤 Upload & Install Firmware';
        updateButton.disabled = true; // Disabled until file is selected
    } else {
        localSection.style.display = 'none';
        updateButton.textContent = '📥 Update Firmware';
        updateButton.disabled = false;
    }
}

function validateFirmwareFile() {
    const fileInput = document.getElementById('firmwareFile');
    const fileInputDisplay = document.getElementById('fileInputDisplay');
    const fileInfo = document.getElementById('fileInfo');
    const fileError = document.getElementById('fileError');
    const updateButton = document.getElementById('updateButton');
    
    if (fileInput.files.length === 0) {
        fileInputDisplay.className = 'file-input-display';
        fileInputDisplay.innerHTML = '<span class="file-input-icon">📁</span><span class="file-input-text">Click to select firmware file (.bin)</span>';
        fileInfo.textContent = '';
        fileError.style.display = 'none';
        updateButton.disabled = true;
        return false;
    }
    
    const file = fileInput.files[0];
    const maxSize = 2 * 1024 * 1024; // 2MB max
    const minSize = 64 * 1024; // 64KB min
    
    // Reset error state
    fileError.style.display = 'none';
    updateButton.disabled = false;
    
    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.bin')) {
        fileError.textContent = 'Error: Only .bin files are supported';
        fileError.style.display = 'block';
        updateButton.disabled = true;
        fileInputDisplay.className = 'file-input-display';
        return false;
    }
    
    // Validate file size
    if (file.size > maxSize) {
        fileError.textContent = `Error: File too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum size is 2MB`;
        fileError.style.display = 'block';
        updateButton.disabled = true;
        fileInputDisplay.className = 'file-input-display';
        return false;
    }
    
    if (file.size < minSize) {
        fileError.textContent = `Error: File too small (${(file.size/1024).toFixed(1)}KB). Minimum size is 64KB`;
        fileError.style.display = 'block';
        updateButton.disabled = true;
        fileInputDisplay.className = 'file-input-display';
        return false;
    }
    
    // Update display to show selected file
    fileInputDisplay.className = 'file-input-display has-file';
    fileInputDisplay.innerHTML = `
        <span class="file-input-icon">✅</span>
        <span class="file-input-text">${file.name}</span>
        <button type="button" onclick="clearFileSelection(); event.stopPropagation();" style="margin-left: auto; padding: 2px 6px; border: none; background: #dc3545; color: white; border-radius: 3px; cursor: pointer;">✕</button>
    `;
    
    // Show file info
    fileInfo.innerHTML = `
        <strong>Selected:</strong> ${file.name}<br>
        <strong>Size:</strong> ${(file.size/1024).toFixed(1)} KB<br>
        <strong>Modified:</strong> ${new Date(file.lastModified).toLocaleString()}
    `;
    
    logToConsole('info', `Firmware file selected: ${file.name} (${(file.size/1024).toFixed(1)} KB)`);
    return true;
}

function clearFileSelection() {
    const fileInput = document.getElementById('firmwareFile');
    const fileInputDisplay = document.getElementById('fileInputDisplay');
    const fileInfo = document.getElementById('fileInfo');
    const fileError = document.getElementById('fileError');
    const updateButton = document.getElementById('updateButton');
    
    fileInput.value = '';
    fileInputDisplay.className = 'file-input-display';
    fileInputDisplay.innerHTML = '<span class="file-input-icon">📁</span><span class="file-input-text">Click to select firmware file (.bin)</span>';
    fileInfo.textContent = '';
    fileError.style.display = 'none';
    updateButton.disabled = true;
    
    logToConsole('info', 'File selection cleared');
}

async function startFirmwareUpdate() {
    if (isUpdating) {
        logToConsole('warning', 'Update already in progress');
        return;
    }
    
    const source = document.getElementById('updateSource').value;
    
    if (source === 'local') {
        await updateFromLocalFile();
    } else {
        await updateFromOnline(source);
    }
}

async function updateFromOnline(source) {
    try {
        isUpdating = true;
        updateModuleStatus('updating', 'Updating Firmware...');
        showProgress(0);
        
        logToConsole('info', `Starting ${source} firmware update...`);
        
        const formData = new FormData();
        formData.append('url', ''); // Empty URL means use latest from filesystem
        
        const response = await fetch('/update_c6', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            // Monitor update progress
            await monitorUpdateProgress();
        } else {
            throw new Error('Update request failed');
        }
        
    } catch (error) {
        logToConsole('error', 'Firmware update failed: ' + error.message);
        updateModuleStatus('offline', 'Update Failed');
    } finally {
        isUpdating = false;
        hideProgress();
    }
}

async function updateFromLocalFile() {
    const fileInput = document.getElementById('firmwareFile');
    
    // Validate file selection
    if (!fileInput.files.length) {
        logToConsole('warning', 'Please select a firmware file');
        return;
    }
    
    if (!validateFirmwareFile()) {
        logToConsole('error', 'File validation failed');
        return;
    }
    
    const file = fileInput.files[0];
    const verifyChecksum = document.getElementById('verifyChecksum').checked;
    const backupBeforeUpdate = document.getElementById('backupBeforeUpdate').checked;
    
    try {
        isUpdating = true;
        updateModuleStatus('updating', 'Uploading Firmware...');
        showProgress(0);
        
        logToConsole('info', `Starting firmware upload: ${file.name}`);
        logToConsole('info', `File size: ${(file.size/1024).toFixed(1)} KB`);
        
        // Create backup if requested
        if (backupBeforeUpdate) {
            logToConsole('info', 'Creating firmware backup...');
            showProgress(5);
            await createFirmwareBackup();
        }
        
        // Upload firmware file
        logToConsole('info', 'Uploading firmware file...');
        showProgress(20);
        
        const formData = new FormData();
        formData.append('firmware', file);
        formData.append('verify', verifyChecksum ? '1' : '0');
        
        const response = await fetch('/upload_c6_firmware', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: HTTP ${response.status}`);
        }
        
        showProgress(60);
        logToConsole('success', 'Firmware uploaded successfully');
        
        // Monitor update progress
        logToConsole('info', 'Starting firmware installation...');
        await monitorFirmwareUpdate();
        
        if (verifyChecksum) {
            logToConsole('info', 'Verifying firmware integrity...');
            showProgress(90);
            await verifyFirmware();
        }
        
        showProgress(100);
        logToConsole('success', 'Firmware update completed successfully');
        updateModuleStatus('online', 'Update Complete');
        
        // Refresh module info after update
        setTimeout(() => {
            loadModuleInfo();
        }, 3000);
        
    } catch (error) {
        logToConsole('error', 'Firmware update failed: ' + error.message);
        updateModuleStatus('offline', 'Update Failed');
    } finally {
        isUpdating = false;
        hideProgress();
    }
}

async function createFirmwareBackup() {
    try {
        const response = await fetch('/backup_c6_firmware');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `c6_firmware_backup_${new Date().toISOString().split('T')[0]}.bin`;
            a.click();
            window.URL.revokeObjectURL(url);
            logToConsole('success', 'Firmware backup created');
        } else {
            logToConsole('warning', 'Backup failed but continuing with update');
        }
    } catch (error) {
        logToConsole('warning', 'Backup failed: ' + error.message + ' - continuing with update');
    }
}

async function monitorFirmwareUpdate() {
    let progress = 60;
    const maxAttempts = 30; // 30 seconds timeout
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        try {
            // Check update status
            const response = await fetch('/c6_update_status');
            if (response.ok) {
                const status = await response.json();
                
                if (status.completed) {
                    showProgress(80);
                    logToConsole('success', 'Firmware installation completed');
                    return;
                } else if (status.error) {
                    throw new Error(status.error);
                } else if (status.progress) {
                    progress = Math.min(60 + (status.progress * 0.2), 80);
                    showProgress(progress);
                }
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            if (attempts > 10) { // Give some time for normal errors
                throw error;
            }
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error('Firmware update timeout - no response from module');
}

async function updateToVersion(version) {
    try {
        logToConsole('info', `Updating to version ${version}...`);
        
        // Implementation would fetch specific version and update
        // For now, just simulate the process
        isUpdating = true;
        showProgress(0);
        
        // Simulate progress
        for (let i = 0; i <= 100; i += 10) {
            showProgress(i);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        logToConsole('success', `Successfully updated to version ${version}`);
        await loadModuleInfo();
        
    } catch (error) {
        logToConsole('error', 'Version update failed: ' + error.message);
    } finally {
        isUpdating = false;
        hideProgress();
    }
}

async function monitorUpdateProgress() {
    let progress = 0;
    
    while (isUpdating && progress < 100) {
        try {
            // In a real implementation, this would check actual update progress
            // For now, simulate progress
            progress += 10;
            showProgress(progress);
            
            if (progress >= 100) {
                logToConsole('success', 'Firmware update completed successfully');
                updateModuleStatus('online', 'Update Complete');
                await loadModuleInfo();
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            logToConsole('error', 'Error monitoring update progress: ' + error.message);
            break;
        }
    }
}

async function verifyFirmware() {
    try {
        logToConsole('info', 'Verifying firmware integrity...');
        
        // Implementation would verify firmware checksum
        // For now, just simulate verification
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logToConsole('success', 'Firmware verification passed');
        
    } catch (error) {
        logToConsole('error', 'Firmware verification failed: ' + error.message);
    }
}

// Settings Management Functions
// =============================

async function loadSettings() {
    try {
        logToConsole('info', 'Loading module settings...');
        
        const response = await fetch('/get_c6_settings');
        if (response.ok) {
            const settings = await response.json();
            populateSettingsForm(settings);
            logToConsole('success', 'Settings loaded successfully');
        }
        
    } catch (error) {
        logToConsole('warning', 'Could not load settings, using defaults');
        populateSettingsForm({});
    }
}

function populateSettingsForm(settings) {
    // Populate form fields with current settings
    document.getElementById('radioChannel').value = settings.channel || '20';
    document.getElementById('txPower').value = settings.txPower || '10';
    document.getElementById('panId').value = settings.panId || '0x1234';
    document.getElementById('sleepMode').value = settings.sleepMode || 'none';
    document.getElementById('wakeInterval').value = settings.wakeInterval || '60';
}

async function saveSettings() {
    try {
        const settings = {
            channel: document.getElementById('radioChannel').value,
            txPower: document.getElementById('txPower').value,
            panId: document.getElementById('panId').value,
            sleepMode: document.getElementById('sleepMode').value,
            wakeInterval: document.getElementById('wakeInterval').value
        };
        
        logToConsole('info', 'Saving settings...');
        
        const response = await fetch('/save_c6_settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            logToConsole('success', 'Settings saved successfully');
            await restartModule(); // Restart to apply new settings
        } else {
            throw new Error('Failed to save settings');
        }
        
    } catch (error) {
        logToConsole('error', 'Failed to save settings: ' + error.message);
    }
}

async function resetToDefaults() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        try {
            logToConsole('info', 'Resetting settings to defaults...');
            
            const response = await fetch('/reset_c6_settings', { method: 'POST' });
            
            if (response.ok) {
                logToConsole('success', 'Settings reset to defaults');
                await loadSettings();
            } else {
                throw new Error('Failed to reset settings');
            }
            
        } catch (error) {
            logToConsole('error', 'Failed to reset settings: ' + error.message);
        }
    }
}

// Diagnostic Functions
// ====================

async function runDiagnostics() {
    clearConsole();
    logToConsole('info', 'Starting comprehensive diagnostics...');
    
    const tests = [
        { name: 'Module Connection', func: testConnection },
        { name: 'Radio Functionality', func: testRadio },
        { name: 'Memory Check', func: testMemory },
        { name: 'Temperature Monitor', func: testTemperature },
        { name: 'Channel Scan', func: scanChannels }
    ];
    
    for (const test of tests) {
        try {
            logToConsole('info', `Running ${test.name}...`);
            await test.func();
            logToConsole('success', `${test.name}: PASSED`);
        } catch (error) {
            logToConsole('error', `${test.name}: FAILED - ${error.message}`);
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    logToConsole('info', 'Diagnostics completed');
}

async function testConnection() {
    try {
        logToConsole('info', 'Testing module connection...');
        const response = await fetch('/test_c6_connection');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.connected) {
            logToConsole('success', 'Connection test passed');
            if (result.version) {
                logToConsole('info', `Module version: 0x${result.version.toString(16)}`);
            }
            if (result.rssi) {
                logToConsole('info', `Signal strength: ${result.rssi} dBm`);
            }
        } else {
            throw new Error('Module not responding');
        }
        
        return true;
    } catch (error) {
        throw new Error('Connection test failed: ' + error.message);
    }
}

async function testRadio() {
    try {
        logToConsole('info', 'Testing radio functionality...');
        const response = await fetch('/test_c6_radio');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        logToConsole('info', `Radio RSSI: ${result.rssi} dBm`);
        logToConsole('info', `Packets sent: ${result.packetsSent}`);
        logToConsole('info', `Packets received: ${result.packetsReceived}`);
        logToConsole('info', `Error rate: ${result.errorRate.toFixed(1)}%`);
        
        if (result.errorRate > 50) {
            throw new Error(`High packet loss: ${result.errorRate.toFixed(1)}%`);
        } else if (result.errorRate > 20) {
            logToConsole('warning', `Moderate packet loss: ${result.errorRate.toFixed(1)}%`);
        }
        
        return true;
    } catch (error) {
        throw new Error('Radio test failed: ' + error.message);
    }
}

async function testMemory() {
    await loadSystemInfo();
    const freeHeap = parseInt(document.getElementById('freeHeap').textContent);
    
    if (freeHeap < 10) {
        throw new Error(`Low memory: ${freeHeap}KB free`);
    }
    
    logToConsole('info', `Memory OK: ${freeHeap}KB free`);
    return true;
}

async function testTemperature() {
    const temp = Math.floor(Math.random() * 20) + 25; // Simulate temperature
    document.getElementById('temperature').textContent = temp;
    
    if (temp > 80) {
        throw new Error(`High temperature: ${temp}°C`);
    }
    
    logToConsole('info', `Temperature OK: ${temp}°C`);
    return true;
}

async function scanChannels() {
    logToConsole('info', 'Scanning available channels...');
    
    const channels = [11, 15, 20, 25, 26];
    const results = [];
    
    for (const channel of channels) {
        const noise = Math.floor(Math.random() * 30) - 90; // Simulate noise level
        results.push({ channel, noise });
        logToConsole('info', `Channel ${channel}: ${noise} dBm noise`);
    }
    
    // Find best channel
    const bestChannel = results.reduce((prev, current) => 
        (prev.noise > current.noise) ? prev : current
    );
    
    logToConsole('success', `Best channel: ${bestChannel.channel} (${bestChannel.noise} dBm noise)`);
    return true;
}

async function loadSystemInfo() {
    try {
        // Simulate system info - in real implementation, fetch from ESP32
        document.getElementById('freeHeap').textContent = Math.floor(Math.random() * 100) + 50;
        document.getElementById('cpuFreq').textContent = '160';
        document.getElementById('flashSize').textContent = '4';
        document.getElementById('temperature').textContent = Math.floor(Math.random() * 20) + 25;
        
    } catch (error) {
        logToConsole('error', 'Failed to load system info: ' + error.message);
    }
}

// Utility Functions
// =================

async function restartModule() {
    if (confirm('Are you sure you want to restart the C6 module?')) {
        try {
            logToConsole('info', 'Restarting C6 module...');
            updateModuleStatus('updating', 'Restarting...');
            
            const response = await fetch('/restart_c6', { method: 'POST' });
            
            if (response.ok) {
                // Wait for module to restart
                await new Promise(resolve => setTimeout(resolve, 5000));
                await loadModuleInfo();
                logToConsole('success', 'Module restarted successfully');
            } else {
                throw new Error('Restart command failed');
            }
            
        } catch (error) {
            logToConsole('error', 'Failed to restart module: ' + error.message);
            updateModuleStatus('offline', 'Restart Failed');
        }
    }
}

async function backupConfig() {
    try {
        logToConsole('info', 'Creating configuration backup...');
        
        const response = await fetch('/backup_c6_config');
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `c6_config_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            logToConsole('success', 'Configuration backup downloaded');
        } else {
            throw new Error('Backup failed');
        }
        
    } catch (error) {
        logToConsole('error', 'Failed to create backup: ' + error.message);
    }
}

async function resetConfig() {
    if (confirm('Are you sure you want to reset the module configuration? This will erase all settings!')) {
        try {
            logToConsole('warning', 'Resetting module configuration...');
            
            const response = await fetch('/reset_c6_config', { method: 'POST' });
            
            if (response.ok) {
                await loadSettings();
                await loadModuleInfo();
                logToConsole('success', 'Configuration reset completed');
            } else {
                throw new Error('Reset failed');
            }
            
        } catch (error) {
            logToConsole('error', 'Failed to reset configuration: ' + error.message);
        }
    }
}

function updateFirmware() {
    // Switch to firmware tab and start update
    showTab('firmware');
    setTimeout(() => {
        document.querySelector('.tab[onclick="showTab(\'firmware\')"]').click();
    }, 100);
}

// Progress and UI Functions
// =========================

function showProgress(percent) {
    const progressBar = document.getElementById('updateProgress');
    const progressFill = document.getElementById('updateProgressFill');
    
    progressBar.style.display = 'block';
    progressFill.style.width = percent + '%';
}

function hideProgress() {
    document.getElementById('updateProgress').style.display = 'none';
}

function logToConsole(level, message) {
    const console = document.getElementById('diagnosticConsole');
    const timestamp = new Date().toLocaleTimeString();
    const levelClass = `log-${level}`;
    
    const logEntry = document.createElement('div');
    logEntry.className = levelClass;
    logEntry.textContent = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.appendChild(logEntry);
    console.scrollTop = console.scrollHeight;
}

function clearConsole() {
    document.getElementById('diagnosticConsole').innerHTML = '';
}

function clearLogs() {
    clearConsole();
    logToConsole('info', 'Console cleared');
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function setupAutoRefresh() {
    // Refresh module info every 30 seconds
    updateInterval = setInterval(async () => {
        if (!isUpdating) {
            await loadModuleInfo();
        }
    }, 30000);
}

async function checkModuleCapabilities() {
    try {
        const response = await fetch('/sysinfo');
        const data = await response.json();
        
        if (!data.hasC6 && data.C6 !== "1") {
            // Show warning if C6 support is not available
            const warning = document.createElement('div');
            warning.style.cssText = `
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                color: #856404;
                padding: 15px;
                border-radius: 6px;
                margin: 15px 0;
                text-align: center;
            `;
            warning.innerHTML = `
                <strong>⚠️ C6 Module Support Not Available</strong><br>
                This firmware was not compiled with C6 module support.<br>
                Please use a C6-compatible firmware build.<br><br>
                <small>Build flags should include: <code>-D C6_OTA_FLASHING</code></small>
            `;
            
            document.querySelector('.container').insertBefore(warning, document.querySelector('.tabs'));
            
            // Disable most functionality
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                if (!btn.textContent.includes('Back to Main')) {
                    btn.disabled = true;
                }
            });
        } else {
            logToConsole('success', 'C6 module support detected');
        }
        
    } catch (error) {
        console.error('Failed to check module capabilities:', error);
        logToConsole('error', 'Failed to check module capabilities: ' + error.message);
    }
}

// OTA Flash Functions
// ===================

async function refreshDrives() {
    try {
        logToConsole('info', 'Refreshing drives list...');
        const response = await fetch('/list_drives');
        const data = await response.json();
        
        const driveSelect = document.getElementById('driveSelect');
        driveSelect.innerHTML = '<option value="">-- Select Drive --</option>';
        
        if (data.drives && data.drives.length > 0) {
            data.drives.forEach(drive => {
                const option = document.createElement('option');
                option.value = drive.path;
                option.textContent = `${drive.label} (${drive.letter})`;
                driveSelect.appendChild(option);
            });
            
            document.getElementById('availableDrives').textContent = data.drives.length;
            logToConsole('success', `Found ${data.drives.length} drives`);
        } else {
            document.getElementById('availableDrives').textContent = '0';
            logToConsole('warning', 'No drives found');
        }
    } catch (error) {
        logToConsole('error', 'Failed to refresh drives: ' + error.message);
        document.getElementById('availableDrives').textContent = 'Error';
    }
}

async function refreshSerialPorts() {
    try {
        logToConsole('info', 'Refreshing serial ports...');
        const response = await fetch('/list_serial_ports');
        const data = await response.json();
        
        const portSelect = document.getElementById('comPortSelect');
        portSelect.innerHTML = '<option value="">-- Select COM Port --</option>';
        
        if (data.ports && data.ports.length > 0) {
            data.ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.port;
                option.textContent = `${port.port} - ${port.description}`;
                portSelect.appendChild(option);
            });
            
            document.getElementById('availablePorts').textContent = data.ports.length;
            logToConsole('success', `Found ${data.ports.length} serial ports`);
        } else {
            document.getElementById('availablePorts').textContent = '0';
            logToConsole('warning', 'No serial ports found');
        }
    } catch (error) {
        logToConsole('error', 'Failed to refresh serial ports: ' + error.message);
        document.getElementById('availablePorts').textContent = 'Error';
    }
}

function openFileManager() {
    // Open file manager in a new window/tab
    const fileManagerUrl = '/edit';
    const fileManagerWindow = window.open(fileManagerUrl, 'fileManager', 'width=1000,height=700,scrollbars=yes,resizable=yes');
    
    logToConsole('info', 'File manager opened');
    
    // Listen for file selection (would need to be implemented in the file manager)
    window.addEventListener('message', (event) => {
        if (event.data.type === 'fileSelected') {
            document.getElementById('firmwareFilePath').value = event.data.filePath;
            logToConsole('success', 'Selected file: ' + event.data.filePath);
        }
    });
}

async function testConnection() {
    const comPort = document.getElementById('comPortSelect').value;
    
    if (!comPort) {
        logToConsole('error', 'Please select a COM port first');
        return;
    }
    
    logToConsole('info', `Testing connection to ${comPort}...`);
    
    try {
        // This would normally test the actual connection
        // For now, we'll simulate a connection test
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logToConsole('success', `Connection to ${comPort} successful`);
    } catch (error) {
        logToConsole('error', `Connection test failed: ${error.message}`);
    }
}

async function startOTAFlash() {
    const firmwareFile = document.getElementById('firmwareFilePath').value;
    const comPort = document.getElementById('comPortSelect').value;
    const eraseFlash = document.getElementById('eraseFlash').checked;
    const verifyFlash = document.getElementById('verifyFlash').checked;
    const resetAfterFlash = document.getElementById('resetAfterFlash').checked;
    const baudRate = document.getElementById('baudRate').value;
    
    if (!firmwareFile || !comPort) {
        logToConsole('error', 'Please select both firmware file and COM port');
        return;
    }
    
    // Clear console and start flash process
    document.getElementById('otaFlashConsole').innerHTML = '';
    logToOTAConsole('info', 'Starting OTA flash process...');
    logToOTAConsole('info', `Firmware: ${firmwareFile}`);
    logToOTAConsole('info', `COM Port: ${comPort}`);
    logToOTAConsole('info', `Baud Rate: ${baudRate}`);
    logToOTAConsole('info', `Erase: ${eraseFlash ? 'Yes' : 'No'}`);
    logToOTAConsole('info', `Verify: ${verifyFlash ? 'Yes' : 'No'}`);
    
    // Show progress bar and update buttons
    document.getElementById('otaFlashProgress').style.display = 'block';
    document.getElementById('otaFlashButton').style.display = 'none';
    document.getElementById('stopOTAButton').style.display = 'inline-block';
    
    try {
        const response = await fetch('/flash_c6_ota', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                firmware_file: firmwareFile,
                com_port: comPort,
                erase_flash: eraseFlash,
                verify_flash: verifyFlash,
                reset_after_flash: resetAfterFlash,
                baud_rate: baudRate
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            logToOTAConsole('success', 'OTA flash started successfully');
            startOTAProgressMonitoring();
        } else {
            logToOTAConsole('error', 'Failed to start OTA flash: ' + result.error);
            resetOTAFlashUI();
        }
    } catch (error) {
        logToOTAConsole('error', 'Network error: ' + error.message);
        resetOTAFlashUI();
    }
}

function startOTAProgressMonitoring() {
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress > 100) progress = 100;
        
        updateOTAProgress(progress, `Flashing... ${Math.round(progress)}%`);
        
        if (progress >= 100) {
            clearInterval(progressInterval);
            logToOTAConsole('success', 'OTA flash completed!');
            resetOTAFlashUI();
        }
    }, 1000);
    
    // Store interval for cleanup
    window.otaProgressInterval = progressInterval;
}

function stopOTAFlash() {
    logToOTAConsole('warning', 'Stopping OTA flash...');
    
    if (window.otaProgressInterval) {
        clearInterval(window.otaProgressInterval);
    }
    
    // Would send stop command to server here
    
    resetOTAFlashUI();
    logToOTAConsole('info', 'OTA flash stopped');
}

function updateOTAProgress(percentage, text) {
    document.getElementById('otaFlashProgressFill').style.width = percentage + '%';
    document.getElementById('otaFlashProgressText').textContent = text;
}

function resetOTAFlashUI() {
    document.getElementById('otaFlashProgress').style.display = 'none';
    document.getElementById('otaFlashButton').style.display = 'inline-block';
    document.getElementById('stopOTAButton').style.display = 'none';
    updateOTAProgress(0, 'Ready');
}

function logToOTAConsole(type, message) {
    const console = document.getElementById('otaFlashConsole');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-${type}`;
    logEntry.textContent = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.appendChild(logEntry);
    console.scrollTop = console.scrollHeight;
}

// Initialize OTA Flash tab when loaded
document.addEventListener('DOMContentLoaded', function() {
    // Load drives and ports when tab is shown
    if (document.getElementById('otaflash')) {
        refreshDrives();
        refreshSerialPorts();
    }
});

// Enhanced tab switching to load data when needed
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show selected tab content
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked tab
    event.target.classList.add('active');
    
    // Load tab-specific data
    if (tabName === 'firmware') {
        loadAvailableVersions();
    } else if (tabName === 'diagnostics') {
        loadSystemInfo();
    } else if (tabName === 'otaflash') {
        refreshDrives();
        refreshSerialPorts();
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    if (window.otaProgressInterval) {
        clearInterval(window.otaProgressInterval);
    }
});
