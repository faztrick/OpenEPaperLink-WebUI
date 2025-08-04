// Live ESP32 OpenAI Agent Test
// ============================

async function testLiveESP32Agent() {
    console.log('🧪 Testing Live ESP32 OpenAI Agent...\n');
    
    const ESP32_IP = '192.168.26.200';
    const API_KEY = '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';
    
    try {
        // Test 1: Check ESP32 connectivity
        console.log('📡 Test 1: ESP32 Connectivity');
        console.log(`🔗 Connecting to: http://${ESP32_IP}`);
        
        const connectResponse = await fetch(`http://${ESP32_IP}`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000)
        });
        
        if (connectResponse.ok) {
            console.log('✅ ESP32 is responding');
        } else {
            throw new Error(`ESP32 returned ${connectResponse.status}`);
        }
        
        // Test 2: Check OpenAI Agent script availability
        console.log('\n🤖 Test 2: OpenAI Agent Script');
        const agentResponse = await fetch(`http://${ESP32_IP}/openai-agent-config.js`, {
            signal: AbortSignal.timeout(5000)
        });
        
        if (agentResponse.ok) {
            console.log('✅ OpenAI Agent script is accessible');
            const scriptSize = agentResponse.headers.get('content-length');
            console.log(`📊 Script size: ${scriptSize ? scriptSize + ' bytes' : 'Unknown'}`);
        } else {
            throw new Error(`Agent script not found: ${agentResponse.status}`);
        }
        
        // Test 3: Simulate API call that the ESP32 agent would make
        console.log('\n🔑 Test 3: Simulating ESP32 Agent API Call');
        console.log('📡 Testing GPT-4.1 API call...');
        
        const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                        content: 'You are an AI assistant integrated into an ESP32 device. Respond briefly.'
                    },
                    {
                        role: 'user',
                        content: 'Hello! Are you working on the ESP32?'
                    }
                ],
                max_tokens: 100,
                temperature: 0.7
            })
        });
        
        if (!apiResponse.ok) {
            throw new Error(`API call failed: ${apiResponse.status} ${apiResponse.statusText}`);
        }
        
        const apiData = await apiResponse.json();
        const reply = apiData.choices[0].message.content;
        
        console.log('✅ API call successful');
        console.log(`🎯 Model: ${apiData.model}`);
        console.log(`📝 Response: ${reply}`);
        console.log(`💰 Tokens: ${apiData.usage.total_tokens}`);
        
        // Test 4: Check configuration endpoint
        console.log('\n⚙️ Test 4: Configuration Access');
        try {
            const configResponse = await fetch(`http://${ESP32_IP}/openai_config.json`, {
                signal: AbortSignal.timeout(3000)
            });
            
            if (configResponse.ok) {
                console.log('✅ Configuration file accessible');
            } else {
                console.log('⚠️ Configuration file not accessible via HTTP (may be served differently)');
            }
        } catch (configError) {
            console.log('⚠️ Configuration endpoint test failed (expected for some setups)');
        }
        
        // Test 5: Web interface check
        console.log('\n🌐 Test 5: Web Interface');
        const pageResponse = await fetch(`http://${ESP32_IP}`, {
            signal: AbortSignal.timeout(5000)
        });
        
        if (pageResponse.ok) {
            const pageContent = await pageResponse.text();
            const hasOpenAI = pageContent.includes('openai') || pageContent.includes('OpenAI');
            console.log(`✅ Web interface loaded (${pageContent.length} bytes)`);
            console.log(`🤖 OpenAI references found: ${hasOpenAI ? 'Yes' : 'No'}`);
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('🎉 Live ESP32 OpenAI Agent Test Complete!');
        console.log('📋 Summary:');
        console.log('   ✅ ESP32 connectivity: Working');
        console.log('   ✅ OpenAI Agent script: Available');
        console.log('   ✅ GPT-4.1 API: Functional');
        console.log('   ✅ Web interface: Accessible');
        console.log('\n💡 You can now test the live agent at:');
        console.log(`   🔗 http://${ESP32_IP}`);
        
    } catch (error) {
        console.log('\n❌ Test failed:', error.message);
        
        if (error.message.includes('fetch')) {
            console.log('💡 Troubleshooting:');
            console.log('   - Check if ESP32 is powered on');
            console.log('   - Verify network connection');
            console.log(`   - Try accessing http://${ESP32_IP} in browser`);
        }
    }
}

testLiveESP32Agent();
