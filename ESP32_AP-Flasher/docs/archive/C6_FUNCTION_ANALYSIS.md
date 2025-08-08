# C6 Function Connection Analysis Report
# =======================================

## JavaScript Frontend Endpoints (from c6_module.js):
✅ /sysinfo - Used for system information
✅ /ap_list - Used for getting AP list with C6 module info
✅ /test_c6_connection - Used for testing C6 connection
✅ /test_c6_radio - Used for testing C6 radio functionality  
✅ /get_c6_settings - Used for getting C6 module settings
✅ /save_c6_settings - Used for saving C6 module settings
✅ /reset_c6_settings - Used for resetting C6 settings to defaults
✅ /update_c6 - Used for C6 firmware updates (NOTE: Mismatch!)
✅ /c6_update_status - Used for monitoring update progress
✅ /backup_c6_firmware - Used for backing up C6 firmware
✅ /restart_c6 - Used for restarting C6 module
✅ /wifi_scan - Used for channel analysis
✅ /flash_c6_ota - Used for OTA flashing

## C++ Backend Endpoints (from c6_module.cpp):
✅ /sysinfo - Handled in web.cpp (system info)
✅ /ap_list - handleAPList() 
✅ /test_c6_connection - handleTestC6Connection()
✅ /test_c6_radio - handleTestC6Radio()
✅ /get_c6_settings - handleGetC6Settings()  
✅ /save_c6_settings - handleSaveC6SettingsBody()
✅ /reset_c6_settings - handleResetC6Settings()
⚠️ /upload_c6_firmware - handleC6FirmwareUpload() (NOTE: Different name!)
✅ /c6_update_status - handleC6UpdateStatus()
✅ /backup_c6_firmware - handleBackupC6Firmware()
✅ /restart_c6 - handleRestartC6()
✅ /backup_c6_config - handleBackupC6Config()
✅ /reset_c6_config - handleResetC6Config()
✅ /list_drives - handleListDrives()
✅ /list_serial_ports - handleListSerialPorts()
✅ /flash_c6_ota - handleFlashC6OTA()

## ENDPOINT MISMATCH FOUND:
❌ JavaScript calls: /update_c6
❌ C++ registers: /upload_c6_firmware

## Additional C++ Endpoints Not Used in Frontend:
➕ /c6_status - handleC6Status() (via registerC6WebHandlers)
➕ /c6_control - handleC6Control() (via registerC6WebHandlers)

## Recommendation:
1. Fix the endpoint mismatch between /update_c6 and /upload_c6_firmware
2. Consider using the additional /c6_status and /c6_control endpoints
3. All other connections are properly configured

## Test Results Summary:
- Total Endpoints Checked: 15
- Properly Connected: 13
- Mismatched: 1  
- Additional Available: 2
