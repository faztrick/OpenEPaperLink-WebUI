// Test file for OpenAI Agent optimizations
// =========================================

// This file tests the optimized OpenAI Agent functions
// Run this in browser console to validate optimizations

async function testOptimizations() {
    console.log('🧪 Testing OpenAI Agent Optimizations...');
    
    if (typeof openAIAgent === 'undefined') {
        console.error('❌ OpenAI Agent not found. Please ensure it\'s loaded.');
        return;
    }
    
    const tests = [];
    
    // Test 1: Utility Functions Exist
    tests.push({
        name: 'Utility Functions Exist',
        test: () => {
            const requiredMethods = [
                'makeApiRequest',
                'performFileOperation', 
                'makeOpenAIRequest',
                'encodeUrlParams',
                'addToConversationHistory',
                'executeActionBasedOperation'
            ];
            
            const missing = requiredMethods.filter(method => 
                typeof openAIAgent[method] !== 'function'
            );
            
            return {
                success: missing.length === 0,
                details: missing.length > 0 ? `Missing methods: ${missing.join(', ')}` : 'All utility methods present'
            };
        }
    });
    
    // Test 2: Conversation History Management
    tests.push({
        name: 'Conversation History Management',
        test: () => {
            const initialLength = openAIAgent.conversationHistory.length;
            
            // Add test messages
            openAIAgent.addToConversationHistory('user', 'test message 1');
            openAIAgent.addToConversationHistory('assistant', 'test response 1');
            
            const newLength = openAIAgent.conversationHistory.length;
            
            return {
                success: newLength === initialLength + 2,
                details: `History length: ${initialLength} → ${newLength}`
            };
        }
    });
    
    // Test 3: URL Parameter Encoding
    tests.push({
        name: 'URL Parameter Encoding',
        test: () => {
            const params = { path: '/test path/file.txt', mode: 'read' };
            const encoded = openAIAgent.encodeUrlParams(params);
            const expected = 'path=%2Ftest%20path%2Ffile.txt&mode=read';
            
            return {
                success: encoded === expected,
                details: `Encoded: "${encoded}", Expected: "${expected}"`
            };
        }
    });
    
    // Test 4: Function Binding
    tests.push({
        name: 'Function Binding',
        test: () => {
            const functionNames = Object.keys(openAIAgent.availableFunctions);
            const boundCorrectly = functionNames.every(name => 
                typeof openAIAgent.availableFunctions[name] === 'function'
            );
            
            return {
                success: boundCorrectly,
                details: `Available functions: ${functionNames.length} (${functionNames.join(', ')})`
            };
        }
    });
    
    // Test 5: Configuration Loading Optimization
    tests.push({
        name: 'Configuration Structure',
        test: () => {
            const hasConfig = openAIAgent.config !== null;
            const hasOpenAIConfig = hasConfig && openAIAgent.config.openai;
            const hasESP32Config = hasConfig && openAIAgent.config.esp32;
            
            return {
                success: hasConfig && hasOpenAIConfig,
                details: `Config loaded: ${hasConfig}, OpenAI: ${hasOpenAIConfig}, ESP32: ${hasESP32Config}`
            };
        }
    });
    
    // Run all tests
    console.log('\n📋 Running Tests...\n');
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const result = test.test();
            if (result.success) {
                console.log(`✅ ${test.name}: PASSED`);
                console.log(`   ${result.details}`);
                passed++;
            } else {
                console.log(`❌ ${test.name}: FAILED`);
                console.log(`   ${result.details}`);
                failed++;
            }
        } catch (error) {
            console.log(`💥 ${test.name}: ERROR`);
            console.log(`   ${error.message}`);
            failed++;
        }
        console.log(''); // Empty line for readability
    }
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('🎉 All optimizations working correctly!');
    } else {
        console.log('⚠️  Some optimizations need attention.');
    }
    
    return { passed, failed };
}

// Auto-run if agent is available
if (typeof openAIAgent !== 'undefined') {
    testOptimizations();
} else {
    console.log('⏳ Waiting for OpenAI Agent to load...');
    // Try again after a delay
    setTimeout(() => {
        if (typeof openAIAgent !== 'undefined') {
            testOptimizations();
        } else {
            console.log('⚠️  OpenAI Agent not found. Run testOptimizations() manually when ready.');
        }
    }, 2000);
}

// Export for manual use
window.testOptimizations = testOptimizations;
