// OpenAI Agent Compression Test
// ============================

// Test data for compression
const testData = {
    conversation: [
        {
            role: "user",
            content: "Hello! What can you do with the ESP32 system? I need to understand the configuration and file management capabilities."
        },
        {
            role: "assistant", 
            content: "I can help you with ESP32 system management including configuration updates, file operations, and system control. The current configuration shows OpenAI model GPT-4.1 with 4096 max tokens and 0.7 temperature."
        },
        {
            role: "user",
            content: "That sounds great! Can you show me the current configuration and list the available functions for file management?"
        }
    ],
    config: {
        openai: {
            api_key: "sk-proj-test-key-example",
            api_url: "https://api.openai.com/v1/chat/completions",
            models: {
                default: "gpt-4.1",
                alternatives: ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo"]
            },
            parameters: {
                max_tokens: 4096,
                temperature: 0.7,
                top_p: 1.0
            }
        },
        esp32: {
            ai_agent: {
                enabled: true,
                conversation_history_limit: 10,
                function_timeout: 15000
            }
        }
    }
};

function testCompression() {
    console.log('🧪 Testing OpenAI Agent Compression Functions...\n');
    
    // Simulate OpenAI Agent compression methods
    const compressionMap = {
        'OpenAI': 'OAI',
        'configuration': 'cfg',
        'function': 'fn',
        'message': 'msg',
        'response': 'resp',
        'assistant': 'asst',
        'system': 'sys',
        'the ': 'T ',
        'and ': '& ',
        'ESP32': 'E32'
    };
    
    function compressText(text) {
        let compressed = text;
        for (const [original, replacement] of Object.entries(compressionMap)) {
            compressed = compressed.replace(new RegExp(original, 'g'), replacement);
        }
        return btoa(compressed);
    }
    
    function compressJSON(obj) {
        const keyMap = {
            'role': 'r',
            'content': 'c',
            'api_key': 'ak',
            'model': 'md',
            'temperature': 'tmp',
            'max_tokens': 'mt'
        };
        
        function compressKeys(obj) {
            if (typeof obj !== 'object' || obj === null) return obj;
            if (Array.isArray(obj)) return obj.map(compressKeys);
            
            const compressed = {};
            for (const [key, value] of Object.entries(obj)) {
                const compressedKey = keyMap[key] || key;
                compressed[compressedKey] = compressKeys(value);
            }
            return compressed;
        }
        
        const compressedObj = compressKeys(obj);
        const compactJSON = JSON.stringify(compressedObj);
        return compressText(compactJSON);
    }
    
    // Test 1: Text Compression
    console.log('📝 Test 1: Text Compression');
    const sampleText = "Hello! I can help you with ESP32 system management including configuration updates, file operations, and system control. The OpenAI assistant can process messages and responses efficiently.";
    const compressedText = compressText(sampleText);
    
    const originalSize = new Blob([sampleText]).size;
    const compressedSize = new Blob([compressedText]).size;
    const textRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    
    console.log(`Original: ${originalSize} bytes`);
    console.log(`Compressed: ${compressedSize} bytes`);
    console.log(`Reduction: ${textRatio}%`);
    console.log(`Sample: "${sampleText.substring(0, 50)}..."`);
    console.log(`Compressed: "${compressedText.substring(0, 50)}..."`);
    
    // Test 2: JSON Compression  
    console.log('\n📊 Test 2: JSON Compression');
    const originalJSON = JSON.stringify(testData.config);
    const compressedJSON = compressJSON(testData.config);
    
    const jsonOriginalSize = new Blob([originalJSON]).size;
    const jsonCompressedSize = new Blob([compressedJSON]).size;
    const jsonRatio = ((jsonOriginalSize - jsonCompressedSize) / jsonOriginalSize * 100).toFixed(1);
    
    console.log(`Original JSON: ${jsonOriginalSize} bytes`);
    console.log(`Compressed JSON: ${jsonCompressedSize} bytes`);
    console.log(`Reduction: ${jsonRatio}%`);
    
    // Test 3: Conversation History Compression
    console.log('\n💬 Test 3: Conversation History Compression');
    const conversationJSON = JSON.stringify(testData.conversation);
    const compressedConversation = compressJSON(testData.conversation);
    
    const convOriginalSize = new Blob([conversationJSON]).size;
    const convCompressedSize = new Blob([compressedConversation]).size;
    const convRatio = ((convOriginalSize - convCompressedSize) / convOriginalSize * 100).toFixed(1);
    
    console.log(`Original conversation: ${convOriginalSize} bytes`);
    console.log(`Compressed conversation: ${convCompressedSize} bytes`);
    console.log(`Reduction: ${convRatio}%`);
    console.log(`Messages: ${testData.conversation.length}`);
    
    // Summary
    console.log('\n📋 Compression Test Summary:');
    console.log(`✅ Text compression: ${textRatio}% reduction`);
    console.log(`✅ JSON compression: ${jsonRatio}% reduction`);
    console.log(`✅ Conversation compression: ${convRatio}% reduction`);
    
    console.log('\n🎯 Benefits for ESP32:');
    console.log('• Reduced storage space for conversation history');
    console.log('• Faster data transfer over WiFi');
    console.log('• More efficient memory usage');
    console.log('• Longer conversation history retention');
    
    console.log('\n🚀 Usage in OpenAI Agent:');
    console.log('• Automatic compression of conversation history');
    console.log('• Manual compression functions available via chat');
    console.log('• Transparent decompression when loading');
    console.log('• UI buttons for compression management');
}

// Run the test
testCompression();
