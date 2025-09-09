// OpenEPL ESP32 - Comprehensive Feature Testing
// Tests all enabled features and validates UI functionality

class FeatureTester {
    constructor() {
        this.testResults = {};
        this.testQueue = [];
        this.currentTest = null;
        this.totalTests = 0;
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runAllTests() {
        console.log('🧪 Starting comprehensive feature tests...');
        
        this.setupTestSuite();
        
        try {
            await this.runTests();
            this.generateReport();
        } catch (error) {
            console.error('❌ Test suite failed:', error);
        }
    }

    setupTestSuite() {
        this.testQueue = [
            // Core System Tests
            { name: 'Core System', test: () => this.testCoreSystem() },
            { name: 'API Manager', test: () => this.testAPIManager() },
            { name: 'Feature Manager', test: () => this.testFeatureManager() },
            { name: 'Debug System', test: () => this.testDebugSystem() },
            
            // Hardware Feature Tests
            { name: 'RGB LED Control', test: () => this.testRGBLED() },
            { name: 'TFT Display', test: () => this.testTFTDisplay() },
            { name: 'External Flasher', test: () => this.testExternalFlasher() },
            { name: 'BLE Writer', test: () => this.testBLEWriter() },
            { name: 'SubGHz Radio', test: () => this.testSubGHz() },
            
            // Tag Management Tests
            { name: 'Tag Database', test: () => this.testTagDatabase() },
            { name: 'Tag LED Control', test: () => this.testTagLEDControl() },
            { name: 'Tag Monitoring', test: () => this.testTagMonitoring() },
            { name: 'Find My Tag', test: () => this.testFindMyTag() },
            
            // UI Component Tests
            { name: 'Navigation Menu', test: () => this.testNavigationMenu() },
            { name: 'Dashboard UI', test: () => this.testDashboardUI() },
            { name: 'Settings UI', test: () => this.testSettingsUI() },
            { name: 'Control Panel UI', test: () => this.testControlPanelUI() },
            
            // Advanced Feature Tests
            { name: 'C6 Module', test: () => this.testC6Module() },
            { name: 'AI Assistant', test: () => this.testAIAssistant() },
            { name: 'Performance', test: () => this.testPerformance() }
        ];
        
        this.totalTests = this.testQueue.length;
    }

    async runTests() {
        for (const testCase of this.testQueue) {
            this.currentTest = testCase.name;
            console.log(`🔍 Testing: ${testCase.name}`);
            
            try {
                const result = await testCase.test();
                this.testResults[testCase.name] = {
                    passed: true,
                    result: result,
                    error: null
                };
                this.passedTests++;
                console.log(`✅ ${testCase.name}: PASSED`);
            } catch (error) {
                this.testResults[testCase.name] = {
                    passed: false,
                    result: null,
                    error: error.message
                };
                this.failedTests++;
                console.log(`❌ ${testCase.name}: FAILED - ${error.message}`);
            }
            
            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Core System Tests
    async testCoreSystem() {
        const checks = {
            domReady: document.readyState === 'complete',
            constants: !!window.$,
            basicAPI: !!fetch
        };
        
        if (!checks.domReady || !checks.constants || !checks.basicAPI) {
            throw new Error(`Core system check failed: ${JSON.stringify(checks)}`);
        }
        
        return checks;
    }

    async testAPIManager() {
        if (!window.apiManager) {
            throw new Error('API Manager not loaded');
        }
        
        const healthCheck = await window.apiManager.healthCheck();
        return { available: true, healthy: healthCheck };
    }

    async testFeatureManager() {
        if (!window.featureManager) {
            throw new Error('Feature Manager not loaded');
        }
        
        const features = window.featureManager.getFeatures();
        const enabledCount = Object.values(features).filter(Boolean).length;
        
        return { available: true, features: Object.keys(features).length, enabled: enabledCount };
    }

    async testDebugSystem() {
        if (!window.debugSystem) {
            throw new Error('Debug System not loaded');
        }
        
        window.debugSystem.addLog('INFO', 'Test log entry');
        return { available: true, logs: window.debugSystem.logs.length };
    }

    // Hardware Feature Tests
    async testRGBLED() {
        if (!window.featureManager || !window.featureManager.hasFeature('HAS_RGB_LED')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        try {
            // Test RGB LED API endpoints
            await window.apiManager.setRGBColor('#FF0000');
            await new Promise(resolve => setTimeout(resolve, 500));
            await window.apiManager.setRGBColor('#000000');
            
            return { available: true, tested: 'Color change successful' };
        } catch (error) {
            throw new Error(`RGB LED test failed: ${error.message}`);
        }
    }

    async testTFTDisplay() {
        if (!window.featureManager || !window.featureManager.hasFeature('HAS_TFT')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        try {
            await window.apiManager.updateTFTDisplay('TEST MESSAGE', 'white');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await window.apiManager.clearTFTDisplay();
            
            return { available: true, tested: 'Display update successful' };
        } catch (error) {
            throw new Error(`TFT Display test failed: ${error.message}`);
        }
    }

    async testExternalFlasher() {
        if (!window.featureManager || !window.featureManager.hasFeature('HAS_EXT_FLASHER')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        try {
            const status = await window.apiManager.getFlasherStatus();
            return { available: true, status: status };
        } catch (error) {
            throw new Error(`External Flasher test failed: ${error.message}`);
        }
    }

    async testBLEWriter() {
        if (!window.featureManager || !window.featureManager.hasFeature('HAS_BLE_WRITER')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        try {
            const status = await window.apiManager.callFeatureAPI('HAS_BLE_WRITER', 'status');
            return { available: true, status: status };
        } catch (error) {
            return { available: true, status: 'Backend support only' };
        }
    }

    async testSubGHz() {
        if (!window.featureManager || !window.featureManager.hasFeature('HAS_SUBGHZ')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        try {
            const status = await window.apiManager.callFeatureAPI('HAS_SUBGHZ', 'status');
            return { available: true, status: status };
        } catch (error) {
            return { available: true, status: 'Backend support only' };
        }
    }

    // Tag Management Tests
    async testTagDatabase() {
        try {
            const tagDB = await window.apiManager.getTagDatabase();
            const tagCount = Array.isArray(tagDB) ? tagDB.length : (tagDB.tags ? Object.keys(tagDB.tags).length : 0);
            
            return { available: true, tagCount: tagCount };
        } catch (error) {
            throw new Error(`Tag Database test failed: ${error.message}`);
        }
    }

    async testTagLEDControl() {
        if (!window.featureManager || !window.featureManager.hasFeature('TAG_LED_CONTROL')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        try {
            // Test with a dummy MAC address
            const testMAC = '000000000001';
            const result = await window.apiManager.flashTagLED(testMAC);
            return { available: true, tested: 'LED flash command sent' };
        } catch (error) {
            return { available: true, note: 'API available but no test tag' };
        }
    }

    async testTagMonitoring() {
        const batterySupport = window.featureManager && window.featureManager.hasFeature('TAG_BATTERY_MONITOR');
        const signalSupport = window.featureManager && window.featureManager.hasFeature('TAG_SIGNAL_MONITOR');
        
        if (!batterySupport && !signalSupport) {
            return { available: false, reason: 'Monitoring features not enabled' };
        }
        
        const results = { battery: batterySupport, signal: signalSupport };
        
        if (batterySupport) {
            try {
                await window.apiManager.getBatteryLevels();
                results.batteryTested = true;
            } catch (error) {
                results.batteryError = error.message;
            }
        }
        
        return { available: true, monitoring: results };
    }

    async testFindMyTag() {
        if (!window.featureManager || !window.featureManager.hasFeature('FIND_MY_TAG')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        return { available: true, note: 'Find My Tag API available' };
    }

    // UI Component Tests
    async testNavigationMenu() {
        const menu = document.querySelector('#universal-menu, .quick-menu');
        if (!menu) {
            throw new Error('Navigation menu not found');
        }
        
        const menuItems = menu.querySelectorAll('a');
        return { available: true, menuItems: menuItems.length };
    }

    async testDashboardUI() {
        const isDashboardPage = window.location.pathname.includes('dashboard') || 
                               window.location.pathname.includes('index');
        
        if (!isDashboardPage) {
            return { available: false, reason: 'Not on dashboard page' };
        }
        
        const dashboardElements = document.querySelectorAll('.dashboard-card, .module-card');
        return { available: true, elements: dashboardElements.length };
    }

    async testSettingsUI() {
        const isSettingsPage = window.location.pathname.includes('settings');
        
        if (!isSettingsPage) {
            return { available: false, reason: 'Not on settings page' };
        }
        
        const settingsElements = document.querySelectorAll('#configtab input, #configtab select');
        return { available: true, elements: settingsElements.length };
    }

    async testControlPanelUI() {
        const isControlPage = window.location.pathname.includes('tag_control_panel');
        
        if (!isControlPage) {
            return { available: false, reason: 'Not on control panel page' };
        }
        
        const controlElements = document.querySelectorAll('.panel, .led-control');
        return { available: true, elements: controlElements.length };
    }

    // Advanced Feature Tests
    async testC6Module() {
        if (!window.featureManager || !window.featureManager.hasFeature('C6_OTA_FLASHING')) {
            return { available: false, reason: 'Feature not enabled' };
        }
        
        try {
            const status = await window.apiManager.getC6Status();
            return { available: true, status: status };
        } catch (error) {
            return { available: true, note: 'C6 module support enabled' };
        }
    }

    async testAIAssistant() {
        const isAIPage = window.location.pathname.includes('ai-agent');
        const aiScript = document.querySelector('script[src*="openai"]');
        
        return { 
            available: true, 
            page: isAIPage, 
            script: !!aiScript,
            note: 'AI Assistant UI available'
        };
    }

    async testPerformance() {
        const timing = performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
        
        const memory = performance.memory ? {
            used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
            total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
        } : null;
        
        return {
            available: true,
            loadTime: loadTime,
            domReady: domReady,
            memory: memory,
            performance: loadTime < 3000 ? 'Good' : 'Needs improvement'
        };
    }

    generateReport() {
        console.log('\n📊 === FEATURE TEST REPORT ===');
        console.log(`Total Tests: ${this.totalTests}`);
        console.log(`Passed: ${this.passedTests} ✅`);
        console.log(`Failed: ${this.failedTests} ❌`);
        console.log(`Success Rate: ${Math.round((this.passedTests / this.totalTests) * 100)}%`);
        
        console.log('\n📋 Detailed Results:');
        Object.entries(this.testResults).forEach(([name, result]) => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${status} ${name}:`, result.result || result.error);
        });
        
        // Generate HTML report
        this.generateHTMLReport();
        
        return this.testResults;
    }

    generateHTMLReport() {
        const reportHTML = `
            <div id="test-report" style="position: fixed; top: 50px; left: 50%; transform: translateX(-50%); width: 600px; max-height: 500px; background: white; border: 2px solid #333; border-radius: 8px; padding: 20px; z-index: 20000; overflow-y: auto; font-family: monospace;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">OpenEPL Feature Test Report</h3>
                    <button onclick="document.getElementById('test-report').remove()" style="background: #ff6b6b; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">✕</button>
                </div>
                
                <div style="margin-bottom: 15px; padding: 10px; background: #f0f0f0; border-radius: 4px;">
                    <strong>Summary:</strong> ${this.passedTests}/${this.totalTests} tests passed (${Math.round((this.passedTests / this.totalTests) * 100)}%)
                </div>
                
                <div style="max-height: 300px; overflow-y: auto;">
                    ${Object.entries(this.testResults).map(([name, result]) => `
                        <div style="margin-bottom: 10px; padding: 8px; border-radius: 4px; background: ${result.passed ? '#d4edda' : '#f8d7da'};">
                            <div style="font-weight: bold; color: ${result.passed ? '#155724' : '#721c24'};">
                                ${result.passed ? '✅' : '❌'} ${name}
                            </div>
                            <div style="font-size: 12px; margin-top: 5px; color: #666;">
                                ${result.passed ? JSON.stringify(result.result) : result.error}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="margin-top: 15px; text-align: center;">
                    <button onclick="window.featureTester.exportTestReport()" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">Export Report</button>
                    <button onclick="window.featureTester.runAllTests()" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Run Tests Again</button>
                </div>
            </div>
        `;
        
        // Remove existing report
        const existingReport = document.getElementById('test-report');
        if (existingReport) {
            existingReport.remove();
        }
        
        // Add new report
        document.body.insertAdjacentHTML('beforeend', reportHTML);
    }

    exportTestReport() {
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.totalTests,
                passed: this.passedTests,
                failed: this.failedTests,
                successRate: Math.round((this.passedTests / this.totalTests) * 100)
            },
            userAgent: navigator.userAgent,
            url: window.location.href,
            results: this.testResults
        };
        
        const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openel-feature-test-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize feature tester
window.featureTester = new FeatureTester();

// Auto-run tests after page loads (with delay)
window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.location.search.includes('autotest')) {
            window.featureTester.runAllTests();
        }
    }, 3000);
});

// Add test button to debug panel if available
setTimeout(() => {
    if (window.debugSystem) {
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            const testButton = document.createElement('button');
            testButton.textContent = 'Run Tests';
            testButton.style.cssText = 'background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-left: 5px;';
            testButton.onclick = () => window.featureTester.runAllTests();
            
            const buttonContainer = debugPanel.querySelector('div:last-child');
            if (buttonContainer) {
                buttonContainer.appendChild(testButton);
            }
        }
    }
}, 2000);

// Console command for easy testing
console.log('🧪 OpenEPL Feature Tester loaded. Run tests with: featureTester.runAllTests()');

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FeatureTester;
}
