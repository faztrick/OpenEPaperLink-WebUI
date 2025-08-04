#ifdef USE_WIFI_MANAGER
#include <WiFiManager.h>

WiFiManager wifiManager;

void setupAdvancedWiFi() {
    // Set custom parameters
    WiFiManagerParameter custom_device_name("device_name", "Device Name", "OpenEPaperLink-AP", 40);
    WiFiManagerParameter custom_api_key("api_key", "API Key", "", 64);
    
    wifiManager.addParameter(&custom_device_name);
    wifiManager.addParameter(&custom_api_key);
    
    // Set callbacks
    wifiManager.setAPCallback([](WiFiManager *myWiFiManager) {
        Serial.println("🔧 Entered config mode");
        Serial.println("📱 Connect to: " + myWiFiManager->getConfigPortalSSID());
    });
    
    wifiManager.setSaveConfigCallback([]() {
        Serial.println("💾 WiFi config saved");
    });
    
    // Auto connect with fallback to config portal
    if (!wifiManager.autoConnect("OpenEPaperLink-Setup")) {
        Serial.println("❌ Failed to connect and hit timeout");
        ESP.restart();
    }
    
    Serial.println("✅ WiFi connected successfully");
}
#endif
