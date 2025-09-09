// C6 Function Test Suite JavaScript
// =================================
// Tests all C6 module functions and verifies C++ backend connectivity

class C6FunctionTester {
    constructor() {
        this.testResults = {};
        this.totalTests = 0;
        this.completedTests = 0;
        this.passedTests = 0;
        this.failedTests = 0;
    }

    // Update progress bar
    updateProgress(completed, total, text) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');

        const percentage = total > 0 ? (completed / total) * 100 : 0;
        progressBar.style.width = percentage + '%';
        progressText.textContent = text || `${completed}/${total} tests completed`;
    }

    // Update endpoint status table
    updateEndpointStatus(endpoint, status) {
        const table = document.getElementById('endpointStatus');
        const rows = table.querySelectorAll('tr');

        for (let row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length > 0 && cells[0].textContent === endpoint) {
                const statusCell = cells[2];
                statusCell.className = status === 'OK' ? 'status-ok' : 'status-error';
                statusCell.textContent = status;
                break;
            }
        }
    }

    // Display test result
    displayResult(elementId, result, isSuccess = true) {
        const element = document.getElementById(elementId);
        element.style.display = 'block';
        element.className = `test-result ${isSuccess ? 'result-success' : 'result-error'}`;
        element.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    }

    // Log test result
    logResult(testName, success, details) {
        const timestamp = new Date().toLocaleTimeString();
        this.testResults[testName] = {
            success,
            details,
            timestamp
        };

        if (success) {
            this.passedTests++;
            console.log(`✅ ${testName}: PASSED`);
        } else {
            this.failedTests++;
            console.log(`❌ ${testName}: FAILED`);
        }

        this.completedTests++;
        this.updateProgress(this.completedTests, this.totalTests);
        this.updateTestSummary();
    }

    // Update test summary
    updateTestSummary() {
        const summaryDiv = document.getElementById('testSummary');

        let html = `
            <div class="test-grid">
                <div>
                    <h4>Overall Results</h4>
                    <p><strong>Total Tests:</strong> ${this.completedTests}</p>
                    <p><strong>Passed:</strong> <span class="status-ok">${this.passedTests}</span></p>
                    <p><strong>Failed:</strong> <span class="status-error">${this.failedTests}</span></p>
                    <p><strong>Success Rate:</strong> ${this.completedTests > 0 ? Math.round((this.passedTests / this.completedTests) * 100) : 0}%</p>
                </div>
                <div>
                    <h4>Recent Results</h4>
        `;

        const recentTests = Object.entries(this.testResults)
            .slice(-5)
            .reverse();

        for (const [testName, result] of recentTests) {
            const statusClass = result.success ? 'status-ok' : 'status-error';
            const statusText = result.success ? 'PASSED' : 'FAILED';
            html += `<p><span class="${statusClass}">${statusText}</span> ${testName} (${result.timestamp})</p>`;
        }

        html += '</div></div>';
        summaryDiv.innerHTML = html;
    }

    // Generic API test function
    async testAPI(endpoint, method = 'GET', data = null, expectedKeys = []) {
        try {
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(endpoint, options);
            const result = await response.text();

            let parsedResult;
            try {
                parsedResult = JSON.parse(result);
            } catch (e) {
                parsedResult = result;
            }

            const success = response.ok;

            // Update endpoint status
            this.updateEndpointStatus(endpoint, success ? 'OK' : 'ERROR');

            // Check for expected keys if provided
            if (success && expectedKeys.length > 0 && typeof parsedResult === 'object') {
                for (const key of expectedKeys) {
                    if (!(key in parsedResult)) {
                        throw new Error(`Missing expected key: ${key}`);
                    }
                }
            }

            return {
                success,
                status: response.status,
                data: parsedResult,
                raw: result
            };
        } catch (error) {
            this.updateEndpointStatus(endpoint, 'ERROR');
            return {
                success: false,
                error: error.message,
                status: 0
            };
        }
    }
}

// Global tester instance
const tester = new C6FunctionTester();

// Individual Test Functions
// =========================

