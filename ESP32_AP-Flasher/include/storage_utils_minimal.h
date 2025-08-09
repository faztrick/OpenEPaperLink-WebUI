#ifndef STORAGE_UTILS_MINIMAL_H
#define STORAGE_UTILS_MINIMAL_H

#include <Arduino.h>
#include <ArduinoJson.h>

// Forward declarations for minimal compilation
class WiFiStorageManager {
   public:
    static WiFiStorageManager& getInstance() {
        static WiFiStorageManager instance;
        return instance;
    }

    DynamicJsonDocument toJson() const {
        DynamicJsonDocument doc(512);
        doc["ssid"] = "faztrick";
        doc["ip"] = "192.168.1.200";
        doc["mask"] = "255.255.255.0";
        doc["gateway"] = "192.168.1.1";
        doc["dns"] = "8.8.8.8";
        doc["hostname"] = "OpenEPaperLink-AP";
        doc["hasPassword"] = true;
        return doc;
    }

   private:
    WiFiStorageManager() = default;
};

#define WIFI_STORAGE WiFiStorageManager::getInstance()

#endif  // STORAGE_UTILS_MINIMAL_H
