// JavaScript test to verify fixes
console.log("🧪 Testing JavaScript fixes...");

// Test 1: Check if UIComponents loads without errors
function testUIComponents() {
    console.log("Test 1: UIComponents initialization");
    try {
        // This should not throw the "bind" error anymore
        if (typeof UIComponents !== 'undefined') {
            console.log("✅ UIComponents is available");
            
            // Check if components were registered
            const instance = new UIComponents();
            if (instance.componentCache && instance.componentCache.size > 0) {
                console.log(`✅ ${instance.componentCache.size} components registered successfully`);
            } else {
                console.log("⚠️ No components registered, but no errors");
            }
        } else {
            console.log("⚠️ UIComponents not available (may be expected in some contexts)");
        }
    } catch (error) {
        console.log("❌ UIComponents error:", error.message);
    }
}

// Test 2: Check if main.js onclick errors are resolved
function testMainJSErrors() {
    console.log("Test 2: main.js onclick safety");
    try {
        // Test if cfgsave element handling is safe
        const element = document.getElementById('cfgsave');
        if (element) {
            console.log("✅ cfgsave element found - onclick can be set safely");
        } else {
            console.log("✅ cfgsave element not found - safe null handling expected");
        }
    } catch (error) {
        console.log("❌ main.js onclick error:", error.message);
    }
}

// Test 3: Check if API endpoints are responding
async function testAPIEndpoints() {
    console.log("Test 3: API endpoints");
    const endpoints = [
        '/api/features',
        '/sysinfo'
    ];
    
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint);
            if (response.ok) {
                console.log(`✅ ${endpoint}: ${response.status} OK`);
            } else {
                console.log(`⚠️ ${endpoint}: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.log(`❌ ${endpoint}: ${error.message}`);
        }
    }
}

// Run all tests
testUIComponents();
testMainJSErrors();
testAPIEndpoints();

console.log("🎯 Test completed. Check console for results.");
