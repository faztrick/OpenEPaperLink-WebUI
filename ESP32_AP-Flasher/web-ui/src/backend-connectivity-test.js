/**
 * Backend Connectivity Test Module
 * Tests and validates connections between frontend and ESP32 backend
 */

class BackendConnectivityChecker {
    constructor() {
        this.results = null;
        this.isRunning = false;
    }

    // Expected endpoints from API manager
    getExpectedEndpoints() {
        return {
            // Core endpoints
            'get_ap_config': { method: 'GET', critical: true },
            'get_db': { method: 'GET', critical: true },
            'get_wifi_config': { method: 'GET', critical: true },
            'save_wifi_config': { method: 'POST', critical: true },
            'tag_cmd': { method: 'POST', critical: true },
            
            // Configuration endpoints
            'get_config': { method: 'GET', critical: false },
            'save_config': { method: 'POST', critical: false },
            'get_sys_config': { method: 'GET', critical: false },
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
            'get_db': { method: 'GET', critical: true },
            'save_tag': { method: 'POST', critical: false },
            'delete_tag': { method: 'POST', critical: false },
            
            // Status and monitoring
            'status': { method: 'GET', critical: false },
            'get_version': { method: 'GET', critical: false },
            'get_uptime': { method: 'GET', critical: false }
        };
    }

    // Test individual endpoint
    async testEndpoint(endpoint, config) {
        const startTime = Date.now();
        
        try {
            // Use HEAD method for GET endpoints to avoid data transfer
            const method = config.method === 'GET' ? 'HEAD' : config.method;
            
            const response = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                // Don't send body for HEAD requests
                ...(method !== 'HEAD' && config.method === 'POST' ? { body: '{}' } : {})
            });

            const responseTime = Date.now() - startTime;

            return {
                endpoint,
                method: config.method,
                success: response.ok,
                status: response.status,
                responseTime,
                critical: config.critical,
                error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            return {
                endpoint,
                method: config.method,
                success: false,
                status: null,
                responseTime,
                critical: config.critical,
                error: error.message
            };
        }
    }

    // Test WebSocket connection
    async testWebSocket() {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;

            try {
                const ws = new WebSocket(wsUrl);
                
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve({
                        success: false,
                        responseTime: Date.now() - startTime,
                        error: 'Connection timeout'
                    });
                }, 5000);

                ws.onopen = () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve({
                        success: true,
                        responseTime: Date.now() - startTime,
                        message: 'WebSocket connection successful'
                    });
                };

                ws.onerror = (error) => {
                    clearTimeout(timeout);
                    resolve({
                        success: false,
                        responseTime: Date.now() - startTime,
                        error: 'WebSocket connection failed'
                    });
                };

            } catch (error) {
                resolve({
                    success: false,
                    responseTime: Date.now() - startTime,
                    error: error.message
                });
            }
        });
    }

    // Test static file accessibility
    async testStaticFiles() {
        const staticFiles = [
            'favicon.ico',
            'style.css',
            'script.js'
        ];

        const results = [];

        for (const file of staticFiles) {
            try {
                const response = await fetch(file, { method: 'HEAD' });
                results.push({
                    file,
                    success: response.ok,
                    status: response.status
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
    async runTest() {
        if (this.isRunning) {
            console.log('BackendConnectivityChecker: Test already running');
            return this.results;
        }

        this.isRunning = true;
        console.log('🔄 Starting backend connectivity test...');

        const startTime = Date.now();
        const endpoints = this.getExpectedEndpoints();
        const endpointResults = [];

        // Test all endpoints
        for (const [endpoint, config] of Object.entries(endpoints)) {
            const result = await this.testEndpoint(endpoint, config);
            endpointResults.push(result);
            
            // Small delay between requests to avoid overwhelming the server
            if (endpointResults.length < Object.keys(endpoints).length) {
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
        this.isRunning = false;
        return this.results;
    }

    // Display test results in console
    displayResults() {
        if (!this.results) return;

        const { summary, endpoints, websocket, staticFiles } = this.results;

        console.log('\n🔍 Backend Connectivity Test Results');
        console.log('=' .repeat(50));
        
        // Summary
        console.log(`📊 Test Summary:`);
        console.log(`   Total Endpoints: ${summary.totalEndpoints}`);
        console.log(`   Successful: ${summary.successful} (${Math.round(summary.successful/summary.totalEndpoints*100)}%)`);
        console.log(`   Failed: ${summary.failed}`);
        console.log(`   Critical Endpoints: ${summary.criticalEndpoints}`);
        console.log(`   Critical Successful: ${summary.criticalSuccessful}/${summary.criticalEndpoints}`);
        console.log(`   Test Duration: ${summary.testDuration}ms`);

        // Critical endpoints status
        const criticalEndpoints = endpoints.filter(e => e.critical);
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
            console.log('   ⚠️  Critical endpoints are failing - check ESP32 backend');
        }

        if (!websocket.success) {
            console.log('   ⚠️  WebSocket connection failed - real-time updates unavailable');
        }

        if (summary.successful / summary.totalEndpoints < 0.5) {
            console.log('   ❌ Most endpoints failing - check if ESP32 is running and accessible');
        }

        const slowEndpoints = endpoints.filter(e => e.success && e.responseTime > 5000);
        if (slowEndpoints.length > 0) {
            console.log('   ⚠️  Slow endpoints detected - check network performance');
        }

        if (summary.successful === summary.totalEndpoints && websocket.success) {
            console.log('   ✅ All systems working correctly!');
        }
    }

    // Get results for external use
    getResults() {
        return this.results;
    }
}

// Auto-run test when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit for other scripts to load
    setTimeout(() => {
        window.backendTester = new BackendConnectivityChecker();
        
        // Auto-run test if not in development mode
        if (!window.location.hostname.includes('localhost')) {
            window.backendTester.runTest();
        }
    }, 2000);
});

// Export for manual testing
window.BackendConnectivityChecker = BackendConnectivityChecker;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackendConnectivityChecker;
}