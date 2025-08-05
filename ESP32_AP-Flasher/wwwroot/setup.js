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
    console.log('Starting WiFi scan...');
    fetch("wifi_scan")  // Use the enhanced endpoint
        .then(response => {
            console.log('Received response:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('WiFi scan response:', data);
            
            if (!data.success) {
                console.error('WiFi scan failed');
                showStatus('scan_status', 'WiFi scan failed. Please try again.', 'error');
                resetScanButton();
                return;
            }

            if (data.networkCount === 0) {
                console.log('No networks found, retrying in 3 seconds...');
                showStatus('scan_status', 'No networks found. Retrying in 3 seconds...', 'info');
                setTimeout(getSsidList, 3000);
                return;
            }

            const select = document.createElement('select');
            select.id = 'ssid';
            console.log('Created select element with id:', select.id);

            // Sort networks by signal strength
            const sortedNetworks = data.networks.sort((a, b) => b.rssi - a.rssi);
            console.log('Sorted networks:', sortedNetworks.length);

            sortedNetworks.forEach(network => {
                if (network.ssid && network.ssid.trim() !== '') {
                    const option = document.createElement('option');
                    option.value = network.ssid;
                    console.log('Adding network:', network);
                    
                    // Format: [Signal] SSID [Security]
                    const rssiText = pad(network.rssi + 'dBm', 8);
                    const ssidText = pad(network.ssid, 24);
                    const securityText = network.encryption === 0 ? '[Open]' : '[Secured]';
                    option.text = rssiText + ssidText + securityText;
                    select.appendChild(option);
                }
            });

            if (select.options.length === 0) {
                console.log('No valid SSIDs found, retrying...');
                showStatus('scan_status', 'No valid networks found. Retrying...', 'info');
                setTimeout(getSsidList, 3000);
                return;
            }

            let ssidval = $('#ssid') ? $('#ssid').value : '';
            console.log('Current SSID value before replacement:', ssidval);
            const currentSSIDInput = $('#ssid');
            console.log('Current SSID element:', currentSSIDInput);
            if (currentSSIDInput) {
                currentSSIDInput.replaceWith(select);
                // Set the selected value after a brief delay to ensure DOM is updated
                setTimeout(() => {
                    const newSelect = $('#ssid');
                    console.log('New select element after replacement:', newSelect);
                    if (newSelect && ssidval) {
                        newSelect.value = ssidval;
                        console.log('Set select value to:', ssidval);
                    }
                }, 10);
            } else {
                console.error('SSID input element not found in DOM');
                showStatus('scan_status', 'SSID input field not found', 'error');
                resetScanButton();
                return;
            }

            showStatus('scan_status', `Found ${data.networkCount} WiFi networks. Select one from the dropdown.`, 'success');
            resetScanButton();
        })
        .catch(error => {
            console.error('WiFi scan error:', error);
            showStatus('scan_status', 'WiFi scan failed. Trying fallback method...', 'error');
            
            // Try fallback to original endpoint
            setTimeout(() => {
                fetch("get_ssid_list")
                    .then(response => response.json())
                    .then(data => {
                        if (data.scanstatus < 0) {
                            showStatus('scan_status', 'WiFi scan in progress. Please wait...', 'info');
                            setTimeout(getSsidList, 3000);
                            return;
                        } else {
                            const select = document.createElement('select');
                            select.id = 'ssid';

                            data.networks.forEach(network => {
                                if (network.ssid) {
                                    const option = document.createElement('option');
                                    option.value = network.ssid;
                                    console.log(network);
                                    option.text = pad(network.rssi, 5) + pad(network.ssid, 24);
                                    select.appendChild(option);
                                }
                            });

                            let ssidval = $('#ssid') ? $('#ssid').value : '';
                            const currentSSIDInput = $('#ssid');
                            if (currentSSIDInput) {
                                currentSSIDInput.replaceWith(select);
                                // Set the selected value after a brief delay to ensure DOM is updated
                                setTimeout(() => {
                                    const newSelect = $('#ssid');
                                    if (newSelect && ssidval) {
                                        newSelect.value = ssidval;
                                    }
                                }, 10);
                            } else {
                                console.error('SSID input element not found during fallback');
                            }
                            showStatus('scan_status', `Found ${data.networks.length} networks using fallback method.`, 'success');
                        }
                        resetScanButton();
                    })
                    .catch(fallbackError => {
                        console.error('Fallback scan also failed:', fallbackError);
                        showStatus('scan_status', 'Both scan methods failed. Please enter SSID manually.', 'error');
                        resetScanButton();
                    });
            }, 2000);
        });
}

function resetScanButton() {
    const button = $('#listssid');
    document.body.style.cursor = 'default';
    if (button) {
        button.disabled = false;
        button.innerHTML = 'find SSID';
    }
}
