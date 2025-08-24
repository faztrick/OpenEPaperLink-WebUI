// $ is already defined in constants.js
// const $ = document.querySelector.bind(document);

// Check if $ function is available
if (typeof $ === 'undefined') {
    console.error('$ function not available! Make sure constants.js is loaded.');
    // Fallback definition
    window.$ = document.querySelector.bind(document);
}

window.addEventListener("load", function () {
    // Ensure DOM is fully loaded and all elements exist
    const requiredElements = ['ssid', 'pw', 'ip', 'mask', 'gw', 'dns', 'mac', 'listssid', 'connect'];
    const missingElements = [];

    requiredElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (!element) {
            missingElements.push(elementId);
        }
    });

    if (missingElements.length > 0) {
        console.error('Missing DOM elements:', missingElements);
        showStatus('scan_status', `Missing form elements: ${missingElements.join(', ')}. Page may not have loaded correctly.`, 'error');
        return;
    }

    // Load WiFi configuration
    fetch("get_wifi_config")
        .then(response => response.json())
        .then(data => {
            // Set form values with null checks
            const ssidElement = $('#ssid');
            const pwElement = $('#pw');
            const ipElement = $('#ip');
            const maskElement = $('#mask');
            const gwElement = $('#gw');
            const dnsElement = $('#dns');
            const macElement = $('#mac');

            if (ssidElement) ssidElement.value = data.ssid || "";
            if (pwElement) pwElement.value = data.pw || "";
            if (ipElement) ipElement.value = data.ip || "";
            if (maskElement) maskElement.value = data.mask || "";
            if (gwElement) gwElement.value = data.gw || "";
            if (dnsElement) dnsElement.value = data.dns || "";
            if (macElement) macElement.innerHTML = data.mac || "";

            // Show WiFi status
            const wifiStatus = document.getElementById('wifi_status');
            const wifiStatusText = document.getElementById('wifi_status_text');
            if (wifiStatus && wifiStatusText) {
                wifiStatus.style.display = 'block';
                if (data.ssid) {
                    wifiStatusText.textContent = `Currently configured for: ${data.ssid}`;
                    wifiStatusText.style.color = '#4CAF50';
                } else {
                    wifiStatusText.textContent = 'No WiFi network configured';
                    wifiStatusText.style.color = '#ff9800';
                }
            }
        })
        .catch(error => {
            console.error('Failed to load WiFi config:', error);
            showStatus('scan_status', 'Failed to load current WiFi configuration', 'error');
        });

    // Set up event listeners
    const listSSIDButton = $('#listssid');
    if (listSSIDButton) {
        listSSIDButton.addEventListener('click', () => {
            const button = $('#listssid');
            document.body.style.cursor = 'progress';
            button.disabled = true;
            button.innerHTML = '&#x231B; Scanning...';

            showStatus('scan_status', 'Scanning for WiFi networks...', 'info');
            getSsidList();
        });
    }

    const connectButton = $('#connect');
    if (connectButton) {
        connectButton.addEventListener('click', () => {
            const ssidElement = $('#ssid');
            const pwElement = $('#pw');
            const ipElement = $('#ip');
            const maskElement = $('#mask');
            const gwElement = $('#gw');
            const dnsElement = $('#dns');

            if (!ssidElement) {
                showStatus('save_status', 'SSID input field not found', 'error');
                return;
            }

            const ssid = ssidElement.value.trim();
            if (!ssid) {
                showStatus('save_status', 'Please enter or select an SSID', 'error');
                return;
            }

            const data = {
                ssid: ssid,
                pw: pwElement ? pwElement.value : '',
                ip: ipElement ? ipElement.value : '',
                mask: maskElement ? maskElement.value : '',
                gw: gwElement ? gwElement.value : '',
                dns: dnsElement ? dnsElement.value : ''
            };

            const button = $('#connect');
            if (button) {
                button.disabled = true;
                button.textContent = 'Saving...';
            }
            showStatus('save_status', 'Saving WiFi configuration...', 'info');

            fetch('save_wifi_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            })
                .then(response => {
                    if (response.ok) {
                        console.log('WiFi settings saved successfully');
                        const ipValue = ipElement ? ipElement.value : '';
                        let url = "/";
                        if (ipValue) url = "http://" + ipValue + "/";
                        showStatus('save_status', 'WiFi settings saved successfully!', 'success');
                        const windowElement = $('.window');
                        if (windowElement) {
                            windowElement.innerHTML = "<h1>WiFi settings saved...</h1>Rebooting...<br>Wait a few seconds and then go to the <a href=\"" + url + "\">Access Point web page</a>.";
                        }
                    } else {
                        throw new Error('Server error while saving WiFi settings');
                    }
                })
                .catch(error => {
                    console.error('Error saving WiFi settings:', error);
                    showStatus('save_status', 'Failed to save WiFi settings. Please try again.', 'error');
                    if (button) {
                        button.disabled = false;
                        button.textContent = 'Save WiFi settings and reboot';
                    }
                });
        });
    }
});

