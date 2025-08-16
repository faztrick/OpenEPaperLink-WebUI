#!/usr/bin/env python3
"""
OpenEPaperLink Debug Monitor
Continuous monitoring of ESP32-S3 devices and API endpoints
"""

import requests
import json
import time
import threading
import serial
import sys
from datetime import datetime
from typing import Dict, List, Optional

class ESP32DebugMonitor:
    def __init__(self, ip_addresses: List[str], com_ports: List[str] = None):
        self.ip_addresses = ip_addresses
        self.com_ports = com_ports or []
        self.running = False
        self.serial_connections = {}

        # Key API endpoints discovered from source code
        self.api_endpoints = {
            'system': [
                '/sysinfo.json',
                '/api/telemetry',
                '/system_info',
                '/api/features'
            ],
            'wifi': [
                '/api/wifi/status',
                '/network_info',
                '/get_wifi_config'
            ],
            'tags': [
                '/gettags',
                '/get_db',
                '/tag_status'
            ],
            'modules': [
                '/api/modules',
                '/api/modules/status'
            ],
            'c6': [
                '/test_c6_connection',
                '/test_c6_radio',
                '/get_c6_settings',
                '/c6_update_status'
            ]
        }

    def log_with_timestamp(self, message: str, source: str = "MONITOR"):
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[{timestamp}] [{source}] {message}")

    def test_api_endpoint(self, ip: str, endpoint: str) -> Optional[Dict]:
        """Test a single API endpoint and return response"""
        try:
            url = f"http://{ip}{endpoint}"
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                try:
                    return response.json()
                except:
                    return {"raw_response": response.text}
            else:
                return {"error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}

    def monitor_api_endpoints(self, ip: str):
        """Continuously monitor API endpoints for a device"""
        self.log_with_timestamp(f"Starting API monitoring for {ip}")

        while self.running:
            # Test key endpoints
            for category, endpoints in self.api_endpoints.items():
                for endpoint in endpoints:
                    result = self.test_api_endpoint(ip, endpoint)
                    if result and "error" not in result:
                        # Log important status changes
                        if endpoint == '/api/wifi/status':
                            if 'connected' in result:
                                self.log_with_timestamp(f"WiFi Status: {result.get('status', 'unknown')}", f"API-{ip}")
                        elif endpoint == '/sysinfo.json':
                            if 'heap' in result:
                                heap = result.get('heap', {})
                                self.log_with_timestamp(f"Heap: Free={heap.get('free', 0)}, Used={heap.get('used', 0)}", f"API-{ip}")
                        elif endpoint == '/api/modules/status':
                            if isinstance(result, dict):
                                active_modules = [name for name, status in result.items() if status.get('running', False)]
                                self.log_with_timestamp(f"Active modules: {', '.join(active_modules)}", f"API-{ip}")

                    time.sleep(0.1)  # Brief pause between endpoints

            time.sleep(5)  # Wait before next full scan

    def monitor_serial_port(self, port: str):
        """Monitor serial output from a COM port"""
        try:
            ser = serial.Serial(port, 115200, timeout=1)
            self.serial_connections[port] = ser
            self.log_with_timestamp(f"Connected to serial port {port}")

            while self.running:
                try:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    if line:
                        # Filter for important debug messages
                        if any(keyword in line.lower() for keyword in [
                            'error', 'failed', 'warning', 'exception', 'crash',
                            'wifi connected', 'ip:', 'heap:', 'module', 'c6',
                            'tag', 'flash', 'boot', 'init'
                        ]):
                            self.log_with_timestamp(line, f"SERIAL-{port}")
                except Exception as e:
                    self.log_with_timestamp(f"Serial read error: {e}", f"SERIAL-{port}")
                    break

        except Exception as e:
            self.log_with_timestamp(f"Failed to connect to {port}: {e}", "SERIAL")

    def discover_devices(self) -> List[str]:
        """Discover active ESP32 devices on the network"""
        active_devices = []

        # Test provided IP addresses
        for ip in self.ip_addresses:
            result = self.test_api_endpoint(ip, '/sysinfo.json')
            if result and "error" not in result:
                active_devices.append(ip)
                self.log_with_timestamp(f"Device discovered at {ip}", "DISCOVERY")

                # Log device info
                if 'version' in result:
                    self.log_with_timestamp(f"  Version: {result['version']}", "DISCOVERY")
                if 'chip' in result:
                    self.log_with_timestamp(f"  Chip: {result['chip']}", "DISCOVERY")

        return active_devices

    def start_monitoring(self):
        """Start all monitoring threads"""
        self.running = True
        self.log_with_timestamp("Starting OpenEPaperLink Debug Monitor", "INIT")

        # Discover active devices
        active_devices = self.discover_devices()

        if not active_devices:
            self.log_with_timestamp("No devices found, monitoring serial ports only", "INIT")

        # Start API monitoring threads
        api_threads = []
        for ip in active_devices:
            thread = threading.Thread(target=self.monitor_api_endpoints, args=(ip,))
            thread.daemon = True
            thread.start()
            api_threads.append(thread)

        # Start serial monitoring threads
        serial_threads = []
        for port in self.com_ports:
            thread = threading.Thread(target=self.monitor_serial_port, args=(port,))
            thread.daemon = True
            thread.start()
            serial_threads.append(thread)

        try:
            # Main monitoring loop
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            self.log_with_timestamp("Stopping monitor...", "SHUTDOWN")
            self.stop_monitoring()

    def stop_monitoring(self):
        """Stop all monitoring"""
        self.running = False

        # Close serial connections
        for port, ser in self.serial_connections.items():
            try:
                ser.close()
                self.log_with_timestamp(f"Closed serial connection to {port}", "SHUTDOWN")
            except:
                pass

    def run_diagnostic_tests(self):
        """Run comprehensive diagnostic tests"""
        self.log_with_timestamp("Running diagnostic tests...", "DIAG")

        for ip in self.ip_addresses:
            self.log_with_timestamp(f"Testing device at {ip}", "DIAG")

            # Test system info
            sysinfo = self.test_api_endpoint(ip, '/sysinfo.json')
            if sysinfo and "error" not in sysinfo:
                self.log_with_timestamp(f"  ✅ System info available", "DIAG")
                print(f"     Heap: {sysinfo.get('heap', 'unknown')}")
                print(f"     Version: {sysinfo.get('version', 'unknown')}")
            else:
                self.log_with_timestamp(f"  ❌ System info failed: {sysinfo}", "DIAG")

            # Test WiFi status
            wifi = self.test_api_endpoint(ip, '/api/wifi/status')
            if wifi and "error" not in wifi:
                self.log_with_timestamp(f"  ✅ WiFi API available", "DIAG")
            else:
                self.log_with_timestamp(f"  ❌ WiFi API failed", "DIAG")

            # Test C6 module
            c6_conn = self.test_api_endpoint(ip, '/test_c6_connection')
            if c6_conn and "error" not in c6_conn:
                self.log_with_timestamp(f"  ✅ C6 connection test: {c6_conn}", "DIAG")
            else:
                self.log_with_timestamp(f"  ❌ C6 connection test failed", "DIAG")

if __name__ == "__main__":
    # Configuration
    ip_addresses = ["192.168.26.177"]  # From COM10 boot log
    com_ports = ["COM10", "COM6", "COM13"]  # COM6 is the ESP32-C6 secondary device

    monitor = ESP32DebugMonitor(ip_addresses, com_ports)

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        monitor.run_diagnostic_tests()
    else:
        monitor.start_monitoring()
