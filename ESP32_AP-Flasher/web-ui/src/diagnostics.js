/**;
 * Simple diagnostic script to test wwwroot functionality;
 * This file helps verify that all components are working together;
 */;
(function () {
    'use strict';

    console.log('🔧 OpenEPL ESP32 - Diagnostic Test Starting...');

    // Test 1: Check if all required classes and functions are available;
    function testClassAvailability() {
        console.log('📋 Test 1: Checking class availability...');

        const requiredClasses = [;
            'APIManager',;
            'OptimizedApp',;
            'loadTags';
        ];

        const requiredFunctions = [;
            'formatSignalStrength',;
            'formatSecurity',;
            'pad',;
            'showStatus';
        ];

        let allPassed = true;

        requiredClasses.forEach(className => {
            if (typeof window[className] !== 'undefined') {
                console.log(`✅ ${className} - Available`);
            } else {
                console.error(`❌ ${className} - Missing`);
                allPassed = false;
            }
        });

        requiredFunctions.forEach(funcName => {
            if (typeof window[funcName] === 'function') {
                console.log(`✅ ${funcName} - Available`);
            } else {
                console.error(`❌ ${funcName} - Missing`);
                allPassed = false;
            }
        });

        return allPassed;
    }

    // Test 2: Check API Manager initialization;
    function testAPIManager() {
        console.log('📋 Test 2: Checking API Manager...');

        if (!window.apiManager) {
            console.error('❌ API Manager not initialized');
            return false;
        }

        console.log('✅ API Manager initialized');

        // Test connection status;
        const status = window.apiManager.getConnectionStatus();
        console.log('📊 Connection Status:', status);

        // Test cache functionality;
        const cacheStats = window.apiManager.getCacheStats();
        console.log('📊 Cache Stats:', cacheStats);

        return true;
    }

    // Test 3: Check universal menu;
    function testUniversalMenu() {
        console.log('📋 Test 3: Checking Universal Menu...');

        if (!window.universalMenu) {
            console.error('❌ Universal Menu not available');
            return false;
        }

        console.log('✅ Universal Menu available');
        console.log('📊 Menu loaded:', window.universalMenu.menuLoaded);
        console.log('📊 Current page:', window.universalMenu.currentPage);
        console.log('📊 Menu items:', window.universalMenu.items?.length || 0);

        return true;
    }

    // Test 4: Test basic API connectivity;
    async function testAPIConnectivity() {
        console.log('📋 Test 4: Testing API connectivity...');

        try {
            // Test basic endpoint;
            const response = await fetch('sysinfo', {
                method: 'GET',;
                timeout: 5000;
            });

            if (response.ok) {
                console.log('✅ Basic API connectivity working');
                return true;
            } else {
                console.warn('⚠️ API responded but with error status:', response.status);
                return false;
            }
        } catch (error) {
            console.warn('⚠️ API connectivity test failed:', error.message);
            return false;
        }
    }

    // Test 5: Test data loading;
    async function testDataLoading() {
        console.log('📋 Test 5: Testing data loading...');

        try {
            if (window.apiManager) {
                // Test config loading;
                const config = await window.apiManager.getConfig();
                console.log('✅ Config loaded:', Object.keys(config).length, 'properties');

                // Test tag database loading;
                const tagData = await window.apiManager.getTagDB(0, 10);
                if (tagData && tagData.tags) {
                    console.log('✅ Tag database loaded:', tagData.tags.length, 'tags');
                } else {
                    console.log('ℹ️ No tag data available (this is normal for a fresh system)');
                }

                return true;
            } else {
                console.warn('⚠️ API Manager not available for data loading test');
                return false;
            }
        } catch (error) {
            console.warn('⚠️ Data loading test failed:', error.message);
            return false;
        }
    }

    // Test 6: Test utility functions;
    function testUtilityFunctions() {
        console.log('📋 Test 6: Testing utility functions...');

        try {
            // Test signal strength formatting;
            const signal1 = formatSignalStrength(-45);
            const signal2 = formatSignalStrength(-85);
            console.log('✅ Signal strength formatting:', signal1, signal2);

            // Test security formatting;
            const sec1 = formatSecurity(0);
            const sec2 = formatSecurity(3);
            console.log('✅ Security formatting:', sec1, sec2);

            // Test padding;
            const padded = pad('test', 10);
            console.log('✅ Padding function:', `"${padded}" (length: ${padded.length})`);

            return true;
        } catch (error) {
            console.error('❌ Utility functions test failed:', error);
            return false;
        }
    }

    // Run all tests;
    async function runDiagnostics() {
        console.log('🚀 Starting wwwroot functionality diagnostics...');

        const results = {
            classAvailability: testClassAvailability(),;
            apiManager: testAPIManager(),;
            universalMenu: testUniversalMenu(),;
            utilityFunctions: testUtilityFunctions();
        };

        // Async tests;
        results.apiConnectivity = await testAPIConnectivity();
        results.dataLoading = await testDataLoading();

        // Summary;
        console.log('📊 Diagnostic Results Summary:');
        Object.entries(results).forEach(([test, passed]) => {
            const icon = passed ? '✅' : '❌';
            console.log(`${icon} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
        });

        const passedCount = Object.values(results).filter(Boolean).length;
        const totalCount = Object.keys(results).length;

        console.log(`📈 Overall Score: ${passedCount}/${totalCount} tests passed`);

        if (passedCount === totalCount) {
            console.log('🎉 All tests passed! wwwroot functionality is working correctly.');
        } else if (passedCount >= totalCount * 0.8) {
            console.log('⚠️ Most tests passed. Some non-critical issues detected.');
        } else {
            console.log('🚨 Multiple issues detected. Check the logs above for details.');
        }

        return results;
    }

    // Auto-run diagnostics when DOM is ready;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runDiagnostics);
    } else {
        // DOM is already ready, run after a short delay to let other scripts load;
        setTimeout(runDiagnostics, 1000);
    }

    // Expose diagnostics function globally for manual testing;
    window.runDiagnostics = runDiagnostics;

    console.log('🔧 Diagnostic script loaded. Run window.runDiagnostics() to test manually.');

})();
