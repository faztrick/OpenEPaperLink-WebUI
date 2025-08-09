/**
 * ESP32 Backend-Frontend Connectivity Checker
 * Validates all API endpoints between wwwroot frontend and C++ backend
 */

class BackendConnectivityChecker {
    constructor() {
        this.results = {};
        this.baseURL = window.location.origin;
        this.testTimeout = 5000; // 5 second timeout per test
    }

    // Expected endpoints from API manager
    getExpectedEndpoints() {
        return {
            // System endpoints
            'get_ap_config': { method: 'GET', critical: true },
            'sysinfo': { method: 'GET', critical: true },
            'sysinfo.json': { method: 'GET', critical: true },
            'version.txt': { method: 'GET', critical: false },
            'system_info': { method: 'GET', critical: false },
            'restart_system': { method: 'POST', critical: false },
            'get_function_status': { method: 'GET', critical: false },

            // Tag management endpoints
            'get_db': { method: 'GET', critical: true },
            'tag_cmd': { method: 'POST', critical: true },
            'save_cfg': { method: 'POST', critical: true },
            'tag_status': { method: 'GET', critical: false },
            'led_flash': { method: 'GET', critical: true },

            // WiFi and network endpoints
            'get_wifi_config': { method: 'GET', critical: true },
            'save_wifi_config': { method: 'POST', critical: true },
            'get_ssid_list': { method: 'GET', critical: true },
            'wifi_scan': { method: 'GET', critical: false },
            'network_info': { method: 'GET', critical: false },

            // Configuration endpoints
            'save_apcfg': { method: 'POST', critical: true },
            'set_var': { method: 'POST', critical: true },
            'set_vars': { method: 'POST', critical: true },
            'setup': { method: 'GET', critical: false },

            // File management endpoints
            'getdata': { method: 'GET', critical: false },
            'imgupload': { method: 'POST', critical: false },
            'jsonupload': { method: 'POST', critical: false },
            'littlefs_put': { method: 'POST', critical: false },
            'check_file': { method: 'GET', critical: false },

            // System control endpoints
            'reboot': { method: 'POST', critical: false },
            'rollback': { method: 'POST', critical: false },
            'update_actions': { method: 'POST', critical: false },
            'update_ota': { method: 'POST', critical: false },

            // Database operations
            'backup_db': { method: 'GET', critical: false },
            'restore_db': { method: 'POST', critical: false },

            // API endpoints
            'api/features': { method: 'GET', critical: false },
            'api/error_report': { method: 'POST', critical: false },
            'api/modules': { method: 'GET', critical: false },

            // Content generation endpoints
            'start_content_generation': { method: 'POST', critical: false },
            'stop_content_generation': { method: 'POST', critical: false },
            'pause_content_generation': { method: 'POST', critical: false },

            // Hardware feature endpoints
            'led_control': { method: 'POST', critical: false },
            'ble_status': { method: 'GET', critical: false },
            'ble_control': { method: 'POST', critical: false }
        };
    }

    // Test a single endpoint
    async testEndpoint(endpoint, config) {
        console.log(`🔍 Testing ${endpoint} (${config.method})...`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.testTimeout);

            const options = {
                method: config.method,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            // Add minimal body for POST requests to avoid 400 errors
            if (config.method === 'POST') {
                if (endpoint.includes('json') || endpoint.includes('api/')) {
                    options.body = JSON.stringify({ test: true });
                } else {
                    // For form-based endpoints, use FormData
                    const formData = new FormData();
                    formData.append('test', 'true');
                    options.body = formData;
                    delete options.headers['Content-Type']; // Let browser set boundary
                }
            }

            const response = await fetch(`${this.baseURL}/${endpoint}`, options);
            clearTimeout(timeoutId);

            const result = {
                endpoint,
                method: config.method,
                status: response.status,
                statusText: response.statusText,
                success: response.ok || response.status === 400, // 400 might be expected for test data
                critical: config.critical,
                responseTime: Date.now(),
                headers: Object.fromEntries(response.headers.entries())
            };

            // Try to read response content
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    result.responseData = await response.json();
                } else {
                    const text = await response.text();
                    result.responseData = text.length > 200 ? text.substring(0, 200) + '...' : text;
                }
            } catch (e) {
                result.responseData = 'Could not read response data';
            }