async function testSystemInfo() {
    const result = await tester.testAPI('/sysinfo', 'GET', null, ['version', 'freeHeap']);

    let details = `Status: ${result.status}\n`;

    if (result.success) {
        const data = result.data;
        details += `System: ${data.system || 'Unknown'}\n`;
        details += `Version: ${data.version || 'Unknown'}\n`;
        details += `Free Heap: ${data.freeHeap ? Math.floor(data.freeHeap / 1024) + 'KB' : 'Unknown'}\n`;
        details += `C6 Support: ${data.C6_OTA_FLASHING ? '✅ Available' : '❌ Not Available'}\n`;
        details += `Has C6: ${data.hasC6 ? '✅ Yes' : '❌ No'}\n`;

        if (data.C6_OTA_FLASHING) {
            details += '\n✅ C6 module support detected in firmware';
        } else {
            details += '\n⚠️ C6 module support not compiled in firmware';
        }
    } else {
        details += `Error: ${result.error || 'Unknown error'}\n`;
        details += `Raw response: ${result.raw || 'No response'}`;
    }

    tester.displayResult('sysInfoResult', details, result.success);
    tester.logResult('System Information', result.success, details);
}

async function testC6Connection() {
    const result = await tester.testAPI('/test_c6_connection', 'GET', null, ['connected']);

    let details = `Status: ${result.status}\n`;

    if (result.success) {
        const data = result.data;
        details += `Connected: ${data.connected ? '✅ Yes' : '❌ No'}\n`;
        details += `Timestamp: ${data.timestamp || 'Unknown'}\n`;

        if (data.connected) {
            details += `RSSI: ${data.rssi || 'Unknown'} dBm\n`;
            details += `Version: ${data.version ? '0x' + data.version.toString(16).toUpperCase() : 'Unknown'}\n`;
            details += '\n✅ C6 module is responding to connection tests';
        } else {
            details += '\n❌ C6 module is not responding or offline';
        }
    } else {
        details += `Error: ${result.error || 'Unknown error'}\n`;
        details += `Raw response: ${result.raw || 'No response'}`;
    }

    tester.displayResult('connectionResult', details, result.success);
    tester.logResult('C6 Connection Test', result.success, details);
}

async function testC6Radio() {
    const result = await tester.testAPI('/test_c6_radio', 'GET');

    let details = `Status: ${result.status}\n`;

    if (result.success) {
        const data = result.data;
        details += `RSSI: ${data.rssi || 'Unknown'} dBm\n`;
        details += `Packets Sent: ${data.packetsSent || 0}\n`;
        details += `Packets Received: ${data.packetsReceived || 0}\n`;
        details += `Error Rate: ${data.errorRate !== undefined ? data.errorRate.toFixed(1) + '%' : 'Unknown'}\n`;
        details += `Timestamp: ${data.timestamp || 'Unknown'}\n`;

        if (data.errorRate !== undefined) {
            if (data.errorRate < 10) {
                details += '\n✅ Excellent radio performance';
            } else if (data.errorRate < 30) {
                details += '\n⚠️ Good radio performance with some packet loss';
            } else {
                details += '\n❌ Poor radio performance - high packet loss';
            }
        }
    } else {
        details += `Error: ${result.error || 'Unknown error'}\n`;
        details += `Raw response: ${result.raw || 'No response'}`;
    }

    tester.displayResult('radioResult', details, result.success);
    tester.logResult('C6 Radio Test', result.success, details);
}

async function testC6Settings() {
    // First test getting settings
    const getResult = await tester.testAPI('/get_c6_settings', 'GET');

    let details = `GET Settings - Status: ${getResult.status}\n`;

    if (getResult.success) {
        const settings = getResult.data;
        details += `Channel: ${settings.channel || 'Unknown'}\n`;
        details += `TX Power: ${settings.txPower || 'Unknown'} dBm\n`;
        details += `PAN ID: ${settings.panId || 'Unknown'}\n`;
        details += `Sleep Mode: ${settings.sleepMode || 'Unknown'}\n`;
        details += `Wake Interval: ${settings.wakeInterval || 'Unknown'} seconds\n`;

        // Test saving settings (with same values to avoid disruption)
        details += '\n--- Testing Settings Save ---\n';
        const saveResult = await tester.testAPI('/save_c6_settings', 'POST', settings);
        details += `POST Settings - Status: ${saveResult.status}\n`;

        if (saveResult.success) {
            details += '✅ Settings read and write functionality working correctly';
        } else {
            details += `❌ Settings save failed: ${saveResult.error || 'Unknown error'}`;
        }
    } else {
        details += `Error: ${getResult.error || 'Unknown error'}\n`;
        details += `Raw response: ${getResult.raw || 'No response'}`;
    }

    const success = getResult.success;
    tester.displayResult('settingsResult', details, success);
    tester.logResult('C6 Settings Management', success, details);
}

