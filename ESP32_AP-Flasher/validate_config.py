# OpenEPL ESP32 Build Validation Script
# Validates the platformio.ini configuration and checks for potential issues

import re
import os
from pathlib import Path

class PlatformIOValidator:
    def __init__(self, config_file):
        self.config_file = Path(config_file)
        self.warnings = []
        self.errors = []
        self.info = []
        
    def validate(self):
        """Run all validation checks"""
        print("🔍 Validating OpenEPL ESP32 Configuration...")
        
        if not self.config_file.exists():
            self.errors.append(f"Configuration file not found: {self.config_file}")
            return self.generate_report()
        
        content = self.config_file.read_text()
        
        # Run validation checks
        self.check_platform_version(content)
        self.check_library_dependencies(content)
        self.check_feature_conflicts(content)
        self.check_memory_configuration(content)
        self.check_pin_assignments(content)
        self.check_build_flags(content)
        self.check_partition_table(content)
        
        return self.generate_report()
    
    def check_platform_version(self, content):
        """Check ESP32 platform version"""
        platform_match = re.search(r'platform\s*=\s*(.+)', content)
        if platform_match:
            platform = platform_match.group(1).strip()
            if 'espressif32' in platform:
                if '@' in platform:
                    version = platform.split('@')[1]
                    self.info.append(f"✅ ESP32 platform version: {version}")
                else:
                    self.warnings.append("⚠️ No platform version specified, may cause compatibility issues")
            else:
                self.errors.append(f"❌ Unexpected platform: {platform}")
        else:
            self.errors.append("❌ No platform specified")
    
    def check_library_dependencies(self, content):
        """Check library dependencies"""
        lib_deps_section = re.search(r'lib_deps\s*=\s*\n((?:\s+.+\n)*)', content, re.MULTILINE)
        if lib_deps_section:
            libs = lib_deps_section.group(1).strip().split('\n')
            lib_count = len([lib for lib in libs if lib.strip() and not lib.strip().startswith(';')])
            self.info.append(f"✅ Found {lib_count} library dependencies")
            
            # Check for critical libraries
            critical_libs = ['AsyncTCP', 'ESPAsyncWebServer', 'ArduinoJson', 'TFT_eSPI']
            for critical_lib in critical_libs:
                if any(critical_lib in lib for lib in libs):
                    self.info.append(f"✅ Critical library found: {critical_lib}")
                else:
                    self.warnings.append(f"⚠️ Critical library missing: {critical_lib}")
        else:
            self.errors.append("❌ No library dependencies found")
    
    def check_feature_conflicts(self, content):
        """Check for conflicting feature flags"""
        # Extract all feature flags
        features = re.findall(r'-D\s+([A-Z_]+)(?:=\d+)?', content)
        
        # Check for known conflicts
        conflicts = [
            (['HAS_LILYGO_TPANEL', 'HAS_4inch_TPANEL'], "Multiple touch panel types"),
            (['SAVE_SPACE', 'WEB_UI_ENHANCED'], "Space saving conflicts with enhanced UI"),
        ]
        
        for conflict_features, description in conflicts:
            enabled_conflicting = [f for f in conflict_features if f in features]
            if len(enabled_conflicting) > 1:
                self.warnings.append(f"⚠️ Potential conflict: {description} - {enabled_conflicting}")
        
        # Feature dependency checks
        dependencies = {
            'TAG_LED_CONTROL': ['HAS_SUBGHZ'],
            'TAG_BATTERY_MONITOR': ['HAS_SUBGHZ'],
            'FIND_MY_TAG': ['TAG_LED_CONTROL'],
            'HAS_C6': ['HAS_H2'],
        }
        
        for feature, deps in dependencies.items():
            if feature in features:
                missing_deps = [dep for dep in deps if dep not in features]
                if missing_deps:
                    self.warnings.append(f"⚠️ Feature {feature} missing dependencies: {missing_deps}")
        
        self.info.append(f"✅ Found {len(features)} feature flags")
    
    def check_memory_configuration(self, content):
        """Check memory and PSRAM configuration"""
        memory_checks = [
            (r'BOARD_HAS_PSRAM', "PSRAM support"),
            (r'CONFIG_SPIRAM_USE_MALLOC', "SPIRAM malloc"),
            (r'CONFIG_ESP32S3_SPIRAM_SUPPORT', "ESP32-S3 SPIRAM"),
        ]
        
        for pattern, description in memory_checks:
            if re.search(pattern, content):
                self.info.append(f"✅ {description} enabled")
            else:
                self.warnings.append(f"⚠️ {description} not found - may cause memory issues")
        
        # Check partition table
        partition_match = re.search(r'board_build\.partitions\s*=\s*(.+)', content)
        if partition_match:
            partition_file = partition_match.group(1).strip()
            if '32MB' in partition_file:
                self.info.append(f"✅ Using 32MB partition table: {partition_file}")
            else:
                self.warnings.append(f"⚠️ Partition table may be too small: {partition_file}")
        else:
            self.errors.append("❌ No partition table specified")
    
    def check_pin_assignments(self, content):
        """Check pin assignments for conflicts"""
        # Extract pin assignments
        pin_assignments = {}
        pin_pattern = r'-D\s+([A-Z_]+)=(\d+|-1)'
        
        for match in re.finditer(pin_pattern, content):
            define_name = match.group(1)
            pin_number = match.group(2)
            
            if pin_number != '-1' and 'PIN' in define_name or any(x in define_name for x in ['TXD', 'RXD', 'MOSI', 'MISO', 'CLK', 'CS', 'DC', 'RST']):
                if pin_number in pin_assignments:
                    self.warnings.append(f"⚠️ Pin conflict: Pin {pin_number} used by both {pin_assignments[pin_number]} and {define_name}")
                else:
                    pin_assignments[pin_number] = define_name
        
        self.info.append(f"✅ Checked {len(pin_assignments)} pin assignments")
    
    def check_build_flags(self, content):
        """Check build flags and optimization"""
        optimization_flags = ['-O2', '-Os', '-O3']
        has_optimization = any(flag in content for flag in optimization_flags)
        
        if has_optimization:
            self.info.append("✅ Optimization flags found")
        else:
            self.warnings.append("⚠️ No optimization flags found")
        
        # Check for debug flags
        if 'CORE_DEBUG_LEVEL=0' in content:
            self.info.append("✅ Debug output disabled for production")
        else:
            self.warnings.append("⚠️ Debug output may be enabled")
        
        # Check C++ standard
        if '-std=gnu++17' in content:
            self.info.append("✅ Using C++17 standard")
        else:
            self.warnings.append("⚠️ C++ standard not specified or outdated")
    
    def check_partition_table(self, content):
        """Check if partition table file exists"""
        partition_match = re.search(r'board_build\.partitions\s*=\s*(.+)', content)
        if partition_match:
            partition_file = partition_match.group(1).strip()
            partition_path = self.config_file.parent / partition_file
            
            if partition_path.exists():
                self.info.append(f"✅ Partition table file exists: {partition_file}")
            else:
                self.errors.append(f"❌ Partition table file not found: {partition_file}")
    
    def generate_report(self):
        """Generate validation report"""
        print("\n" + "="*60)
        print("📊 VALIDATION REPORT")
        print("="*60)
        
        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"  {error}")
        
        if self.warnings:
            print(f"\n⚠️ WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  {warning}")
        
        if self.info:
            print(f"\n✅ INFO ({len(self.info)}):")
            for info in self.info:
                print(f"  {info}")
        
        # Overall status
        print(f"\n📈 SUMMARY:")
        print(f"  Errors: {len(self.errors)}")
        print(f"  Warnings: {len(self.warnings)}")
        print(f"  Info: {len(self.info)}")
        
        if self.errors:
            print(f"\n🚨 BUILD LIKELY TO FAIL - Please fix errors before building")
            return False
        elif self.warnings:
            print(f"\n⚠️ BUILD MAY HAVE ISSUES - Review warnings")
            return True
        else:
            print(f"\n🎉 CONFIGURATION LOOKS GOOD")
            return True

def main():
    """Main validation function"""
    config_file = "platformio.ini"
    
    if not os.path.exists(config_file):
        print(f"❌ Configuration file not found: {config_file}")
        print("   Please run this script from the ESP32_AP-Flasher directory")
        return False
    
    validator = PlatformIOValidator(config_file)
    result = validator.validate()
    
    print(f"\n🔧 NEXT STEPS:")
    if result:
        print("  1. Run: pio run -e OutdoorAP")
        print("  2. Test features using the web interface")
        print("  3. Monitor for any runtime issues")
    else:
        print("  1. Fix the errors listed above")
        print("  2. Re-run this validation script")
        print("  3. Then attempt to build")
    
    return result

if __name__ == "__main__":
    main()