            return result;

        } catch (error) {
            return {
                endpoint,
                method: config.method,
                success: false,
                critical: config.critical,
                error: error.message,
                errorType: error.name
            };
        }
    }

    // Test WebSocket connection
    async testWebSocket() {
        return new Promise((resolve) => {
            console.log('🔍 Testing WebSocket connection...');

            const protocol = location.protocol === "https:" ? "wss://" : "ws://";
            const wsUrl = `${protocol}${location.host}/ws`;

            const ws = new WebSocket(wsUrl);
            const timeout = setTimeout(() => {
                ws.close();
                resolve({
                    endpoint: '/ws',
                    method: 'WebSocket',
                    success: false,
                    error: 'Connection timeout',
                    critical: true
                });
            }, 5000);

            ws.onopen = () => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                    endpoint: '/ws',
                    method: 'WebSocket',
                    success: true,
                    critical: true,
                    message: 'WebSocket connection successful'
                });
            };

            ws.onerror = (error) => {
                clearTimeout(timeout);
                resolve({
                    endpoint: '/ws',
                    method: 'WebSocket',
                    success: false,
                    critical: true,
                    error: 'WebSocket connection failed',
                    details: error
                });
            };
        });
    }

    // Test static file serving
    async testStaticFiles() {
        const staticFiles = [
            'index.html',
            'settings.html',
            'setup.html',
            'merged-styles.css',
            'api-manager.js',
            'shared-utils.js'
        ];

        const results = [];
        for (const file of staticFiles) {
            try {
                const response = await fetch(`${this.baseURL}/${file}`);
                results.push({
                    file,
                    success: response.ok,
                    status: response.status,
                    size: response.headers.get('content-length'),
                    contentType: response.headers.get('content-type')
                });
            } catch (error) {
                results.push({
                    file,
                    success: false,
                    error: error.message
                });
            }
        }
        return results;
    }

    // Run comprehensive connectivity test
    async runFullTest() {
        console.log('🚀 Starting comprehensive backend-frontend connectivity test...');
        console.log('=' * 60);

        const startTime = Date.now();
        const endpoints = this.getExpectedEndpoints();

        // Test all endpoints
        const endpointTests = [];
        for (const [endpoint, config] of Object.entries(endpoints)) {
            endpointTests.push(this.testEndpoint(endpoint, config));
        }

        // Run tests in batches to avoid overwhelming the server
        const batchSize = 5;
        const endpointResults = [];

        for (let i = 0; i < endpointTests.length; i += batchSize) {
            const batch = endpointTests.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch);
            endpointResults.push(...batchResults);

            // Small delay between batches
            if (i + batchSize < endpointTests.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Test WebSocket
        const wsResult = await this.testWebSocket();

        // Test static files
        const staticResults = await this.testStaticFiles();

        // Compile results
        const totalTime = Date.now() - startTime;
        const successful = endpointResults.filter(r => r.success).length;
        const critical = endpointResults.filter(r => r.critical).length;
        const criticalSuccess = endpointResults.filter(r => r.critical && r.success).length;

        this.results = {
            summary: {
                totalEndpoints: endpointResults.length,
                successful,
                failed: endpointResults.length - successful,
                criticalEndpoints: critical,
                criticalSuccessful: criticalSuccess,
                websocketWorking: wsResult.success,
                testDuration: totalTime
            },
            endpoints: endpointResults,
            websocket: wsResult,
            staticFiles: staticResults,
            timestamp: new Date().toISOString()
        };

        this.displayResults();
        return this.results;
    }

    // Display results in a formatted way
    displayResults() {
        const { summary, endpoints, websocket, staticFiles } = this.results;

        console.log('\n📊 CONNECTIVITY TEST RESULTS');
        console.log('=' * 50);

        // Summary
        console.log(`📈 Summary:`);
        console.log(`   Total Endpoints: ${summary.totalEndpoints}`);
        console.log(`   ✅ Successful: ${summary.successful}`);
        console.log(`   ❌ Failed: ${summary.failed}`);
        console.log(`   🔥 Critical Success: ${summary.criticalSuccessful}/${summary.criticalEndpoints}`);
        console.log(`   🌐 WebSocket: ${websocket.success ? '✅ Working' : '❌ Failed'}`);
        console.log(`   ⏱️ Test Duration: ${summary.testDuration}ms`);

        // Overall health score
        const healthScore = Math.round(
            (summary.successful / summary.totalEndpoints +
                (websocket.success ? 1 : 0) +
                (summary.criticalSuccessful / summary.criticalEndpoints)) / 3 * 100
        );

        let healthEmoji = '🔴';
        if (healthScore >= 90) healthEmoji = '🟢';
        else if (healthScore >= 70) healthEmoji = '🟡';
        else if (healthScore >= 50) healthEmoji = '🟠';

        console.log(`\n${healthEmoji} Overall Health Score: ${healthScore}%`);

        // Failed endpoints
        const failed = endpoints.filter(r => !r.success);
        if (failed.length > 0) {
            console.log('\n❌ Failed Endpoints:');
            failed.forEach(result => {
                const criticality = result.critical ? '🔥' : '⚪';
                console.log(`   ${criticality} ${result.endpoint} (${result.method}) - ${result.error || result.statusText}`);
            });
        }

        // Critical endpoint status
        const criticalEndpoints = endpoints.filter(r => r.critical);
        console.log('\n🔥 Critical Endpoints Status:');
        criticalEndpoints.forEach(result => {
            const status = result.success ? '✅' : '❌';
            console.log(`   ${status} ${result.endpoint} (${result.method})`);
        });

        // WebSocket details
        console.log(`\n🌐 WebSocket Status: ${websocket.success ? '✅' : '❌'} ${websocket.message || websocket.error || ''}`);

        // Static files
        const staticFailed = staticFiles.filter(f => !f.success);
        if (staticFailed.length > 0) {
            console.log('\n📁 Static File Issues:');
            staticFailed.forEach(file => {
                console.log(`   ❌ ${file.file} - ${file.error || 'Failed to load'}`);
            });
        }

        // Recommendations
        this.displayRecommendations();
    }

    // Display recommendations based on test results
    displayRecommendations() {
        const { summary, endpoints, websocket } = this.results;

        console.log('\n💡 Recommendations:');

        if (summary.criticalSuccessful < summary.criticalEndpoints) {
            console.log('   🔥 Fix critical endpoint failures first');
        }

        if (!websocket.success) {
            console.log('   🌐 WebSocket connection issues may affect real-time updates');
        }

        if (summary.successful / summary.totalEndpoints < 0.8) {
            console.log('   📡 Multiple endpoint failures - check ESP32 web server configuration');
        }

        const postFailures = endpoints.filter(r => !r.success && r.method === 'POST').length;
        if (postFailures > 3) {
            console.log('   📝 Multiple POST endpoint failures - check CORS and content-type handling');
        }

        console.log('   📚 Check browser console for additional error details');
        console.log('   🔧 Verify ESP32 is running and accessible on the network');
    }

    // Export results for analysis
    exportResults() {
        const resultsString = JSON.stringify(this.results, null, 2);
        console.log('\n📋 Raw Results (copy for analysis):');
        console.log(resultsString);

        // Try to download as file if possible
        try {
            const blob = new Blob([resultsString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `esp32-connectivity-test-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('📁 Results exported as JSON file');
        } catch (error) {
            console.log('📋 Copy the raw results above for manual analysis');
        }

        return this.results;
    }
}

// Auto-run test when script loads
const connectivityChecker = new BackendConnectivityChecker();

// Expose globally for manual use
window.testBackendConnectivity = () => connectivityChecker.runFullTest();
window.exportConnectivityResults = () => connectivityChecker.exportResults();

// Auto-run after page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => connectivityChecker.runFullTest(), 2000);
    });
} else {
    setTimeout(() => connectivityChecker.runFullTest(), 2000);
}

console.log('🔧 Backend Connectivity Checker loaded');
console.log('💻 Run window.testBackendConnectivity() to test manually');
console.log('📁 Run window.exportConnectivityResults() to export results');
