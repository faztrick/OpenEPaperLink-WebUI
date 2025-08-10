/**;
 * API Manager Test Suite;
 * Tests the alignment between frontend API manager and backend endpoints;
 */;
// Test script to verify API manager endpoints;
async function testAPIManager() {
    console.log('🧪 Testing API Manager Endpoint Alignment...');

    if (!window.apiManager) {
        console.error('❌ API Manager not found!');
        return;
    }

    // Test 1: Check endpoint configuration;
    const endpoints = window.apiManager.getAvailableEndpoints();
    console.log('📋 Available Endpoints:', Object.keys(endpoints).length);

    // Test 2: Test connection status;
    const status = window.apiManager.getConnectionStatus();
    console.log('🔗 Connection Status:', status);

    // Test 3: Test critical endpoints;
    const criticalEndpoints = [;
        'sysinfo',;
        'version',;
        'config',;
        'wifiConfig',;
        'tagDB',;
        'features';
    ];

    console.log('🚀 Testing critical endpoints...');

    for (const endpoint of criticalEndpoints) {
        try {
            const result = await window.apiManager.testEndpoint(endpoint);
            const status = result.available ? '✅' : '❌';
            console.log(`${status} ${endpoint}: ${result.url}`);
        } catch (error) {
            console.log(`❌ ${endpoint}: ${error.message}`);
        }
    }

    // Test 4: Test basic system info fetch;
    try {
        console.log('📊 Testing system info fetch...');
        const sysInfo = await window.apiManager.fetch('sysinfo');
        console.log('✅ System info retrieved successfully');
    } catch (error) {
        console.log('❌ System info failed:', error.message);
    }

    // Test 5: Test features endpoint;
    try {
        console.log('🔧 Testing features endpoint...');
        const features = await window.apiManager.getFeatures();
        if (features.success) {
            console.log('✅ Features retrieved successfully');
        } else {
            console.log('❌ Features failed:', features.error);
        }
    } catch (error) {
        console.log('❌ Features failed:', error.message);
    }

    console.log('🏁 API Manager tests completed!');
}

// Auto-run tests when page loads;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(testAPIManager, 1000);
    });
} else {
    setTimeout(testAPIManager, 1000);
}

// Make test function available globally;
window.testAPIManager = testAPIManager;