function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<div class="status-message status-${type}">${message}</div>`;

        // Auto-clear after 5 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                element.innerHTML = '';
            }, 5000);
        }
    }
}

function pad(text, count) {
    let t = text + "";
    return t.padEnd(count, "\u00A0").slice(0, count);
}

function getSsidList() {
    console.log('Starting unified WiFi scan...');

    showStatus('scan_status', 'Scanning for WiFi networks...', 'info');
    const button = $('#listssid');
    if (button) {
        button.disabled = true;
        button.innerHTML = 'Scanning...';
        document.body.style.cursor = 'wait';
    }

    // Prefer apiManager unified scan helper if available
    const doScan = () => {
        if (window.apiManager && typeof window.apiManager.unifiedScan === 'function') {
            return window.apiManager.unifiedScan({ maxWaitMs: 15000, pollIntervalMs: 1200 });
        }
        // Last-resort direct calls (should rarely happen; keeps page functional if apiManager not loaded yet)
        return fetch('/api/wifi/scan', { method: 'POST' })
            .then(() => fetch('/api/wifi/scan/results'))
            .then(r => r.json());
    };

    doScan()
        .then(data => {
            if (!data) throw new Error('No scan data received');
            if (!data.networks || data.networks.length === 0) {
                // If scan succeeded but empty, allow user to retry
                showStatus('scan_status', 'No networks found. You can retry or enter the SSID manually.', 'warning');
                resetScanButton();
                return;
            }

            const select = document.createElement('select');
            select.id = 'ssid';
            select.className = 'wifi-ssid-select';

            data.networks.forEach((network, index) => {
                if (network.ssid && network.ssid.trim() !== '') {
                    const option = document.createElement('option');
                    option.value = network.ssid;
                    const rssiText = formatSignalStrength(network.rssi);
                    const ssidText = pad(network.ssid, 28);
                    const securityText = formatSecurity(network.encryption);
                    const channelText = (network.channel !== undefined) ? `Ch${network.channel}` : '';
                    option.text = `${rssiText} ${ssidText} ${securityText} ${channelText}`.trim();
                    option.title = `SSID: ${network.ssid}, Signal: ${network.rssi}dBm${network.channel !== undefined ? ', Channel: ' + network.channel : ''}, Security: ${getSecurityType(network.encryption)}`;
                    select.appendChild(option);
                    if (index < 5) console.log('Added network:', network);
                }
            });

            if (select.options.length === 0) {
                showStatus('scan_status', 'No valid SSIDs found. Enter manually.', 'warning');
                resetScanButton();
                return;
            }

            let previousValue = $('#ssid') ? $('#ssid').value : '';
            const currentSSIDInput = $('#ssid');
            if (currentSSIDInput) {
                currentSSIDInput.replaceWith(select);
                setTimeout(() => {
                    const newSelect = $('#ssid');
                    if (newSelect && previousValue) {
                        for (let i = 0; i < newSelect.options.length; i++) {
                            if (newSelect.options[i].value === previousValue) {
                                newSelect.selectedIndex = i;
                                break;
                            }
                        }
                    }
                }, 10);
            } else {
                console.error('SSID input element not found in DOM');
                showStatus('scan_status', 'Configuration error: SSID field not found', 'error');
                resetScanButton();
                return;
            }

            const total = data.networkCount || data.networks.length;
            const returned = data.networksReturned || data.networks.length;
            showStatus('scan_status', `Found ${total} WiFi networks (showing ${returned}). Select one from the dropdown.`, 'success');
            resetScanButton();
        })
        .catch(err => {
            console.error('Unified scan failed:', err);
            showStatus('scan_status', 'WiFi scan failed. Please retry or enter SSID manually.', 'error');
            resetScanButton();
        });
}

function formatSignalStrength(rssi) {
    if (rssi >= -30) return '[████]';
    if (rssi >= -50) return '[███▪]';
    if (rssi >= -70) return '[██▪▪]';
    if (rssi >= -90) return '[█▪▪▪]';
    return '[▪▪▪▪]';
}

function formatSecurity(encType) {
    if (encType === 0) return '[Open]';
    if (encType === 2) return '[WPA]';
    if (encType === 3) return '[WPA2]';
    if (encType === 4) return '[WPA/2]';
    if (encType === 5) return '[WPA2]';
    if (encType === 7) return '[Open]';
    if (encType === 8) return '[WPA3]';
    return '[Secured]';
}

function getSecurityType(encType) {
    const securityTypes = {
        0: 'Open',
        2: 'WPA-PSK',
        3: 'WPA2-PSK',
        4: 'WPA/WPA2-PSK',
        5: 'WPA2-Enterprise',
        7: 'Open',
        8: 'WPA3-PSK'
    };
    return securityTypes[encType] || 'Unknown';
}

function resetScanButton() {
    const button = $('#listssid');
    document.body.style.cursor = 'default';
    if (button) {
        button.disabled = false;
        button.innerHTML = 'find SSID';
    }
}
