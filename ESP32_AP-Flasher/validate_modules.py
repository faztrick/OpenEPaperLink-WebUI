#!/usr/bin/env python3
"""
Local Module System Validation Script
=====================================

This script validates the enhanced module system implementation
by checking the code structure and build artifacts.
"""

import os
import re
import json
from pathlib import Path

class LocalModuleValidator:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.src_dir = self.project_root / "src"
        self.include_dir = self.project_root / "include"
        self.build_dir = self.project_root / ".pio" / "build" / "OutdoorAP"
        
    def check_file_exists(self, file_path: Path) -> bool:
        """Check if a file exists and is readable"""
        return file_path.exists() and file_path.is_file()
    
    def validate_module_manager_files(self) -> bool:
        """Validate module manager implementation files"""
        print("🔍 Validating Module Manager Files...")
        
        header_file = self.include_dir / "module_manager.h"
        source_file = self.src_dir / "module_manager.cpp"
        
        if not self.check_file_exists(header_file):
            print("❌ module_manager.h not found")
            return False
        
        if not self.check_file_exists(source_file):
            print("❌ module_manager.cpp not found")
            return False
        
        # Check header content
        with open(header_file, 'r', encoding='utf-8') as f:
            header_content = f.read()
        
        required_classes = [
            'class ModuleInterface',
            'class ModuleManager',
            'enum class ModuleType',
            'enum class ModuleState'
        ]
        
        for required_class in required_classes:
            if required_class not in header_content:
                print(f"❌ Missing {required_class} in header")
                return False
        
        print("✅ Module manager files validated")
        return True
    
    def validate_c6_module_integration(self) -> bool:
        """Validate C6 module integration with module manager"""
        print("🔍 Validating C6 Module Integration...")
        
        c6_file = self.src_dir / "c6_module.cpp"
        
        if not self.check_file_exists(c6_file):
            print("❌ c6_module.cpp not found")
            return False
        
        with open(c6_file, 'r', encoding='utf-8') as f:
            c6_content = f.read()
        
        # Check for module manager integration
        integration_patterns = [
            r'#include\s+["\']module_manager\.h["\']',
            r'class\s+C6Module\s*:\s*public\s+ModuleInterface',
            r'ModuleType\s*getType\(\)',
            r'ModuleState\s*getState\(\)',
            r'bool\s*isHealthy\(\)'
        ]
        
        for pattern in integration_patterns:
            if not re.search(pattern, c6_content):
                print(f"❌ Missing pattern: {pattern}")
                return False
        
        print("✅ C6 module integration validated")
        return True
    
    def validate_wifi_module(self) -> bool:
        """Validate WiFi module implementation"""
        print("🔍 Validating WiFi Module...")
        
        wifi_header = self.include_dir / "wifi_module.h"
        wifi_source = self.src_dir / "wifi_module.cpp"
        
        if not self.check_file_exists(wifi_header):
            print("⚠️  wifi_module.h not found (optional)")
            return True  # WiFi module is optional
        
        if not self.check_file_exists(wifi_source):
            print("⚠️  wifi_module.cpp not found (optional)")
            return True  # WiFi module is optional
        
        with open(wifi_header, 'r', encoding='utf-8') as f:
            wifi_content = f.read()
        
        if 'class WiFiModule' in wifi_content and 'ModuleInterface' in wifi_content:
            print("✅ WiFi module implementation found")
        else:
            print("⚠️  WiFi module structure incomplete")
        
        return True
    
    def validate_web_integration(self) -> bool:
        """Validate web API integration"""
        print("🔍 Validating Web API Integration...")
        
        web_file = self.src_dir / "web.cpp"
        
        if not self.check_file_exists(web_file):
            print("❌ web.cpp not found")
            return False
        
        with open(web_file, 'r', encoding='utf-8') as f:
            web_content = f.read()
        
        # Check for module API endpoints
        api_patterns = [
            r'["\'/]api/modules["\']',
            r'["\'/]api/modules/status["\']',
            r'["\'/]api/modules/control["\']'
        ]
        
        found_apis = 0
        for pattern in api_patterns:
            if re.search(pattern, web_content):
                found_apis += 1
        
        if found_apis >= 2:  # At least 2 API endpoints
            print(f"✅ Found {found_apis} module API endpoints")
            return True
        else:
            print(f"⚠️  Only found {found_apis} module API endpoints")
            return False
    
    def validate_build_artifacts(self) -> bool:
        """Validate build artifacts"""
        print("🔍 Validating Build Artifacts...")
        
        firmware_elf = self.build_dir / "firmware.elf"
        firmware_bin = self.build_dir / "firmware.bin"
        
        if not self.check_file_exists(firmware_elf):
            print("❌ firmware.elf not found - run build first")
            return False
        
        if not self.check_file_exists(firmware_bin):
            print("❌ firmware.bin not found - run build first")
            return False
        
        # Check file sizes
        elf_size = firmware_elf.stat().st_size
        bin_size = firmware_bin.stat().st_size
        
        if elf_size > 1024 and bin_size > 1024:  # Basic sanity check
            print(f"✅ Build artifacts valid (ELF: {elf_size:,} bytes, BIN: {bin_size:,} bytes)")
            return True
        else:
            print("❌ Build artifacts appear invalid (too small)")
            return False
    
    def validate_configuration(self) -> bool:
        """Validate configuration files"""
        print("🔍 Validating Configuration...")
        
        platformio_ini = self.project_root / "platformio.ini"
        
        if not self.check_file_exists(platformio_ini):
            print("❌ platformio.ini not found")
            return False
        
        with open(platformio_ini, 'r', encoding='utf-8') as f:
            config_content = f.read()
        
        # Check for ESP32-S3 configuration
        if 'esp32-s3' in config_content.lower():
            print("✅ ESP32-S3 configuration found")
            return True
        else:
            print("⚠️  ESP32-S3 configuration not clearly specified")
            return False
    
    def run_validation(self) -> dict:
        """Run all validation tests"""
        print("🚀 Starting Local Module System Validation")
        print("=" * 50)
        
        results = {}
        
        # Run validation tests
        results['module_manager'] = self.validate_module_manager_files()
        results['c6_integration'] = self.validate_c6_module_integration()
        results['wifi_module'] = self.validate_wifi_module()
        results['web_integration'] = self.validate_web_integration()
        results['build_artifacts'] = self.validate_build_artifacts()
        results['configuration'] = self.validate_configuration()
        
        # Summary
        print("\n📊 Validation Results")
        print("=" * 30)
        
        passed = sum(1 for result in results.values() if result)
        total = len(results)
        
        for test_name, passed_test in results.items():
            icon = "✅" if passed_test else "❌"
            print(f"{icon} {test_name.replace('_', ' ').title()}")
        
        print(f"\n🎯 Overall Score: {passed}/{total} validations passed")
        
        if passed == total:
            print("🎉 All validations passed! Code structure is correct!")
        elif passed >= total - 1:
            print("⚠️  Minor issues detected, but structure is mostly correct")
        else:
            print("❌ Multiple issues detected, please review implementation")
        
        return results

def main():
    project_root = os.getcwd()
    validator = LocalModuleValidator(project_root)
    
    try:
        results = validator.run_validation()
        
        # Print next steps
        print("\n📋 Next Steps:")
        print("1. If all validations passed, flash the firmware to your ESP32")
        print("2. Use the module_test.py script with your ESP32's IP address")
        print("3. Monitor the serial output for module initialization messages")
        print("4. Test the web API endpoints listed in the test script")
        
        # Exit with appropriate code
        if all(results.values()):
            return 0  # Success
        elif sum(results.values()) >= len(results) - 1:
            return 1  # Minor issues
        else:
            return 2  # Major issues
            
    except Exception as e:
        print(f"\n❌ Validation error: {e}")
        return 3

if __name__ == "__main__":
    exit(main())
