#!/usr/bin/env python3
"""
Simple HTTP server with API endpoints for OpenEPL ESP32
Simulates the ESP32 device API responses for development/testing
"""

import json
import time
import random
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import os

class OpenEPLAPIHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.api_data = {
            'ap_config': {
                "alias": "OpenEPL ESP32 AP",
                "channel": 6,
                "power": 20,
                "led": True,
                "maxsleep": 10000,
                "stopsleep": 0,
                "preview": 1,
                "language": "en",
                "timezone": "UTC",
                "wifiMode": "AP",
                "apSSID": "OpenEPL-AP",
                "apPassword": "",
                "apChannel": 6,
                "apPower": 20,
                "apHidden": False,
                "apstate": 1,  # online
                "runstate": 2, # running
                "version": "3.0.0",
                "wifiConnected": True,
                "freeHeap": random.randint(200000, 300000),
                "cpuLoad": random.randint(10, 30),
                "temperature": round(random.uniform(20, 50), 1),
                "uptime": int(time.time()) - 12345
            },
            'tags': [
                {
                    "mac": "001122334455",
                    "alias": "Demo Tag 1",
                    "tagtype": 6,
                    "lastseen": int(time.time()) - random.randint(30, 300),
                    "nextupdate": int(time.time()) + random.randint(100, 600),
                    "pending": False,
                    "expectedNextCheckin": int(time.time()) + random.randint(200, 800),
                    "capabilities": 0,
                    "modecfg": 0,
                    "batteryMv": random.randint(2500, 3200),
                    "temperature": round(random.uniform(18, 30), 1),
                    "rssi": random.randint(-80, -40),
                    "contentMode": 0,
                    "hwType": 22,
                    "wakeupReason": 0,
                    "lastfullupdate": int(time.time()) - random.randint(300, 1800)
                },
                {
                    "mac": "112233445566", 
                    "alias": "Demo Tag 2",
                    "tagtype": 2,
                    "lastseen": int(time.time()) - random.randint(30, 300),
                    "nextupdate": int(time.time()) + random.randint(100, 600),
                    "pending": False,
                    "expectedNextCheckin": int(time.time()) + random.randint(200, 800),
                    "capabilities": 0,
                    "modecfg": 0,
                    "batteryMv": random.randint(2500, 3200),
                    "temperature": round(random.uniform(18, 30), 1),
                    "rssi": random.randint(-80, -40),
                    "contentMode": 0,
                    "hwType": 22,
                    "wakeupReason": 0,
                    "lastfullupdate": int(time.time()) - random.randint(300, 1800)
                },
                {
                    "mac": "223344556677",
                    "alias": "Demo Tag 3", 
                    "tagtype": 4,
                    "lastseen": int(time.time()) - random.randint(30, 300),
                    "nextupdate": int(time.time()) + random.randint(100, 600),
                    "pending": False,
                    "expectedNextCheckin": int(time.time()) + random.randint(200, 800),
                    "capabilities": 0,
                    "modecfg": 0,
                    "batteryMv": random.randint(2500, 3200),
                    "temperature": round(random.uniform(18, 30), 1),
                    "rssi": random.randint(-80, -40),
                    "contentMode": 0,
                    "hwType": 22,
                    "wakeupReason": 0,
                    "lastfullupdate": int(time.time()) - random.randint(300, 1800)
                }
            ]
        }
        super().__init__(*args, **kwargs)

    def do_GET(self):
        """Handle GET requests"""
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query_params = parse_qs(parsed_url.query)
        
        # Handle API endpoints
        if path == '/get_ap_config':
            self.send_json_response(self.api_data['ap_config'])
            
        elif path == '/get_db':
            pos = int(query_params.get('pos', [0])[0])
            limit = int(query_params.get('limit', [50])[0])
            
            # Simulate pagination
            start_idx = pos
            end_idx = min(start_idx + limit, len(self.api_data['tags']))
            page_tags = self.api_data['tags'][start_idx:end_idx]
            
            response = {
                "tags": page_tags,
                "continu": end_idx if end_idx < len(self.api_data['tags']) else 0,
                "totalTags": len(self.api_data['tags'])
            }
            self.send_json_response(response)
            
        elif path == '/gettags':
            pos = int(query_params.get('pos', [0])[0])
            limit = int(query_params.get('limit', [50])[0])
            
            start_idx = pos
            end_idx = min(start_idx + limit, len(self.api_data['tags']))
            page_tags = self.api_data['tags'][start_idx:end_idx]
            
            response = {
                "tags": page_tags,
                "total": len(self.api_data['tags']),
                "pos": pos,
                "limit": limit
            }
            self.send_json_response(response)
            
        elif path == '/sysinfo.json':
            sysinfo = {
                "version": self.api_data['ap_config']['version'],
                "build": "dev",
                "uptime": int(time.time()) - 12345,
                "freeHeap": self.api_data['ap_config']['freeHeap'],
                "totalHeap": 327680,
                "minFreeHeap": 200000,
                "maxAllocHeap": 100000,
                "chipModel": "ESP32",
                "chipRevision": 3,
                "cpuFreq": 240,
                "flashSize": 4194304,
                "flashSpeed": 40000000,
                "temperature": self.api_data['ap_config']['temperature'],
                "wifiConnected": self.api_data['ap_config']['wifiConnected'],
                "wifiSSID": self.api_data['ap_config']['apSSID'],
                "wifiRSSI": -45,
                "clientsConnected": random.randint(0, 5),
                "lastResetReason": "Power on reset",
                "runningTasks": 8,
                "apState": self.api_data['ap_config']['apstate'],
                "runState": self.api_data['ap_config']['runstate'],
                "contentGeneration": True,
                "timestamp": int(time.time())
            }
            self.send_json_response(sysinfo)
            
        elif path == '/cfg.json':
            self.send_json_response(self.api_data['ap_config'])
            
        elif path == '/content_cards.json':
            cards = {
                "cards": [
                    {
                        "id": "default_weather",
                        "name": "Weather Card",
                        "type": "weather",
                        "enabled": True,
                        "config": {
                            "location": "New York",
                            "units": "metric"
                        }
                    },
                    {
                        "id": "default_clock",
                        "name": "Clock Card", 
                        "type": "clock",
                        "enabled": True,
                        "config": {
                            "format": "24h",
                            "timezone": "UTC"
                        }
                    },
                    {
                        "id": "default_text",
                        "name": "Text Card",
                        "type": "text", 
                        "enabled": True,
                        "config": {
                            "message": "Welcome to OpenEPL",
                            "font": "medium"
                        }
                    }
                ],
                "templates": [
                    {
                        "id": "template_1",
                        "name": "Basic Template",
                        "description": "Simple text display",
                        "width": 296,
                        "height": 128,
                        "elements": []
                    }
                ]
            }
            self.send_json_response(cards)
            
        else:
            # Serve static files
            self.serve_static_file(path)

    def do_POST(self):
        """Handle POST requests"""
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        
        if path == '/system_cmd':
            # Handle system commands
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            
            # Simple response for system commands
            response = {"status": "ok", "message": "Command executed"}
            self.send_json_response(response)
            
        elif path == '/tag_cmd':
            # Handle tag commands
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            
            response = {"status": "ok", "message": "Tag command sent"}
            self.send_json_response(response)
            
        else:
            self.send_error(404, "API endpoint not found")

    def send_json_response(self, data):
        """Send JSON response with proper headers"""
        json_data = json.dumps(data, indent=2)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', len(json_data))
        self.end_headers()
        
        self.wfile.write(json_data.encode('utf-8'))

    def serve_static_file(self, path):
        """Serve static files (HTML, CSS, JS)"""
        if path == '/':
            path = '/index.html'
            
        file_path = '.' + path
        
        if os.path.exists(file_path) and os.path.isfile(file_path):
            # Determine content type
            content_type = 'text/html'
            if path.endswith('.css'):
                content_type = 'text/css'
            elif path.endswith('.js'):
                content_type = 'application/javascript'
            elif path.endswith('.json'):
                content_type = 'application/json'
            elif path.endswith('.ico'):
                content_type = 'image/x-icon'
            
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.end_headers()
            
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, f"File not found: {path}")

    def log_message(self, format, *args):
        """Override to customize logging"""
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {format % args}")

def run_server(port=8080):
    """Start the API server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, OpenEPLAPIHandler)
    
    print(f"OpenEPL API Server starting on port {port}")
    print(f"Dashboard: http://localhost:{port}/dashboard.html")
    print(f"Tags: http://localhost:{port}/tags.html")
    print(f"Settings: http://localhost:{port}/settings.html")
    print(f"API Config: http://localhost:{port}/get_ap_config")
    print("Press Ctrl+C to stop the server")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
