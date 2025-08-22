/**
 * Simple diagnostic script to test wwwroot functionality
 * This file helps verify that all components are working together
 */
(function () {
    'use strict';

    console.log('🔧 OpenEPL ESP32 - Diagnostic Test Starting...');

    // Test 1: Check if all required classes and functions are available
    function testClassAvailability() {
        console.log('📋 Test 1: Checking class and function availability...');
        
        const requiredFunctions = [
            'fetch',
            'WebSocket',
            'FormData',
            'URL',
            'localStorage'
        ];

        const results = [];
        
        requiredFunctions.forEach(func => {
            const available = typeof window[func] !== 'undefined';
            results.push({
                name: func,
                available,
                status: available ? '✅' : '❌'
            });
            console.log(`   ${available ? '✅' : '❌'} ${func}`);
        });

        // Check for custom functions
        const customFunctions = [
            'apiErrorHandler',
            'safeFetch',
            'submitFormSafely',
            'validateEndpoint'
        ];

        console.log('   Custom functions:');
        customFunctions.forEach(func => {
            const available = typeof window[func] !== 'undefined';
            results.push({
                name: func,
                available,
                status: available ? '✅' : '❌'
            });
            console.log(`     ${available ? '✅' : '❌'} ${func}`);
        });

        const passed = results.filter(r => r.available).length;
        const total = results.length;
        
        console.log(`   Result: ${passed}/${total} functions available`);
        return passed === total;
    }

    // Test 2: Check API Manager initialization
    function testAPIManager() {
        console.log('📋 Test 2: Checking API Manager...');
        
        const hasApiManager = window.app && typeof window.app === 'object';
        const hasOptimizedApp = window.app instanceof OptimizedApp;
        
        console.log(`   ${hasApiManager ? '✅' : '❌'} API Manager available`);
        console.log(`   ${hasOptimizedApp ? '✅' : '❌'} OptimizedApp instance`);
        
        if (hasApiManager) {
            console.log(`   📊 API Manager Status: ${window.app.isInitialized ? 'Initialized' : 'Not Initialized'}`);
            console.log(`   📊 Tag Count: ${window.app.getTagCount ? window.app.getTagCount() : 'Unknown'}`);
        }

        return hasApiManager;
    }

    // Test 3: Check universal menu
    function testUniversalMenu() {
        console.log('📋 Test 3: Checking universal menu...');
        
        const menuElements = document.querySelectorAll('nav, .menu, #menu, .navigation');
        const hasMenu = menuElements.length > 0;
        
        console.log(`   ${hasMenu ? '✅' : '❌'} Menu elements found: ${menuElements.length}`);
        
        return hasMenu;
    }

    // Test 4: Test basic API connectivity
    async function testAPIConnectivity() {
        console.log('📋 Test 4: Testing API connectivity...');
        
        const testEndpoints = [
            'get_ap_config',
            'get_db',
            'get_wifi_config'
        ];

        const results = [];
        
        for (const endpoint of testEndpoints) {
            try {
                const response = await fetch(endpoint, { method: 'HEAD' });
                const success = response.ok;
                results.push({ endpoint, success, status: response.status });
                console.log(`   ${success ? '✅' : '❌'} ${endpoint} (${response.status})`);
            } catch (error) {
                results.push({ endpoint, success: false, error: error.message });
                console.log(`   ❌ ${endpoint} (Error: ${error.message})`);
            }
        }

        const passed = results.filter(r => r.success).length;
        console.log(`   Result: ${passed}/${testEndpoints.length} endpoints accessible`);
        
        return passed > 0; // At least one endpoint should work
    }

    // Test 5: Test data loading
    async function testDataLoading() {
        console.log('📋 Test 5: Testing data loading...');
        
        try {
            if (window.app && typeof window.app.refreshData === 'function') {
                const result = await window.app.refreshData();
                console.log(`   ${result ? '✅' : '❌'} App data refresh`);
                return result;
            } else {
                // Fallback test
                const response = await fetch('get_db?pos=0');
                const data = await response.json();
                const hasData = data && (data.tags || data.config);
                console.log(`   ${hasData ? '✅' : '❌'} Direct data fetch`);
                return hasData;
            }
        } catch (error) {
            console.log(`   ❌ Data loading failed: ${error.message}`);
            return false;
        }
    }

    // Test 6: Test utility functions
    function testUtilityFunctions() {
        console.log('📋 Test 6: Testing utility functions...');
        
        const tests = [
            {
                name: 'Error Handler',
                test: () => {
                    if (typeof window.apiErrorHandler === 'function') {
                        // Test error handler (should not throw)
                        window.apiErrorHandler(new Error('Test error'), 'test', 'test_endpoint');
                        return true;
                    }
                    return false;
                }
            },
            {
                name: 'Safe Notification',
                test: () => {
                    if (typeof window.showNotificationSafe === 'function') {
                        window.showNotificationSafe('Test notification', 'info');
                        return true;
                    }
                    return false;
                }
            },
            {
                name: 'Endpoint Validation',
                test: () => {
                    return typeof window.validateEndpoint === 'function';
                }
            }
        ];

        const results = tests.map(test => {
            try {
                const result = test.test();
                console.log(`   ${result ? '✅' : '❌'} ${test.name}`);
                return result;
            } catch (error) {
                console.log(`   ❌ ${test.name} (Error: ${error.message})`);
                return false;
            }
        });

        const passed = results.filter(r => r).length;
        console.log(`   Result: ${passed}/${tests.length} utility functions working`);
        
        return passed === tests.length;
    }

    // Run all tests
    async function runDiagnostics() {
        console.log('🚀 Starting wwwroot functionality diagnostics...');

        const results = {
            classAvailability: testClassAvailability(),
            apiManager: testAPIManager(),
            universalMenu: testUniversalMenu(),
            utilityFunctions: testUtilityFunctions()
        };

        // Async tests
        console.log('🔄 Running async tests...');
        try {
            results.apiConnectivity = await testAPIConnectivity();
            results.dataLoading = await testDataLoading();
        } catch (error) {
            console.error('❌ Async tests failed:', error);
            results.apiConnectivity = false;
            results.dataLoading = false;
        }

        // Summary
        console.log('\n📊 Diagnostic Results Summary:');
        console.log('=' .repeat(40));
        
        const testNames = [
            'classAvailability',
            'apiManager', 
            'universalMenu',
            'utilityFunctions',
            'apiConnectivity',
            'dataLoading'
        ];

        const passed = testNames.filter(name => results[name]).length;
        const total = testNames.length;

        testNames.forEach(name => {
            const status = results[name] ? '✅ PASS' : '❌ FAIL';
            const displayName = name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            console.log(`${status} - ${displayName}`);
        });

        console.log('=' .repeat(40));
        console.log(`🎯 Overall Score: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 All diagnostics passed! System is functioning correctly.');
        } else if (passed >= total - 1) {
            console.log('⚠️  Minor issues detected, but core functionality is working.');
        } else {
            console.log('❌ Multiple issues detected. Please check the implementation.');
        }

        // Store results for external access
        window.diagnosticResults = {
            ...results,
            summary: {
                passed,
                total,
                percentage: Math.round((passed / total) * 100),
                timestamp: new Date().toISOString()
            }
        };

        return results;
    }

    // Auto-run diagnostics when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runDiagnostics);
    } else {
        // DOM already loaded
        runDiagnostics();
    }

    // Export function for manual testing
    window.runDiagnostics = runDiagnostics;

})();