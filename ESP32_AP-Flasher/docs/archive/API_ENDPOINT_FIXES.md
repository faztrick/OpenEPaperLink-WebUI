# ESP32 AP-Flasher JavaScript API Endpoint Fixes

## Analysis Results

After analyzing all JavaScript files against the web.cpp endpoints, I found several mismatches that need to be fixed:

## Issues Found:

### 1. **Missing Endpoints in web.cpp**
- `/gettags` - Used in tag-manager.js line 47
- `/gettaginfo` - Used in tag-manager.js line 303  
- `/cmd` - Used in tag-manager.js line 335
- `/content_cards.json` - Used in tag-manager.js line 524
- `/cfg.json` - Used in app-core.js line 345
- `/logs` - Used in app-core.js line 350
- `/settings` - Used in app-core.js line 462
- `/version.txt` - Used in ota.js line 63
- `/wifi_scan` - Used in c6_module.js (correct endpoint exists)

### 2. **Incorrect Endpoint Usage**
- `sysinfo.json` references should use `/sysinfo` (already mostly fixed)
- Some functions use wrong HTTP methods

### 3. **Endpoint Parameter Mismatches**
- Several endpoints expect different parameter formats

## Available Endpoints in web.cpp:

### System & Information
- GET `/sysinfo` ✅
- GET `/heap` ✅  
- GET `/pins` ✅
- GET `/get_state` ✅
- GET `/get_function_status` ✅
- POST `/reboot` ✅

### Configuration
- GET `/get_wifi_config` ✅
- GET `/get_ssid_list` ✅
- GET `/get_ap_config` ✅
- POST `/save_cfg` ✅
- POST `/save_apcfg` ✅
- POST `/set_var` ✅
- POST `/set_vars` ✅

### Tag Management  
- GET `/get_db` ✅
- GET `/getdata` ✅
- GET `/backup_db` ✅
- POST `/restore_db` ✅
- POST `/tag_cmd` ✅
- GET `/led_flash` ✅

### File & Upload Management
- POST `/imgupload` ✅
- POST `/jsonupload` ✅
- POST `/littlefs_put` ✅

### OTA & Updates
- GET `/check_file` ✅
- POST `/update_ota` ✅
- POST `/update_c6` ✅
- POST `/update_actions` ✅
- POST `/rollback` ✅

### C6 Module Management (when C6_OTA_FLASHING enabled)
- GET `/get_c6_settings` ✅
- POST `/save_c6_settings` ✅
- POST `/reset_c6_settings` ✅
- GET `/test_c6_connection` ✅
- GET `/test_c6_radio` ✅
- POST `/restart_c6` ✅
- GET `/backup_c6_config` ✅
- POST `/reset_c6_config` ✅
- GET `/ap_list` ✅
- GET `/c6_update_status` ✅
- GET `/backup_c6_firmware` ✅
- POST `/upload_c6_firmware` ✅
- GET `/list_drives` ✅
- GET `/list_serial_ports` ✅
- POST `/flash_c6_ota` ✅

### OpenAI Agent API
- POST `/api/openai/chat` ✅
- GET `/api/features` ✅
- POST `/api/error_report` ✅
- Various file management endpoints ✅

## Fixes Needed:

1. **Replace missing endpoints with correct ones**
2. **Update parameter formats** 
3. **Fix HTTP method mismatches**
4. **Add error handling for missing endpoints**
