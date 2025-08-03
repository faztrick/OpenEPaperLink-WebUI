# OpenEPaperLink ESP32 - File Inventory and Usage Analysis
# Generated on August 4, 2025
# Updated after cleanup - 35 files remaining

## 🎉 CLEANUP COMPLETED!

**Files Removed (Total: 3 files, ~37 KB saved):**
- ✅ `mainjs.js` (16,850 bytes) - Unused module loader system
- ✅ `ap_list.html` (6,963 bytes) - Broken page with missing dependencies (style.css, script.js)
- ✅ `navigation.html` (13,464 bytes) - Redundant navigation page

**Cleanup Actions Performed:**
- 🗑️ Removed broken AP list page that referenced missing `style.css` and `script.js`
- 🗑️ Removed redundant navigation page (functionality covered by main menu)
- 🔧 Updated `menu.html` to remove broken links
- 🔧 Updated `index.html` to remove reference to removed navigation page

**Space Saved:** ~37.3 KB

--- CORE APPLICATION FILES (ACTIVELY USED)

### HTML Pages - Main Application
- index.html ✅ Main dashboard/home page
- dashboard.html ✅ System analytics and monitoring  
- tags.html ✅ Tag management interface
- settings.html ✅ System configuration
- logs.html ✅ System log viewer
- updates.html ✅ Firmware update interface
- flasher.html ✅ Device flashing interface
- nrf52_swd.html ✅ nRF52 SWD programming
- c6_module.html ✅ ESP32-C6 module configuration
- tag_control_panel.html ✅ Tag control interface
- setup.html ✅ Initial setup wizard
- edit.html ✅ File editor interface

### CSS Files - Styling
- main.css ✅ Primary application styles
- advanced-styles.css ✅ Enhanced UI styling

### JavaScript Files - Core Functionality  
- constants.js ✅ Application constants and configuration
- utils.js ✅ Utility functions
- app-core.js ✅ Core application logic
- ui-components.js ✅ UI component library
- tag-manager.js ✅ Tag management functionality
- canvas-renderer.js ✅ Canvas rendering for displays
- main.js ✅ Main application controller
- mainjs.js ✅ Module loader and initialization
- universal-menu.js ✅ Navigation menu system
- setup.js ✅ Setup wizard functionality
- g5decoder.js ✅ G5 protocol decoder
- ota.js ✅ Over-the-air update functionality
- c6_module.js ✅ ESP32-C6 specific functionality

### Other Core Files
- menu.html ✅ Navigation menu component
- favicon.ico ✅ Website icon

## DEMO AND TEST FILES (SAFE TO REMOVE)

### Test Files
- test-js.html ❌ JavaScript testing page
- test-links.html ❌ Link testing page  
- test-minimal.html ❌ Minimal functionality test

### Demo Files
- jsontemplate-demo.html ❌ JSON template demo (v1 - superseded)
- jsontemplate-demo-v2.html ✅ JSON template demo (v2 - keep)
- upload-demo.html ❌ File upload demonstration
- variables-demo.html ❌ Variables demonstration

## DEVELOPMENT/BUILD FILES (SAFE TO REMOVE)

### PowerShell Scripts
- add-scripts.ps1 ❌ Development build script
- update-menus.ps1 ❌ Menu update script
- cleanup-unused-files.ps1 ✅ This cleanup script (newly created)

### Data Files
- content_cards.json ❌ Unused configuration data

## POTENTIALLY UNUSED FILES (REQUIRES VERIFICATION)

### JavaScript Files
- api-examples.js ⚠️ API usage examples (may be legacy)
- compact-ui.js ⚠️ Compact UI functionality (possibly legacy)
- dashboard.js ⚠️ Dashboard-specific code (not clearly referenced)
- flash.js ⚠️ Flash-specific code (not clearly referenced)
- painter.js ❌ Drawing/painting functionality (no references found)
- performance.js ⚠️ Performance monitoring (referenced but may not be essential)

### CSS Files  
- compact-ui.css ⚠️ Compact UI styles (possibly legacy)

### HTML Files
- ap_list.html ⚠️ Access point list (referenced in menu but usage unclear)
- navigation.html ⚠️ Alternative navigation system (may be redundant)
- esp32_endpoint_checker.html ✅ Utility tool (keep as standalone utility)

## FILE SIZE ANALYSIS

Run this command to see file sizes:
```powershell
Get-ChildItem *.html,*.js,*.css | Sort-Object Length -Descending | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize
```

## CLEANUP RECOMMENDATIONS

### Phase 1 - Safe Removal (No Risk)
Remove these files immediately:
- add-scripts.ps1
- update-menus.ps1  
- content_cards.json
- painter.js
- test-js.html
- test-links.html
- test-minimal.html
- jsontemplate-demo.html (v1)
- upload-demo.html
- variables-demo.html

### Phase 2 - Conditional Removal (After Testing)
Test application functionality, then remove if confirmed unused:
- compact-ui.js and compact-ui.css
- api-examples.js
- dashboard.js
- flash.js

### Phase 3 - Review and Optimize
Keep but review for optimization:
- performance.js (verify monitoring needs)
- ap_list.html (check if used in specific configurations)
- navigation.html (determine if alternative nav is needed)

## USAGE INSTRUCTIONS

1. Run cleanup script in dry-run mode first:
   ```powershell
   .\cleanup-unused-files.ps1 -WhatIf
   ```

2. Remove safe files:
   ```powershell
   .\cleanup-unused-files.ps1
   ```

3. Force remove potentially unused files (after verification):
   ```powershell
   .\cleanup-unused-files.ps1 -Force
   ```

## VERIFICATION STEPS

Before removing potentially unused files:
1. Test all main application pages
2. Check if compact UI is used on mobile devices
3. Verify dashboard and flasher pages work without their specific JS files
4. Test performance monitoring functionality
5. Check if AP list is used in multi-AP configurations

## ESTIMATED SPACE SAVINGS

Removing safe-to-remove files should free up approximately:
- Test files: ~50-100KB
- Demo files: ~100-200KB  
- Build scripts: ~10-20KB
- Unused data: ~5-10KB
- Total estimated savings: ~165-330KB

## NOTES

- All core application functionality should remain intact after Phase 1 cleanup
- Phase 2 removals require testing to ensure no regressions
- Some files may be used conditionally based on device type or configuration
- Keep this inventory file as documentation of cleanup decisions
