// Test script to check ChatGPT API functionality
// ================================================

const API_KEY = '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';
const API_URL = 'https://api.openai.com/v1/chat/completions';

async function testChatGPTAPI() {
    console.log('🧪 Testing ChatGPT API...');
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello! Please respond with "API is working!" if you can receive this message.'
                    }
                ],
                max_tokens: 50,
                temperature: 0.7
            })
        });

        console.log(`📡 Response Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ API Response received successfully!');
        console.log('📝 Response:', data.choices[0].message.content);
        
        return {
            success: true,
            response: data.choices[0].message.content,
            usage: data.usage
        };

    } catch (error) {
        console.error('❌ API Test Failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

async function testAPIKey() {
    console.log('🔑 Testing API Key validity...');
    
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        if (response.ok) {
            const models = await response.json();
            console.log('✅ API Key is valid!');
            console.log(`📊 Available models: ${models.data.length}`);
            return { success: true, modelCount: models.data.length };
        } else {
            const errorText = await response.text();
            console.log('❌ API Key validation failed:', errorText);
            return { success: false, error: errorText };
        }

    } catch (error) {
        console.error('❌ API Key test failed:', error.message);
        return { success: false, error: error.message };
    }
}

async function runAllTests() {
    console.log('🚀 Starting ChatGPT API Tests...\n');
    
    // Test 1: API Key validity
    const keyTest = await testAPIKey();
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Chat completion
    const chatTest = await testChatGPTAPI();
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Summary
    console.log('📋 Test Summary:');
    console.log(`   API Key: ${keyTest.success ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`   Chat API: ${chatTest.success ? '✅ Working' : '❌ Failed'}`);
    
    if (keyTest.success && chatTest.success) {
        console.log('🎉 All tests passed! ChatGPT API is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Please check the errors above.');
    }
    
    return {
        apiKeyValid: keyTest.success,
        chatAPIWorking: chatTest.success,
        details: { keyTest, chatTest }
    };
}

// Run tests if this script is executed directly
if (typeof window === 'undefined') {
    // Node.js environment (Node 18+ has built-in fetch)
    runAllTests();
} else {
    // Browser environment
    window.testChatGPTAPI = runAllTests;
    console.log('Use window.testChatGPTAPI() to run tests in browser console');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { testChatGPTAPI, testAPIKey, runAllTests };
}
