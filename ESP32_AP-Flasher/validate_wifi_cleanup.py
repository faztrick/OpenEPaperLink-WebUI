#!/usr/bin/env python3
"""
WiFi Module Cleanup Validation Script
Validates that the WiFi module cleanup was successful and no issues remain.
"""

import os
import re
from pathlib import Path

def check_file_exists(filepath):
    """Check if a file exists"""
    return Path(filepath).exists()

def check_duplicate_endpoints(filepath):
    """Check for duplicate WiFi endpoint registrations"""
    if not check_file_exists(filepath):
        return []

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Look for duplicate endpoint registrations
    wifi_scan_matches = re.findall(r'server\.on\("/wifi_scan"', content)
    get_ssid_matches = re.findall(r'server\.on\("/get_ssid_list"', content)

    issues = []
    if len(wifi_scan_matches) > 1:
        issues.append(f"Found {len(wifi_scan_matches)} /wifi_scan endpoint registrations")
    if len(get_ssid_matches) > 1:
        issues.append(f"Found {len(get_ssid_matches)} /get_ssid_list endpoint registrations")

    return issues

def check_unused_includes(filepath):
    """Check for unused WiFi module includes"""
    if not check_file_exists(filepath):
        return []

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    issues = []
    if '#include "wifi_module.h"' in content:
        issues.append("Found unused wifi_module.h include")

    return issues

def check_settings_html_functionality(filepath):
    """Check if settings.html has WiFi functionality"""
    if not check_file_exists(filepath):
        return ["settings.html not found"]

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    required_functions = [
        'scanWifiNetworks',
        'connectToWifi',
        'wifi-scan-btn',
        'wifi-networks',
        'wifi-password'
    ]

    missing = []
    for func in required_functions:
        if func not in content:
            missing.append(f"Missing: {func}")

    return missing

def main():
    """Main validation function"""
    project_root = Path("d:/projects/esp/OpenEPaperLink/ESP32_AP-Flasher")

    print("🔍 WiFi Module Cleanup Validation")
    print("=" * 40)

    # Check removed files
    print("\n📁 Checking removed files...")
    removed_files = [
        "src/wifi_module.cpp",
        "include/wifi_module.h"
    ]

    for file_path in removed_files:
        full_path = project_root / file_path
        if check_file_exists(full_path):
            print(f"❌ {file_path} still exists (should be removed)")
        else:
            print(f"✅ {file_path} successfully removed")

    # Check web.cpp for duplicate endpoints
    print("\n🌐 Checking web.cpp for duplicate endpoints...")
    web_cpp_path = project_root / "src/web.cpp"
    duplicate_issues = check_duplicate_endpoints(web_cpp_path)

    if duplicate_issues:
        for issue in duplicate_issues:
            print(f"❌ {issue}")
    else:
        print("✅ No duplicate WiFi endpoints found")

    # Check for unused includes
    print("\n📋 Checking for unused includes...")
    include_issues = check_unused_includes(web_cpp_path)

    if include_issues:
        for issue in include_issues:
            print(f"❌ {issue}")
    else:
        print("✅ No unused WiFi module includes found")

    # Check settings.html functionality
    print("\n⚙️  Checking settings.html WiFi functionality...")
    settings_path = project_root / "web-ui/src/settings.html"
    settings_issues = check_settings_html_functionality(settings_path)

    if settings_issues:
        for issue in settings_issues:
            print(f"❌ {issue}")
    else:
        print("✅ All required WiFi functions found in settings.html")

    # Check wwwroot version
    print("\n📂 Checking wwwroot version...")
    wwwroot_settings = project_root / "wwwroot/settings.html"
    if check_file_exists(wwwroot_settings):
        print("✅ wwwroot/settings.html exists")
    else:
        print("❌ wwwroot/settings.html missing")

    # Summary
    print("\n📊 Validation Summary")
    print("-" * 20)

    all_good = (
        not any(check_file_exists(project_root / f) for f in removed_files) and
        not duplicate_issues and
        not include_issues and
        not settings_issues and
        check_file_exists(wwwroot_settings)
    )

    if all_good:
        print("✅ All validations passed! WiFi cleanup successful.")
        print("\n🚀 Ready for testing:")
        print("  1. Compile and flash the firmware")
        print("  2. Test WiFi scanning from settings page")
        print("  3. Test WiFi connection functionality")
        print("  4. Verify no duplicate endpoint conflicts")
    else:
        print("❌ Some issues found. Please review the output above.")

    return 0 if all_good else 1

if __name__ == "__main__":
    exit(main())