async function testAPList() {
    const result = await tester.testAPI('/ap_list', 'GET');

    let details = `Status: ${result.status}\n`;

    if (result.success) {
        const apList = result.data;
        details += `Response Type: ${Array.isArray(apList) ? 'Array' : typeof apList}\n`;
        details += `AP Count: ${Array.isArray(apList) ? apList.length : 'Not an array'}\n`;

        if (Array.isArray(apList) && apList.length > 0) {
            const c6Module = apList.find(ap =>
                ap.hwType === 198 || ap.hwType === 0xC6 ||
                (ap.capabilities && ap.capabilities.includes('C6'))
            );

            if (c6Module) {
                details += '\n✅ C6 Module found in AP list:\n';
                details += `  Hardware Type: ${c6Module.hwType}\n`;
                details += `  Version: ${c6Module.version}\n`;
                details += `  Channel: ${c6Module.channel}\n`;
                details += `  RSSI: ${c6Module.rssi} dBm\n`;
                details += `  MAC: ${c6Module.mac}\n`;
                details += `  State: ${c6Module.state}\n`;
            } else {
                details += '\n⚠️ No C6 module found in AP list';
            }
        } else {
            details += '\n⚠️ AP list is empty or invalid format';
        }
    } else {
        details += `Error: ${result.error || 'Unknown error'}\n`;
        details += `Raw response: ${result.raw || 'No response'}`;
    }

    tester.displayResult('apListResult', details, result.success);
    tester.logResult('AP List Test', result.success, details);
}

async function testUpdateStatus() {
    const result = await tester.testAPI('/c6_update_status', 'GET');

    let details = `Status: ${result.status}\n`;

    if (result.success) {
        const status = result.data;
        details += `Completed: ${status.completed || false}\n`;
        details += `Progress: ${status.progress || 0}%\n`;
        details += `Timestamp: ${status.timestamp || 'Unknown'}\n`;

        if (status.error) {
            details += `Error: ${status.error}\n`;
        }

        if (status.completed) {
            details += '\n✅ No update in progress (normal state)';
        } else if (status.progress > 0) {
            details += '\n🔄 Update in progress';
        } else {
            details += '\n⭕ Ready for updates';
        }
    } else {
        details += `Error: ${result.error || 'Unknown error'}\n`;
        details += `Raw response: ${result.raw || 'No response'}`;
    }

    tester.displayResult('updateStatusResult', details, result.success);
    tester.logResult('Update Status Test', result.success, details);
}

async function testDrivesAndPorts() {
    // Test drives listing
    const drivesResult = await tester.testAPI('/list_drives', 'GET');

    let details = `Drives Test - Status: ${drivesResult.status}\n`;

    if (drivesResult.success) {
        const drives = drivesResult.data.drives || [];
        details += `Drives Found: ${drives.length}\n`;

        for (const drive of drives.slice(0, 3)) { // Show first 3
            details += `  ${drive.letter || drive.path}: ${drive.label || 'Unknown'}\n`;
        }
    } else {
        details += `Drives Error: ${drivesResult.error || 'Unknown error'}\n`;
    }

    // Test serial ports listing
    details += '\n--- Serial Ports Test ---\n';
    const portsResult = await tester.testAPI('/list_serial_ports', 'GET');
    details += `Ports Test - Status: ${portsResult.status}\n`;

    if (portsResult.success) {
        const ports = portsResult.data.ports || [];
        details += `Ports Found: ${ports.length}\n`;

        for (const port of ports.slice(0, 3)) { // Show first 3
            details += `  ${port.port}: ${port.description || 'Unknown'}\n`;
        }
    } else {
        details += `Ports Error: ${portsResult.error || 'Unknown error'}\n`;
    }

    const success = drivesResult.success && portsResult.success;
    if (success) {
        details += '\n✅ Drive and port enumeration working correctly';
    } else {
        details += '\n❌ Some drive/port enumeration functions failed';
    }

    tester.displayResult('drivesPortsResult', details, success);
    tester.logResult('Drives & Ports Test', success, details);
}

