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
    console.log('Starting optimized WiFi scan...');

    // Show scanning status immediately
    showStatus('scan_status', 'Scanning for WiFi networks...', 'info');
    const button = $('#listssid');
    if (button) {
        button.disabled = true;
        button.innerHTML = 'Scanning...';
        document.body.style.cursor = 'wait';
    }

    fetch("wifi_scan", {
        method: 'GET',
        headers: {
            'Cache-Control': 'no-cache'
        }
    })
        .then(response => {
            console.log('Received response:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('WiFi scan response:', data);
            
            // Handle scan still running
            if (data.scanRunning || !data.success) {
                if (data.scanRunning) {
                    console.log('Scan in progress, retrying in 3 seconds...');
                    showStatus('scan_status', 'Scan in progress. Waiting for results...', 'info');
                    setTimeout(getSsidList, 3000);
                    return;
                } else {
                    console.error('WiFi scan failed:', data.message || 'Unknown error');
                    showStatus('scan_status', data.message || 'WiFi scan failed. Trying fallback...', 'error');
                    tryFallbackScan();
                    return;
                }
            }

            if (data.networkCount === 0) {
                console.log('No networks found, retrying in 3 seconds...');
                showStatus('scan_status', 'No networks found. Retrying in 3 seconds...', 'info');
                setTimeout(getSsidList, 3000);
                return;
            }

            // Create and populate select element
            const select = document.createElement('select');
            select.id = 'ssid';
            select.className = 'wifi-ssid-select';
            console.log('Created optimized select element with id:', select.id);

            // Networks are already sorted by signal strength from the backend
            console.log('Processing', data.networks.length, 'sorted networks');

            data.networks.forEach((network, index) => {
                if (network.ssid && network.ssid.trim() !== '') {
                    const option = document.createElement('option');
                    option.value = network.ssid;
                    
                    // Enhanced formatting with better signal and security info
                    const rssiText = formatSignalStrength(network.rssi);
                    const ssidText = pad(network.ssid, 28);
                    const securityText = formatSecurity(network.encryption);
                    const channelText = `Ch${network.channel}`;

                    option.text = `${rssiText} ${ssidText} ${securityText} ${channelText}`;
                    option.title = `SSID: ${network.ssid}, Signal: ${network.rssi}dBm, Channel: ${network.channel}, Security: ${getSecurityType(network.encryption)}`;

                    select.appendChild(option);

                    if (index < 5) { // Log first 5 for debugging
                        console.log('Added network:', network);
                    }
                }
            });

            if (select.options.length === 0) {
                console.log('No valid SSIDs found, trying fallback...');
                showStatus('scan_status', 'No valid networks found. Trying alternative scan...', 'info');
                tryFallbackScan();
                return;
            }

            // Replace existing SSID input with dropdown
            let ssidval = $('#ssid') ? $('#ssid').value : '';
            console.log('Current SSID value before replacement:', ssidval);
            const currentSSIDInput = $('#ssid');

            if (currentSSIDInput) {
                currentSSIDInput.replaceWith(select);

                // Set the selected value after DOM update
                setTimeout(() => {
                    const newSelect = $('#ssid');
                    if (newSelect && ssidval) {
                        // Try to find matching SSID
                        for (let i = 0; i < newSelect.options.length; i++) {
                            if (newSelect.options[i].value === ssidval) {
                                newSelect.selectedIndex = i;
                                console.log('Set select value to:', ssidval);
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

            const successMsg = `Found ${data.networkCount} WiFi networks (showing ${data.networksReturned || data.networks.length}). Select one from the dropdown.`;
            showStatus('scan_status', successMsg, 'success');
            resetScanButton();
        })
        .catch(error => {
            console.error('WiFi scan error:', error);
            showStatus('scan_status', 'Primary scan failed. Trying alternative method...', 'error');
            tryFallbackScan();
        });
}

function tryFallbackScan() {
    console.log('Trying fallback scan method...');
    setTimeout(() => {
        fetch("get_ssid_list", {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache'
            }
        })
            .then(response => response.json())
            .then(data => {
                console.log('Fallback scan response:', data);

                if (data.scanstatus < 0) {
                    showStatus('scan_status', 'Alternative scan in progress. Please wait...', 'info');
                    setTimeout(getSsidList, 4000);
                    return;
                }

                if (!data.networks || data.networks.length === 0) {
                    showStatus('scan_status', 'No networks found with any method. Please enter SSID manually.', 'error');
                    resetScanButton();
                    return;
                }

                const select = document.createElement('select');
                select.id = 'ssid';
                select.className = 'wifi-ssid-select fallback';

                data.networks.forEach(network => {
                    if (network.ssid && network.ssid.trim() !== '') {
                        const option = document.createElement('option');
                        option.value = network.ssid;

                        const rssiText = formatSignalStrength(network.rssi);
                        const ssidText = pad(network.ssid, 26);
                        const securityText = formatSecurity(network.enc);

                        option.text = `${rssiText} ${ssidText} ${securityText}`;
                        option.title = `SSID: ${network.ssid}, Signal: ${network.rssi}dBm, Security: ${getSecurityType(network.enc)}`;

                        select.appendChild(option);
                    }
                });

                let ssidval = $('#ssid') ? $('#ssid').value : '';
                const currentSSIDInput = $('#ssid');
                if (currentSSIDInput) {
                    currentSSIDInput.replaceWith(select);

                    setTimeout(() => {
                        const newSelect = $('#ssid');
                        if (newSelect && ssidval) {
                            for (let i = 0; i < newSelect.options.length; i++) {
                                if (newSelect.options[i].value === ssidval) {
                                    newSelect.selectedIndex = i;
                                    break;
                                }
                            }
                        }
                    }, 10);
                }

                showStatus('scan_status', `Found ${data.networks.length} networks using alternative method.`, 'success');
                resetScanButton();
            })
            .catch(fallbackError => {
                console.error('Fallback scan also failed:', fallbackError);
                showStatus('scan_status', 'All scan methods failed. Please enter SSID manually.', 'error');
                resetScanButton();
            });
    }, 2000);
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
