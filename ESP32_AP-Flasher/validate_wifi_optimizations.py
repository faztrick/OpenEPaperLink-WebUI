# WiFi Scan Optimization Validation Script
# This script validates that all the WiFi scan optimizations are properly integrated

import os
import re
import json

def check_file_exists(file_path, description):
    """Check if a file exists and print status"""
    if os.path.exists(file_path):
        print(f"✅ {description}: {file_path}")
        return True
    else:
        print(f"❌ {description}: {file_path} - NOT FOUND")
        return False

def check_code_pattern(file_path, pattern, description):
    """Check if a code pattern exists in a file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            if re.search(pattern, content, re.MULTILINE | re.DOTALL):
                print(f"✅ {description}")
                return True
            else:
                print(f"❌ {description} - PATTERN NOT FOUND")
                return False
    except Exception as e:
        print(f"❌ {description} - ERROR: {e}")
        return False

def main():
    print("=== WiFi Scan Optimization Validation ===\n")
    
    base_path = "d:/projects/esp/OpenEPaperLink/ESP32_AP-Flasher"
    
    # Check critical files exist
    print("1. Checking File Existence:")
    files_ok = True
    files_ok &= check_file_exists(f"{base_path}/src/web.cpp", "Enhanced web.cpp")
    files_ok &= check_file_exists(f"{base_path}/src/wifimanager.cpp", "Enhanced wifimanager.cpp")
    files_ok &= check_file_exists(f"{base_path}/wwwroot/main.js", "Enhanced main.js")
    files_ok &= check_file_exists(f"{base_path}/wwwroot/setup.js", "Enhanced setup.js")
    files_ok &= check_file_exists(f"{base_path}/data/www/wifi-scan-styles.css", "WiFi Scan CSS")
    files_ok &= check_file_exists(f"{base_path}/data/www/wifi_test.html", "WiFi Test Page")
    files_ok &= check_file_exists(f"{base_path}/platformio.ini", "Enhanced platformio.ini")
    files_ok &= check_file_exists(f"{base_path}/WIFI_SCAN_OPTIMIZATION_SUMMARY.md", "Documentation")
    
    # Check web.cpp enhancements
    print("\n2. Checking web.cpp Enhancements:")
    web_ok = True
    web_ok &= check_code_pattern(f"{base_path}/src/web.cpp", 
                                r'server\.on\("/wifi_scan"', 
                                "Enhanced /wifi_scan endpoint")
    web_ok &= check_code_pattern(f"{base_path}/src/web.cpp", 
                                r'JsonDocument.*?4096', 
                                "4KB JSON buffer allocation")
    web_ok &= check_code_pattern(f"{base_path}/src/web.cpp", 
                                r'std::sort.*?networks.*?rssi', 
                                "Network sorting by RSSI")
    web_ok &= check_code_pattern(f"{base_path}/src/web.cpp", 
                                r'WiFi\.scanComplete', 
                                "Async scan completion check")
    
    # Check wifimanager.cpp optimizations
    print("\n3. Checking wifimanager.cpp Optimizations:")
    wifi_ok = True
    wifi_ok &= check_code_pattern(f"{base_path}/src/wifimanager.cpp", 
                                 r'WIFI_PS_NONE', 
                                 "Power save disabled")
    wifi_ok &= check_code_pattern(f"{base_path}/src/wifimanager.cpp", 
                                 r'WIFI_POWER_19_5dBm', 
                                 "Optimal TX power setting")
    wifi_ok &= check_code_pattern(f"{base_path}/src/wifimanager.cpp", 
                                 r'WiFi\.setTxPower', 
                                 "TX power configuration")
    
    # Check frontend enhancements
    print("\n4. Checking Frontend Enhancements:")
    frontend_ok = True
    frontend_ok &= check_code_pattern(f"{base_path}/wwwroot/main.js", 
                                     r'wifi_scan', 
                                     "WiFi scan integration in main.js")
    frontend_ok &= check_code_pattern(f"{base_path}/wwwroot/setup.js", 
                                     r'wifi_scan.*?fallback.*?get_ssid_list', 
                                     "Fallback mechanism in setup.js")
    
    # Check platformio.ini optimizations
    print("\n5. Checking Build Configuration:")
    build_ok = True
    build_ok &= check_code_pattern(f"{base_path}/platformio.ini", 
                                  r'CONFIG_ESP32_WIFI_DYNAMIC_RX_BUFFER_NUM=32', 
                                  "Dynamic RX buffer optimization")
    build_ok &= check_code_pattern(f"{base_path}/platformio.ini", 
                                  r'CONFIG_ESP32_WIFI_DYNAMIC_TX_BUFFER_NUM=32', 
                                  "Dynamic TX buffer optimization")
    build_ok &= check_code_pattern(f"{base_path}/platformio.ini", 
                                  r'CONFIG_ESP32_WIFI_AMPDU_TX_ENABLED=1', 
                                  "AMPDU TX enabled")
    
    # Overall validation
    print("\n=== VALIDATION SUMMARY ===")
    all_ok = files_ok and web_ok and wifi_ok and frontend_ok and build_ok
    
    if all_ok:
        print("🎉 ALL OPTIMIZATIONS VALIDATED SUCCESSFULLY!")
        print("\nNext Steps:")
        print("1. Build and flash the firmware to your ESP32-S3")
        print("2. Access the WiFi test page at: http://[device-ip]/wifi_test.html")
        print("3. Test the enhanced WiFi scan functionality")
        print("4. Compare performance with legacy scan")
    else:
        print("⚠️  SOME OPTIMIZATIONS ARE MISSING OR INCOMPLETE")
        print("Please review the failed checks above.")
    
    return all_ok

if __name__ == "__main__":
    main()