async function testC6Control() {
    // Test safe control commands that don't disrupt operation
    let details = 'Testing safe C6 control commands...\n\n';
    let overallSuccess = true;

    // Test status command via c6_status endpoint if available
    try {
        const statusResult = await tester.testAPI('/c6_status', 'GET');
        details += `C6 Status - Status: ${statusResult.status}\n`;

        if (statusResult.success) {
            const status = statusResult.data;
            details += `C6 Connected: ${status.c6Connected || false}\n`;
            details += `C6 State: ${status.c6State || 'Unknown'}\n`;
            details += `C6 Version: ${status.c6Version || 'Unknown'}\n`;
            details += `C6 Channel: ${status.c6Channel || 'Unknown'}\n`;
        } else {
            details += `Status Error: ${statusResult.error || 'Unknown error'}\n`;
            overallSuccess = false;
        }
    } catch (error) {
        details += `Status Test Failed: ${error.message}\n`;
        overallSuccess = false;
    }

    // Note about restart test
    details += '\n--- Restart Test (SKIPPED) ---\n';
    details += 'Restart test skipped to avoid disrupting operation.\n';
    details += 'Endpoint /restart_c6 is available for manual testing.\n';

    if (overallSuccess) {
        details += '\n✅ C6 control functions are available and responding';
    } else {
        details += '\n⚠️ Some C6 control functions may not be fully operational';
    }

    tester.displayResult('controlResult', details, overallSuccess);
    tester.logResult('C6 Control Test', overallSuccess, details);
}

// Batch Test Functions
// ====================

async function runAllTests() {
    // Reset counters
    tester.totalTests = 8;
    tester.completedTests = 0;
    tester.passedTests = 0;
    tester.failedTests = 0;
    tester.testResults = {};

    tester.updateProgress(0, tester.totalTests, 'Starting comprehensive test suite...');

    // Clear previous results
    clearAllResults();

    // Run tests in sequence
    const tests = [
        { name: 'System Information', func: testSystemInfo },
        { name: 'C6 Connection', func: testC6Connection },
        { name: 'C6 Radio', func: testC6Radio },
        { name: 'C6 Settings', func: testC6Settings },
        { name: 'AP List', func: testAPList },
        { name: 'Update Status', func: testUpdateStatus },
        { name: 'Drives & Ports', func: testDrivesAndPorts },
        { name: 'C6 Control', func: testC6Control }
    ];

    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        tester.updateProgress(i, tester.totalTests, `Running ${test.name}...`);

        try {
            await test.func();
        } catch (error) {
            console.error(`Test ${test.name} failed:`, error);
            tester.logResult(test.name, false, `Test execution failed: ${error.message}`);
        }

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    tester.updateProgress(tester.totalTests, tester.totalTests, 'All tests completed!');

    // Show final summary
    setTimeout(() => {
        alert(`Test Suite Complete!\n\nPassed: ${tester.passedTests}\nFailed: ${tester.failedTests}\nSuccess Rate: ${Math.round((tester.passedTests / tester.totalTests) * 100)}%`);
    }, 1000);
}

function clearAllResults() {
    const resultElements = [
        'sysInfoResult', 'connectionResult', 'radioResult', 'settingsResult',
        'apListResult', 'updateStatusResult', 'drivesPortsResult', 'controlResult'
    ];

    resultElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
            element.textContent = '';
        }
    });

    // Reset endpoint status
    const table = document.getElementById('endpointStatus');
    const rows = table.querySelectorAll('tr');
    for (let row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length > 2) {
            cells[2].className = 'status-unknown';
            cells[2].textContent = 'Not Tested';
        }
    }

    // Reset progress
    tester.updateProgress(0, 0, 'Ready to start tests');

    // Clear summary
    document.getElementById('testSummary').innerHTML = '<p>Run tests to see results summary...</p>';
}

function exportTestResults() {
    const timestamp = new Date().toISOString();
    const results = {
        testSuite: 'C6 Function Test Suite',
        timestamp: timestamp,
        summary: {
            totalTests: tester.completedTests,
            passedTests: tester.passedTests,
            failedTests: tester.failedTests,
            successRate: tester.completedTests > 0 ? Math.round((tester.passedTests / tester.completedTests) * 100) : 0
        },
        results: tester.testResults
    };

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `c6_test_results_${timestamp.split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Test results exported:', results);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('C6 Function Test Suite loaded');
    tester.updateProgress(0, 0, 'Test suite ready');
});
