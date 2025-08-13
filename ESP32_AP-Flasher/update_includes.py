#!/usr/bin/env python3
"""
Script to update #include statements across the codebase to use the new consolidated headers
"""

import os
import re
import glob

def update_includes_in_file(filepath):
    """Update include statements in a single file"""

    if not os.path.exists(filepath):
        return False

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except:
        print(f"⚠ Could not read {filepath}")
        return False

    original_content = content
    changes_made = False

    # Map old includes to new ones
    include_mappings = {
        '#include "common_utils.h"': '#include "core_utilities.h"',
        '#include "system_utilities.h"': '#include "core_utilities.h"',
        '#include "storage_utils.h"': '#include "core_utilities.h"',
        '#include "data_utilities.h"': '#include "core_utilities.h"',
        '#include "json_response_utils.h"': '#include "web_utilities.h"',
        '#include "web_response_utils.h"': '#include "web_utilities.h"',
        '#include "websocket_utils.h"': '#include "web_utilities.h"',
    }

    # Apply the mappings
    for old_include, new_include in include_mappings.items():
        if old_include in content:
            content = content.replace(old_include, new_include)
            changes_made = True

    # Remove duplicate includes that might result from multiple mappings to the same header
    lines = content.split('\n')
    seen_includes = set()
    cleaned_lines = []

    for line in lines:
        stripped_line = line.strip()
        if stripped_line.startswith('#include "core_utilities.h"') or stripped_line.startswith('#include "web_utilities.h"'):
            if stripped_line not in seen_includes:
                seen_includes.add(stripped_line)
                cleaned_lines.append(line)
            else:
                changes_made = True  # We're removing a duplicate
        else:
            cleaned_lines.append(line)

    content = '\n'.join(cleaned_lines)

    # Write back if changes were made
    if changes_made:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except:
            print(f"⚠ Could not write to {filepath}")
            return False

    return False

def update_function_calls():
    """Update function calls to use new namespace syntax"""

    # Find all .cpp and .h files
    files_to_update = []

    for pattern in ['src/*.cpp', 'src/*.h', 'include/*.h']:
        files_to_update.extend(glob.glob(pattern))

    # Remove our new consolidated files from the update list
    exclude_files = ['src/core_utilities.cpp', 'src/web_utilities.cpp',
                     'include/core_utilities.h', 'include/web_utilities.h']
    files_to_update = [f for f in files_to_update if f not in exclude_files]

    # Function call mappings - replace old function calls with new namespace calls
    function_mappings = {
        # ResponseUtils namespace functions -> CoreUtils or ValidationUtils
        'ResponseUtils::createErrorResponse': 'JsonResponseManager::createErrorResponse',
        'ResponseUtils::createSuccessResponse': 'JsonResponseManager::createSuccessResponse',
        'ResponseUtils::isValidIP': 'ValidationUtils::isValidIP',
        'ResponseUtils::isValidSSID': 'ValidationUtils::isValidSSID',
        'ResponseUtils::isValidPassword': 'ValidationUtils::isValidPassword',
        'ResponseUtils::parseQuotedString': 'ValidationUtils::parseQuotedString',
        'ResponseUtils::formatUptime': 'CoreUtils::formatUptime',
        'ResponseUtils::getMemoryInfo': 'SystemInfo::buildMemoryInfo',
        'ResponseUtils::getSystemInfo': 'SystemInfo::buildSystemInfo',

        # WiFiHelpers functions
        'WiFiHelpers::authModeToString': 'WiFiHelpers::authModeToString',
        'WiFiHelpers::authModeToInt': 'WiFiHelpers::authModeToInt',
        'WiFiHelpers::calculateSignalQuality': 'WiFiHelpers::calculateSignalQuality',
        'WiFiHelpers::getStatusString': 'WiFiHelpers::getStatusString',
        'WiFiHelpers::buildHostname': 'WiFiHelpers::buildHostname',

        # JsonResponseUtils functions
        'JsonResponseUtils::sendSuccessResponse': 'JsonResponseManager::sendSuccessResponse',
        'JsonResponseUtils::sendErrorResponse': 'JsonResponseManager::sendErrorResponse',
        'JsonResponseUtils::sendJsonResponse': 'JsonResponseManager::sendJsonResponse',
        'JsonResponseUtils::buildSystemInfo': 'SystemInfo::buildSystemInfo',
        'JsonResponseUtils::buildWiFiInfo': 'WiFiHelpers::buildWiFiInfo',
        'JsonResponseUtils::buildHardwareInfo': 'SystemInfo::buildHardwareInfo',

        # WebSocketUtils functions
        'WebSocketUtils::sendMessage': 'WebSocketManager::sendMessage',
        'WebSocketUtils::sendLogMessage': 'WebSocketManager::sendLogMessage',
        'WebSocketUtils::sendErrorMessage': 'WebSocketManager::sendErrorMessage',
        'WebSocketUtils::sendSystemInfo': 'WebSocketManager::sendSystemInfo',
        'WebSocketUtils::sendSerialOutput': 'WebSocketManager::sendSerialOutput',
        'WebSocketUtils::hasClients': 'WebSocketManager::hasClients',
        'WebSocketUtils::getClientCount': 'WebSocketManager::getClientCount',

        # StorageUtils functions
        'StorageUtils::setString': 'StorageManager::setString',
        'StorageUtils::getString': 'StorageManager::getString',
        'StorageUtils::setInt': 'StorageManager::setInt',
        'StorageUtils::getInt': 'StorageManager::getInt',
        'StorageUtils::setBool': 'StorageManager::setBool',
        'StorageUtils::getBool': 'StorageManager::getBool',

        # Direct function calls (no class prefix)
        'logLine(': 'LogUtils::logInfo(',
        'logStartUp()': 'LogUtils::logInfo("System started")',
        'formatUptime(': 'CoreUtils::formatUptime(',
    }

    updated_files = []

    for filepath in files_to_update:
        if update_includes_in_file(filepath):
            updated_files.append(filepath)

        # Update function calls
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()

            original_content = content

            for old_call, new_call in function_mappings.items():
                content = content.replace(old_call, new_call)

            if content != original_content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                if filepath not in updated_files:
                    updated_files.append(filepath)

        except Exception as e:
            print(f"⚠ Error processing {filepath}: {e}")

    return updated_files

def main():
    print("🔄 Updating include statements and function calls...")
    print("=" * 50)

    # Change to project directory
    os.chdir("d:/projects/esp/OpenEPaperLink/ESP32_AP-Flasher")

    updated_files = update_function_calls()

    if updated_files:
        print("✓ Updated files:")
        for filepath in sorted(updated_files):
            print(f"  • {filepath}")
    else:
        print("ℹ No files needed updates")

    print(f"\n✅ Update process completed! ({len(updated_files)} files updated)")

    print("\n📝 Manual updates may still be needed for:")
    print("  • Complex function calls with parameters")
    print("  • Macros that reference old functions")
    print("  • Conditional compilation blocks")
    print("  • Class member function calls")

    print("\n🔍 Recommended next steps:")
    print("  1. Compile the project to find any remaining issues")
    print("  2. Check for any remaining references to old utility functions")
    print("  3. Test the consolidated functionality")

if __name__ == "__main__":
    main()
