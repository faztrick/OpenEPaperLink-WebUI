#!/usr/bin/env python3
"""
ESP32 Module System Test Script
===============================

This script tests the enhanced module system implementation
by making HTTP requests to the module management API endpoints.

Usage: python module_test.py <ESP32_IP_ADDRESS>
"""

import sys
import json
import requests
import time
from typing import Dict, Any, List

class ModuleSystemTester:
    def __init__(self, esp32_ip: str):
        self.base_url = f"http://{esp32_ip}"
        self.session = requests.Session()
        self.session.timeout = 10
        
    def test_module_list(self) -> Dict[str, Any]:
        """Test the module list endpoint"""
        print("🔍 Testing module list endpoint...")
        try:
            response = self.session.get(f"{self.base_url}/api/modules")
            response.raise_for_status()
            data = response.json()
            
            print(f"✅ Found {data.get('totalModules', 0)} modules")
            print(f"✅ Active modules: {data.get('activeModules', 0)}")
            print(f"✅ System uptime: {data.get('uptime', 0)}ms")
            
            modules = data.get('modules', [])
            for module in modules:
                name = module.get('name', 'Unknown')
                version = module.get('version', 'Unknown')
                state = module.get('state', -1)
                healthy = module.get('healthy', False)
                status_icon = "🟢" if healthy else "🔴"
                print(f"  {status_icon} {name} v{version} (State: {state})")
                
            return data
        except Exception as e:
            print(f"❌ Module list test failed: {e}")
            return {}
    
    def test_module_status(self) -> Dict[str, Any]:
        """Test the module status endpoint"""
        print("\n🔍 Testing module status endpoint...")
        try:
            response = self.session.get(f"{self.base_url}/api/modules/status")
            response.raise_for_status()
            data = response.json()
            
            healthy = data.get('systemHealthy', False)
            status_icon = "🟢" if healthy else "🔴"
            print(f"{status_icon} System Health: {'Healthy' if healthy else 'Unhealthy'}")
            
            unhealthy = data.get('unhealthyModules', [])
            if unhealthy:
                print(f"⚠️  Unhealthy modules: {', '.join(unhealthy)}")
            else:
                print("✅ All modules are healthy")
                
            return data
        except Exception as e:
            print(f"❌ Module status test failed: {e}")
            return {}
    
    def test_c6_module(self) -> Dict[str, Any]:
        """Test C6 module specific endpoints"""
        print("\n🔍 Testing C6 module endpoints...")
        try:
            # Test C6 status
            response = self.session.get(f"{self.base_url}/api/c6/status")
            response.raise_for_status()
            data = response.json()
            
            connected = data.get('c6Connected', False)
            status_icon = "🟢" if connected else "🔴"
            print(f"{status_icon} C6 Module Connected: {connected}")
            
            if connected:
                print(f"  📡 Version: 0x{data.get('c6Version', 0):04X}")
                print(f"  📻 Channel: {data.get('c6Channel', 'Unknown')}")
                print(f"  📶 RSSI: {data.get('c6RSSI', 'Unknown')} dBm")
                print(f"  🔧 MAC: {data.get('c6Mac', 'Unknown')}")
                
                # Test module manager integration
                module_healthy = data.get('moduleHealthy', False)
                print(f"  🏥 Module Health: {'Healthy' if module_healthy else 'Unhealthy'}")
                print(f"  ⏱️  Module Uptime: {data.get('moduleUptime', 0)}ms")
            
            return data
        except Exception as e:
            print(f"❌ C6 module test failed: {e}")
            return {}
    
    def test_module_control(self, module_name: str = "C6Module") -> bool:
        """Test module control functionality"""
        print(f"\n🔍 Testing module control for {module_name}...")
        try:
            # Test module status check
            control_data = {
                'module': module_name,
                'action': 'status'
            }
            
            response = self.session.post(f"{self.base_url}/api/modules/control", 
                                       data=control_data)
            response.raise_for_status()
            data = response.json()
            
            success = data.get('success', False)
            message = data.get('message', 'No message')
            status_icon = "✅" if success else "❌"
            
            print(f"{status_icon} Control test: {message}")
            return success
            
        except Exception as e:
            print(f"❌ Module control test failed: {e}")
            return False
    
    def test_wifi_endpoints(self) -> Dict[str, Any]:
        """Test WiFi module endpoints if available"""
        print("\n🔍 Testing WiFi module endpoints...")
        try:
            response = self.session.get(f"{self.base_url}/api/wifi/status")
            if response.status_code == 404:
                print("⚠️  WiFi module endpoints not available (module not enabled)")
                return {}
                
            response.raise_for_status()
            data = response.json()
            
            connected = data.get('connected', False)
            status_icon = "🟢" if connected else "🔴"
            print(f"{status_icon} WiFi Connected: {connected}")
            
            if connected:
                print(f"  📡 SSID: {data.get('ssid', 'Unknown')}")
                print(f"  🌐 IP: {data.get('ip', 'Unknown')}")
                print(f"  📶 RSSI: {data.get('rssi', 'Unknown')} dBm")
                print(f"  📻 Channel: {data.get('channel', 'Unknown')}")
            
            return data
        except Exception as e:
            print(f"❌ WiFi module test failed: {e}")
            return {}
    
    def test_system_info(self) -> Dict[str, Any]:
        """Test system information endpoint"""
        print("\n🔍 Testing system information...")
        try:
            response = self.session.get(f"{self.base_url}/sysinfo")
            response.raise_for_status()
            data = response.json()
            
            print(f"📱 Device: {data.get('device', 'Unknown')}")
            print(f"🔢 Version: {data.get('version', 'Unknown')}")
            print(f"💾 Free Heap: {data.get('heap', 0)} bytes")
            print(f"⏱️  Uptime: {data.get('uptime', 0)} seconds")
            
            return data
        except Exception as e:
            print(f"❌ System info test failed: {e}")
            return {}
    
    def run_comprehensive_test(self) -> Dict[str, bool]:
        """Run all tests and return results"""
        print("🚀 Starting Enhanced Module System Test")
        print("=" * 50)
        
        results = {}
        
        # Test basic connectivity
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                print("✅ ESP32 device is reachable")
                results['connectivity'] = True
            else:
                print("❌ ESP32 device connectivity issue")
                results['connectivity'] = False
                return results
        except Exception as e:
            print(f"❌ Cannot reach ESP32 device: {e}")
            results['connectivity'] = False
            return results
        
        # Run individual tests
        module_data = self.test_module_list()
        results['module_list'] = bool(module_data)
        
        status_data = self.test_module_status()
        results['module_status'] = bool(status_data)
        
        c6_data = self.test_c6_module()
        results['c6_module'] = bool(c6_data)
        
        control_result = self.test_module_control()
        results['module_control'] = control_result
        
        wifi_data = self.test_wifi_endpoints()
        results['wifi_module'] = bool(wifi_data)
        
        system_data = self.test_system_info()
        results['system_info'] = bool(system_data)
        
        # Summary
        print("\n📊 Test Results Summary")
        print("=" * 30)
        passed = sum(1 for result in results.values() if result)
        total = len(results)
        
        for test_name, passed_test in results.items():
            icon = "✅" if passed_test else "❌"
            print(f"{icon} {test_name.replace('_', ' ').title()}")
        
        print(f"\n🎯 Overall Score: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed! Enhanced module system is working perfectly!")
        elif passed > total / 2:
            print("⚠️  Most tests passed, some features may need attention")
        else:
            print("❌ Multiple issues detected, please check the implementation")
        
        return results

def main():
    if len(sys.argv) != 2:
        print("Usage: python module_test.py <ESP32_IP_ADDRESS>")
        print("Example: python module_test.py 192.168.1.100")
        sys.exit(1)
    
    esp32_ip = sys.argv[1]
    tester = ModuleSystemTester(esp32_ip)
    
    try:
        results = tester.run_comprehensive_test()
        
        # Exit with appropriate code
        if all(results.values()):
            sys.exit(0)  # All tests passed
        else:
            sys.exit(1)  # Some tests failed
            
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
        sys.exit(2)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        sys.exit(3)

if __name__ == "__main__":
    main()
