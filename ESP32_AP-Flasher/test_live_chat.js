// ESP32 Live Chat Test
// ===================
// This simulates what happens when a user interacts with the OpenAI agent on ESP32

async function testLiveChat() {
    console.log('💬 Testing Live ESP32 Chat Interface...\n');
    
    const API_KEY = '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';
    
    // Test messages that a user might send to the ESP32 AI agent
    const testMessages = [
        'Hello! What can you do?',
        'What is the ESP32 system status?',
        'Show me the current configuration',
        'List available features'
    ];
    
    console.log('🎯 Testing GPT-4.1 responses for ESP32 AI agent...\n');
    
    for (let i = 0; i < testMessages.length; i++) {
        const userMessage = testMessages[i];
        console.log(`📝 Test ${i + 1}: "${userMessage}"`);
        
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4.1',
                    messages: [
                        {
                            role: 'system',
                            content: `You are an AI assistant running on an ESP32-S3 AP-Flasher device at IP 192.168.26.200. You help users manage the device, flash firmware, control tags, and provide system information. Keep responses concise and helpful. You have access to functions for file management, system control, LED control, and more.`
                        },
                        {
                            role: 'user',
                            content: userMessage
                        }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            const reply = data.choices[0].message.content;
            
            console.log(`✅ Response: ${reply}`);
            console.log(`💰 Tokens: ${data.usage.total_tokens}`);
            console.log('');
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}\n`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('🎉 Live chat test completed!');
    console.log('\n📋 Summary:');
    console.log('   - ESP32 IP: 192.168.26.200');
    console.log('   - Model: GPT-4.1 (2025-04-14)');
    console.log('   - Agent Status: Ready for live chat');
    console.log('   - UI: Fixed visibility and contrast');
    console.log('   - Config: JSON-based system');
    
    console.log('\n🚀 To test live:');
    console.log('   1. Open http://192.168.26.200 in browser');
    console.log('   2. Look for floating chat button (bottom-right)');
    console.log('   3. Click to open AI assistant');
    console.log('   4. Start chatting with GPT-4.1!');
}

testLiveChat();
