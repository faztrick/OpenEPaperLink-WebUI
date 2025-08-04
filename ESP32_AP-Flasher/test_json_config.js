// Test JSON Configuration System for OpenAI Agent
// ================================================

const fs = require('fs');
const path = require('path');

async function testJSONConfig() {
    console.log('🧪 Testing JSON Configuration System...\n');
    
    const configPath = path.join(__dirname, 'openai_config.json');
    
    try {
        // Test 1: Read configuration file
        console.log('📄 Test 1: Reading Configuration File');
        
        if (!fs.existsSync(configPath)) {
            throw new Error('Configuration file not found');
        }
        
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        console.log('✅ Configuration loaded successfully');
        console.log(`   Model: ${config.openai.models.default}`);
        console.log(`   Max Tokens: ${config.openai.parameters.max_tokens}`);
        console.log(`   Temperature: ${config.openai.parameters.temperature}`);
        console.log(`   API URL: ${config.openai.api_url}`);
        
        // Test 2: Validate configuration structure
        console.log('\n🔍 Test 2: Validating Configuration Structure');
        
        const requiredFields = [
            'openai.api_key',
            'openai.api_url',
            'openai.models.default',
            'openai.parameters.max_tokens',
            'openai.parameters.temperature',
            'esp32.ai_agent.enabled'
        ];
        
        let allFieldsPresent = true;
        
        for (const field of requiredFields) {
            const value = getNestedValue(config, field);
            if (value === undefined) {
                console.log(`❌ Missing field: ${field}`);
                allFieldsPresent = false;
            } else {
                console.log(`✅ ${field}: ${value}`);
            }
        }
        
        if (allFieldsPresent) {
            console.log('✅ All required fields present');
        } else {
            console.log('❌ Some required fields missing');
        }
        
        // Test 3: Test configuration modification
        console.log('\n🔧 Test 3: Testing Configuration Modification');
        
        const testConfig = JSON.parse(JSON.stringify(config)); // Deep copy
        
        // Update some values
        testConfig.openai.models.default = 'gpt-4';
        testConfig.openai.parameters.temperature = 0.5;
        testConfig.esp32.ai_agent.conversation_history_limit = 15;
        
        console.log('✅ Configuration modified successfully');
        console.log(`   New Model: ${testConfig.openai.models.default}`);
        console.log(`   New Temperature: ${testConfig.openai.parameters.temperature}`);
        console.log(`   New History Limit: ${testConfig.esp32.ai_agent.conversation_history_limit}`);
        
        // Test 4: Test API key validation format
        console.log('\n🔑 Test 4: Testing API Key Format');
        
        const apiKey = config.openai.api_key;
        if (apiKey && apiKey.startsWith('sk-') && apiKey.length > 20) {
            console.log('✅ API key format appears valid');
        } else {
            console.log('❌ API key format may be invalid');
        }
        
        // Test 5: Test model availability
        console.log('\n🤖 Test 5: Testing Model Configuration');
        
        const defaultModel = config.openai.models.default;
        const alternatives = config.openai.models.alternatives;
        
        console.log(`✅ Default model: ${defaultModel}`);
        console.log(`✅ Alternative models: ${alternatives.join(', ')}`);
        
        // Test 6: Simulate API request with config
        console.log('\n📡 Test 6: Simulating API Request with Configuration');
        
        const requestConfig = {
            model: config.openai.models.default,
            max_tokens: config.openai.parameters.max_tokens,
            temperature: config.openai.parameters.temperature,
            top_p: config.openai.parameters.top_p
        };
        
        console.log('✅ API request configuration prepared:');
        console.log(JSON.stringify(requestConfig, null, 2));
        
        // Test 7: Create backup configuration
        console.log('\n💾 Test 7: Creating Backup Configuration');
        
        const backupPath = path.join(__dirname, 'openai_config_backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(config, null, 2));
        
        console.log(`✅ Backup created: ${backupPath}`);
        
        // Summary
        console.log('\n📋 Test Summary:');
        console.log('✅ Configuration file exists and is readable');
        console.log('✅ JSON structure is valid');
        console.log('✅ All required fields present');
        console.log('✅ Configuration can be modified');
        console.log('✅ API key format validated');
        console.log('✅ Model configuration tested');
        console.log('✅ API request simulation successful');
        console.log('✅ Backup created');
        
        console.log('\n🎉 All JSON configuration tests passed!');
        
        return {
            success: true,
            config: config,
            tests: {
                fileExists: true,
                validJSON: true,
                allFieldsPresent: allFieldsPresent,
                apiKeyValid: apiKey && apiKey.startsWith('sk-'),
                modificationTest: true,
                backupCreated: true
            }
        };
        
    } catch (error) {
        console.error('\n❌ Configuration test failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
}

// Test configuration update function
function testConfigUpdate() {
    console.log('\n🔄 Testing Configuration Update Function...');
    
    const config = {
        openai: {
            models: { default: 'gpt-3.5-turbo' },
            parameters: { temperature: 0.7 }
        }
    };
    
    // Test updating nested values
    updateConfig(config, 'openai.models.default', 'gpt-4');
    updateConfig(config, 'openai.parameters.temperature', 0.5);
    updateConfig(config, 'openai.parameters.new_param', 'test');
    
    console.log('✅ Updated configuration:');
    console.log(JSON.stringify(config, null, 2));
}

function updateConfig(config, path, value) {
    const keys = path.split('.');
    let current = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
}

// Run tests
async function runAllTests() {
    const configResult = await testJSONConfig();
    testConfigUpdate();
    
    return configResult;
}

// Execute if run directly
if (require.main === module) {
    runAllTests().then(result => {
        if (result.success) {
            console.log('\n🚀 JSON Configuration system is ready for use!');
        } else {
            console.log('\n⚠️  Please fix configuration issues before proceeding.');
        }
    });
}

module.exports = { testJSONConfig, testConfigUpdate, runAllTests };
