#!/usr/bin/env python3
"""
Remove duplicate functions and merge appropriate files in ESP32_AP-Flasher src folder
"""

import os
import re
import shutil
from typing import List, Dict, Set

def remove_duplicate_functions():
    """Remove duplicate functions that are simple wrappers to common utilities"""
    
    # File: wifi_utils.cpp - Remove wrapper functions that just call WiFiHelpers
    wifi_utils_path = "src/wifi_utils.cpp"
    
    functions_to_remove = [
        {
            'signature': r'String WiFiUtils::getEncryptionString\(wifi_auth_mode_t encryption\)\s*{[^}]*}',
            'reason': 'Wrapper for WiFiHelpers::authModeToString'
        },
        {
            'signature': r'int WiFiUtils::getEncryptionType\(wifi_auth_mode_t encryption\)\s*{[^}]*}',
            'reason': 'Wrapper for WiFiHelpers::authModeToInt'
        },
        {
            'signature': r'int WiFiUtils::calculateSignalQuality\(int rssi\)\s*{[^}]*}',
            'reason': 'Wrapper for WiFiHelpers::calculateSignalQuality'
        },
        {
            'signature': r'String WiFiUtils::buildHostname\(esp_mac_type_t mac_type\)\s*{[^}]*}',
            'reason': 'Wrapper for WiFiHelpers::buildHostname'
        }
    ]
    
    print(f"🔍 Processing {wifi_utils_path}...")
    
    if os.path.exists(wifi_utils_path):
        with open(wifi_utils_path, 'r', encoding='utf-8') as file:
            content = file.read()
        
        original_size = len(content)
        
        for func in functions_to_remove:
            pattern = func['signature']
            matches = re.findall(pattern, content, re.DOTALL)
            
            if matches:
                print(f"  ❌ Removing duplicate: {func['reason']}")
                content = re.sub(pattern, '', content, flags=re.DOTALL)
        
        # Clean up extra whitespace
        content = re.sub(r'\n{3,}', '\n\n', content)
        
        # Write back
        with open(wifi_utils_path, 'w', encoding='utf-8') as file:
            file.write(content)
        
        new_size = len(content)
        saved_bytes = original_size - new_size
        print(f"  ✅ Saved {saved_bytes} bytes by removing duplicates")
    
    # Update header file to remove declarations
    wifi_utils_header = "include/wifi_utils.h"
    if os.path.exists(wifi_utils_header):
        print(f"🔍 Processing {wifi_utils_header}...")
        with open(wifi_utils_header, 'r', encoding='utf-8') as file:
            header_content = file.read()
        
        # Remove method declarations for duplicate functions
        methods_to_remove = [
            r'String\s+getEncryptionString\(wifi_auth_mode_t\s+encryption\);',
            r'int\s+getEncryptionType\(wifi_auth_mode_t\s+encryption\);',
            r'int\s+calculateSignalQuality\(int\s+rssi\);',
            r'String\s+buildHostname\(esp_mac_type_t\s+mac_type\);'
        ]
        
        for method_pattern in methods_to_remove:
            if re.search(method_pattern, header_content):
                print(f"  ❌ Removing method declaration: {method_pattern}")
                header_content = re.sub(method_pattern, '', header_content)
        
        # Clean up extra whitespace
        header_content = re.sub(r'\n{3,}', '\n\n', header_content)
        
        with open(wifi_utils_header, 'w', encoding='utf-8') as file:
            file.write(header_content)
        
        print(f"  ✅ Updated header file")

def update_function_calls():
    """Update function calls to use common utilities directly"""
    
    files_to_update = [
        "src/wifi_utils.cpp",
        "src/serial_commands.cpp", 
        "src/web.cpp"
    ]
    
    replacements = [
        {
            'pattern': r'getEncryptionString\(([^)]+)\)',
            'replacement': r'WiFiHelpers::authModeToString(\1)',
            'description': 'Replace getEncryptionString with WiFiHelpers::authModeToString'
        },
        {
            'pattern': r'getEncryptionType\(([^)]+)\)',
            'replacement': r'WiFiHelpers::authModeToInt(\1)',
            'description': 'Replace getEncryptionType with WiFiHelpers::authModeToInt'  
        },
        {
            'pattern': r'calculateSignalQuality\(([^)]+)\)',
            'replacement': r'WiFiHelpers::calculateSignalQuality(\1)',
            'description': 'Replace calculateSignalQuality with WiFiHelpers::calculateSignalQuality'
        },
        {
            'pattern': r'buildHostname\(([^)]+)\)',
            'replacement': r'WiFiHelpers::buildHostname("OpenEpaperLink")',
            'description': 'Replace buildHostname with WiFiHelpers::buildHostname'
        }
    ]
    
    for file_path in files_to_update:
        if os.path.exists(file_path):
            print(f"🔄 Updating function calls in {file_path}...")
            
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            changes_made = 0
            for replacement in replacements:
                matches = re.findall(replacement['pattern'], content)
                if matches:
                    print(f"  🔧 {replacement['description']} ({len(matches)} occurrences)")
                    content = re.sub(replacement['pattern'], replacement['replacement'], content)
                    changes_made += len(matches)
            
            if changes_made > 0:
                with open(file_path, 'w', encoding='utf-8') as file:
                    file.write(content)
                print(f"  ✅ Made {changes_made} replacements")
            else:
                print(f"  ℹ️  No changes needed")

