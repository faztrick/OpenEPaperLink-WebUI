// Test GPT-4.1 API with current configuration
// ==========================================

const fs = require('fs');

async function testGPT41() {
    console.log('🧪 Testing GPT-4.1 API Connection...\n');
    
    try {
        // Load configuration
        const config = JSON.parse(fs.readFileSync('openai_config.json', 'utf8'));
        
        const apiKey = config.openai.api_key;
        const model = config.openai.models.default;
        const apiUrl = config.openai.api_url;
        
        console.log(`🤖 Model: ${model}`);
        console.log(`🔗 API URL: ${apiUrl}`);
        console.log(`🔑 API Key: ${apiKey.substring(0, 20)}...`);
        console.log('');
        
        // Test API call with GPT-4.1
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: 'Hello! Please confirm you are GPT-4.1 and working correctly.'
                    }
                ],
                max_tokens: 100,
                temperature: 0.7
            })
        });
        
        console.log(`📡 Response Status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        const reply = data.choices[0].message.content;
        
        console.log('✅ API Response received successfully!');
        console.log(`🎯 Model Used: ${data.model || model}`);
        console.log(`📝 Response: ${reply}`);
        console.log(`💰 Tokens Used: ${data.usage?.total_tokens || 'N/A'}`);
        
        console.log('\n' + '='.repeat(50));
        console.log('🎉 GPT-4.1 is working correctly!');
        
    } catch (error) {
        console.log('❌ Error:', error.message);
        
        // Suggest fallback if GPT-4.1 doesn't work
        if (error.message.includes('404') || error.message.includes('not found')) {
            console.log('\n💡 Suggestion: GPT-4.1 might not be available yet.');
            console.log('   Consider using "gpt-4o" or "gpt-4" instead.');
        }
    }
}

testGPT41();