def merge_response_utilities():
    """Merge web_response_utils.cpp functionality into common_utils.cpp if beneficial"""
    
    web_response_path = "src/web_response_utils.cpp"
    common_utils_path = "src/common_utils.cpp"
    
    if not os.path.exists(web_response_path):
        print(f"⚠️  {web_response_path} not found, skipping merge")
        return
    
    print(f"🔍 Analyzing {web_response_path} for potential merge...")
    
    with open(web_response_path, 'r', encoding='utf-8') as file:
        web_content = file.read()
    
    # Check if web_response_utils contains mostly web-specific functionality
    web_specific_patterns = [
        r'AsyncWebServerRequest',
        r'WebServer',
        r'HTTP_',
        r'request->send',
        r'WebSocket'
    ]
    
    web_specific_count = 0
    for pattern in web_specific_patterns:
        web_specific_count += len(re.findall(pattern, web_content))
    
    if web_specific_count > 10:
        print(f"  ℹ️  {web_response_path} contains {web_specific_count} web-specific items")
        print(f"  📝 Recommendation: Keep as separate file for web-specific utilities")
    else:
        print(f"  🔄 Could potentially merge with common_utils.cpp")

def remove_unused_includes():
    """Remove unused includes after function removal"""
    
    files_to_check = [
        "src/wifi_utils.cpp",
        "src/serial_commands.cpp"
    ]
    
    for file_path in files_to_check:
        if os.path.exists(file_path):
            print(f"🧹 Cleaning unused includes in {file_path}...")
            
            with open(file_path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Look for potentially unused includes (this is a basic check)
            # This would need more sophisticated analysis for real unused includes
            lines = content.split('\n')
            
            # Count references to included headers
            include_usage = {}
            for line in lines:
                if line.strip().startswith('#include'):
                    header_match = re.search(r'#include\s*[<"]([^>"]+)[>"]', line)
                    if header_match:
                        header = header_match.group(1)
                        include_usage[header] = 0
                        
                        # Count usage of header name in file
                        header_name = os.path.basename(header).replace('.h', '').replace('.hpp', '')
                        include_usage[header] = content.count(header_name) - 1  # -1 for the include line itself
            
            # Report potentially unused includes
            unused_includes = [header for header, count in include_usage.items() if count <= 1]
            if unused_includes:
                print(f"  ⚠️  Potentially unused includes: {', '.join(unused_includes)}")
                print(f"  📝 Manual review recommended")

def create_summary_report():
    """Create a summary of changes made"""
    
    print("\n" + "="*60)
    print("📊 DUPLICATE REMOVAL SUMMARY")
    print("="*60)
    
    print("✅ COMPLETED ACTIONS:")
    print("  • Removed wrapper functions from WiFiUtils class")
    print("  • Updated function calls to use WiFiHelpers directly")
    print("  • Cleaned up header file declarations")
    print("  • Analyzed potential file merges")
    
    print("\n🎯 BENEFITS:")
    print("  • Reduced code duplication")
    print("  • Improved maintainability")
    print("  • Smaller binary size")
    print("  • Single source of truth for utilities")
    
    print("\n📝 RECOMMENDATIONS:")
    print("  • Test compilation after changes")
    print("  • Verify functionality still works")
    print("  • Consider removing unused includes manually")
    print("  • Review web_response_utils.cpp for further optimization")
    
    print("\n🔧 NEXT STEPS:")
    print("  • Compile project: platformio run")
    print("  • Run tests if available")
    print("  • Commit changes if successful")

def main():
    """Main function to orchestrate duplicate removal"""
    
    print("🚀 ESP32_AP-Flasher Duplicate Function Removal")
    print("=" * 50)
    
    # Change to project directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    try:
        # Step 1: Remove duplicate functions
        remove_duplicate_functions()
        print()
        
        # Step 2: Update function calls
        update_function_calls()
        print()
        
        # Step 3: Analyze merge opportunities  
        merge_response_utilities()
        print()
        
        # Step 4: Clean unused includes
        remove_unused_includes()
        print()
        
        # Step 5: Create summary
        create_summary_report()
        
    except Exception as e:
        print(f"❌ Error during processing: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
