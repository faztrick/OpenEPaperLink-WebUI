# Complete WiFi Setup and Test Script for ESP32 OpenEPaperLink
# This script configures WiFi with proper 192.168.x.x addressing and tests all functionality

param(
    [string]$SSID = "Faztrick",
    [string]$Password = "faztrick1234",
    [string]$StaticIP = "192.168.29.200",
    [string]$Gateway = "192.168.29.91",
    [string]$SubnetMask = "255.255.255.0",
    [string]$DNS = "8.8.8.8",
    [string]$ESP32_AP_IP = "192.168.29.200",
    [string]$ComPort = "COM10",
    [switch]$SerialMonitor
)

Write-Host "🚀 ESP32 OpenEPaperLink Complete WiFi Setup" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Serial Monitor Function
function Start-SerialMonitor {
    param([string]$Port, [int]$BaudRate = 115200)

    if (-not $Port) {
        Write-Host "   ⚠️  No COM port specified for serial monitoring" -ForegroundColor Yellow
        return $null
    }

    Write-Host "   📺 Starting serial monitor on $Port..." -ForegroundColor Cyan

    try {
        # Check if PlatformIO is available
        $pioPath = Get-Command pio -ErrorAction SilentlyContinue
        if ($pioPath) {
            $serialJob = Start-Job -ScriptBlock {
                param($port, $baud)
                pio device monitor --port $port --baud $baud
            } -ArgumentList $Port, $BaudRate

            Write-Host "   ✅ Serial monitor started (Job ID: $($serialJob.Id))" -ForegroundColor Green
            return $serialJob
        }
        else {
            Write-Host "   ⚠️  PlatformIO not found, trying alternative serial monitor..." -ForegroundColor Yellow

            # Try alternative serial monitor
            $serialJob = Start-Job -ScriptBlock {
                param($port, $baud)
                # Simple serial monitor using .NET SerialPort
                Add-Type -AssemblyName System.IO.Ports
                $serialPort = New-Object System.IO.Ports.SerialPort
                $serialPort.PortName = $port
                $serialPort.BaudRate = $baud
                $serialPort.DataBits = 8
                $serialPort.Parity = [System.IO.Ports.Parity]::None
                $serialPort.StopBits = [System.IO.Ports.StopBits]::One
                $serialPort.ReadTimeout = 1000

                try {
                    $serialPort.Open()
                    Write-Host "Connected to $port at $baud baud"

                    while ($serialPort.IsOpen) {
                        try {
                            $line = $serialPort.ReadLine()
                            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $line"
                        }
                        catch {
                            Start-Sleep -Milliseconds 100
                        }
                    }
                }
                catch {
                    Write-Host "Error opening serial port: $_"
                }
                finally {
                    if ($serialPort.IsOpen) {
                        $serialPort.Close()
                    }
                }
            } -ArgumentList $Port, $BaudRate

            return $serialJob
        }
    }
    catch {
        Write-Host "   ❌ Failed to start serial monitor: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Stop-SerialMonitor {
    param($SerialJob)

    if ($SerialJob) {
        Write-Host "   🛑 Stopping serial monitor..." -ForegroundColor Yellow
        $SerialJob | Stop-Job
        $SerialJob | Remove-Job -Force
        Write-Host "   ✅ Serial monitor stopped" -ForegroundColor Green
    }
}

function Get-SerialLogs {
    param($SerialJob)

    if ($SerialJob) {
        try {
            $logs = $SerialJob | Receive-Job
            if ($logs) {
                Write-Host "   📋 Recent serial output:" -ForegroundColor Cyan
                $logs | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
            }
        }
        catch {
            Write-Host "   ⚠️  Could not retrieve serial logs" -ForegroundColor Yellow
        }
    }
}

function Find-ESP32Devices {
    param([string[]]$AdditionalIPs = @())

    Write-Host "   🔍 Auto-scanning for ESP32 devices..." -ForegroundColor Cyan

    # Common ESP32 network ranges and IPs
    $subnets = @(
        "192.168.29",
        "192.168.0",
        "192.168.29",
        "192.168.4",    # Common AP mode
        "10.0.0",
        "172.16.0"
    )

    $commonIPs = @(1, 100, 101, 200, 201, 254)
    $foundDevices = @()

    # Add any additional IPs to test
    if ($AdditionalIPs) {
        foreach ($ip in $AdditionalIPs) {
            Write-Host "      Testing provided IP: $ip..." -ForegroundColor Yellow
            if (Test-ESP32Device -IP $ip) {
                $foundDevices += $ip
                Write-Host "      ✅ ESP32 found at $ip" -ForegroundColor Green
            }
        }
    }

    # Scan common networks
    foreach ($subnet in $subnets) {
        Write-Host "      Scanning $subnet.x..." -ForegroundColor Yellow

        foreach ($ip in $commonIPs) {
            $fullIP = "$subnet.$ip"

            # Skip if already tested
            if ($foundDevices -contains $fullIP -or $AdditionalIPs -contains $fullIP) {
                continue
            }

            if (Test-ESP32Device -IP $fullIP) {
                $foundDevices += $fullIP
                Write-Host "      ✅ ESP32 found at $fullIP" -ForegroundColor Green
            }
        }
    }

    return $foundDevices
}

function Test-ESP32Device {
    param([string]$IP)

    try {
        # Quick ping test first
        $ping = Test-Connection -ComputerName $IP -Count 1 -Quiet -TimeoutSec 2
        if (-not $ping) {
            return $false
        }

        # Test HTTP response
        $response = Invoke-WebRequest -Uri "http://$IP" -TimeoutSec 5 -ErrorAction Stop

        # Check if response indicates ESP32/OpenEPaperLink
        $content = $response.Content.ToLower()
        $headers = $response.Headers

        $isESP32 = $false

        # Check content for ESP32 indicators
        if ($content -match "(esp32|openepaperlink|wifi.*config|access.*point)" -or
            $headers.Server -match "esp32" -or
            $headers.Server -match "arduino" -or
            $content -match "tag.*management" -or
            $content -match "wifi.*setup") {
            $isESP32 = $true
        }

        # Also check common ESP32 endpoints
        $esp32Endpoints = @("/sysinfo", "/get_wifi_config", "/taglist", "/api")
        foreach ($endpoint in $esp32Endpoints) {
            try {
                $endpointResponse = Invoke-WebRequest -Uri "http://$IP$endpoint" -TimeoutSec 3 -ErrorAction Stop
                if ($endpointResponse.StatusCode -eq 200) {
                    $isESP32 = $true
                    break
                }
            }
            catch {
                # Continue testing
            }
        }

        return $isESP32
    }
    catch {
        return $false
    }
}# Start serial monitor if requested
$serialJob = $null
if ($SerialMonitor -and $ComPort) {
    $serialJob = Start-SerialMonitor -Port $ComPort
}

# Phase 1: Try to connect to ESP32 (either in AP mode or already configured)
Write-Host "`n📡 Phase 1: Locating ESP32 device..." -ForegroundColor Cyan

$possible_ips = @($ESP32_AP_IP, $StaticIP, "192.168.1.100", "192.168.1.101", "192.168.0.100")
$esp32_ip = $null

foreach ($ip in $possible_ips) {
    Write-Host "   Testing $ip..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://$ip" -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "   ✅ Found ESP32 at $ip" -ForegroundColor Green
            $esp32_ip = $ip
            break
        }
    }
    catch {
        # Continue testing
    }
}

if (-not $esp32_ip) {
    Write-Host "   ❌ Could not locate ESP32" -ForegroundColor Red
    Write-Host "   💡 Please ensure:" -ForegroundColor Yellow
    Write-Host "      - ESP32 is powered on" -ForegroundColor White
    Write-Host "      - You're connected to ESP32's WiFi AP (OpenEPaperLink)" -ForegroundColor White
    Write-Host "      - Or ESP32 is already on your network" -ForegroundColor White
    exit 1
}

# Phase 2: Test current configuration
Write-Host "`n🔍 Phase 2: Testing current configuration..." -ForegroundColor Cyan

try {
    $current_config = Invoke-WebRequest -Uri "http://$esp32_ip/get_wifi_config" -Method GET -TimeoutSec 10
    Write-Host "   ✅ Successfully retrieved current WiFi config" -ForegroundColor Green

    $config_data = $current_config.Content | ConvertFrom-Json
    Write-Host "   Current SSID: $($config_data.ssid)" -ForegroundColor White
    Write-Host "   Current IP: $($config_data.ip)" -ForegroundColor White
}
catch {
    Write-Host "   ⚠️  Could not retrieve current config: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Phase 3: Configure WiFi with new settings
Write-Host "`n⚙️  Phase 3: Configuring WiFi..." -ForegroundColor Cyan

$wifi_config = @{
    ssid = $SSID
    pw   = $Password
    ip   = $StaticIP
    mask = $SubnetMask
    gw   = $Gateway
    dns  = $DNS
} | ConvertTo-Json

Write-Host "   📤 Sending new WiFi configuration:" -ForegroundColor White
Write-Host "      SSID: $SSID" -ForegroundColor Gray
Write-Host "      Static IP: $StaticIP" -ForegroundColor Gray
Write-Host "      Gateway: $Gateway" -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri "http://$esp32_ip/save_wifi_config" -Method POST -Body $wifi_config -ContentType "application/json" -TimeoutSec 10

    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ WiFi configuration saved successfully!" -ForegroundColor Green
        Write-Host "   🔄 ESP32 will now reboot and connect to '$SSID'" -ForegroundColor Green

        # Start serial monitor to watch the WiFi connection process
        if ($ComPort -and -not $serialJob) {
            Write-Host "   📺 Starting serial monitor to watch WiFi connection..." -ForegroundColor Cyan
            $serialJob = Start-SerialMonitor -Port $ComPort
        }
    }
    else {
        Write-Host "   ❌ Failed to save WiFi configuration: $($response.StatusCode)" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "   ❌ Error sending WiFi configuration: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Phase 4: Wait for reboot and test new connection
Write-Host "`n⏳ Phase 4: Waiting for ESP32 to reboot and connect..." -ForegroundColor Cyan

Write-Host "   Waiting 15 seconds for reboot..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Check serial logs during reboot if monitoring
if ($serialJob) {
    Write-Host "   📋 Checking serial output during reboot..." -ForegroundColor Cyan
    Get-SerialLogs -SerialJob $serialJob
}

Write-Host "`n🏓 Phase 5: Testing new connection..." -ForegroundColor Cyan

$connection_success = $false
for ($attempt = 1; $attempt -le 10; $attempt++) {
    Write-Host "   Attempt $attempt/10: Testing $StaticIP..." -ForegroundColor Yellow

    # Check serial logs for WiFi connection status
    if ($serialJob -and $attempt -eq 1) {
        Write-Host "   📋 Checking serial output for WiFi status..." -ForegroundColor Cyan
        Get-SerialLogs -SerialJob $serialJob
    }

    try {
        $test_response = Invoke-WebRequest -Uri "http://$StaticIP/" -Method GET -TimeoutSec 8
        if ($test_response.StatusCode -eq 200) {
            Write-Host "   ✅ ESP32 is now accessible at $StaticIP!" -ForegroundColor Green
            $connection_success = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 5
    }
}

if (-not $connection_success) {
    Write-Host "   ❌ Could not connect to ESP32 at new IP address" -ForegroundColor Red
    Write-Host "   💡 Check your router's DHCP table or try scanning the network" -ForegroundColor Yellow
    exit 1
}

# Phase 6: Test all web pages and functionality
Write-Host "`n🧪 Phase 6: Testing web interface functionality..." -ForegroundColor Cyan

$test_urls = @(
    @{path = "/"; name = "Main Page" },
    @{path = "/sysinfo"; name = "System Info" },
    @{path = "/get_wifi_config"; name = "WiFi Config API" },
    @{path = "/taglist"; name = "Tag List API" },
    @{path = "/www/index.html"; name = "Web UI" }
)

$failed_tests = @()

foreach ($test in $test_urls) {
    Write-Host "   Testing $($test.name)..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://$StaticIP$($test.path)" -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-Host "   ✅ $($test.name) - OK" -ForegroundColor Green
        }
        else {
            Write-Host "   ❌ $($test.name) - Status: $($response.StatusCode)" -ForegroundColor Red
            $failed_tests += $test.name
        }
    }
    catch {
        Write-Host "   ❌ $($test.name) - Error: $($_.Exception.Message)" -ForegroundColor Red
        $failed_tests += $test.name
    }
}

# Phase 7: Upload fixed web files if needed
if ($failed_tests.Count -gt 0) {
    Write-Host "`n🔧 Phase 7: Some tests failed. Uploading fixed web files..." -ForegroundColor Cyan

    # Check if upload script exists
    if (Test-Path ".\upload_www_files.ps1") {
        Write-Host "   📤 Running web file upload..." -ForegroundColor Yellow
        & ".\upload_www_files.ps1" -IPAddress $StaticIP
    }
    else {
        Write-Host "   ⚠️  upload_www_files.ps1 not found. Trying manual upload..." -ForegroundColor Yellow
        if (Test-Path ".\manual_upload.ps1") {
            & ".\manual_upload.ps1"
        }
    }

    # Re-test after upload
    Write-Host "`n🔄 Re-testing after file upload..." -ForegroundColor Cyan
    foreach ($failed_test in $failed_tests) {
        $test = $test_urls | Where-Object { $_.name -eq $failed_test }
        Write-Host "   Re-testing $($test.name)..." -ForegroundColor Yellow
        try {
            $response = Invoke-WebRequest -Uri "http://$StaticIP$($test.path)" -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Host "   ✅ $($test.name) - Now working!" -ForegroundColor Green
            }
            else {
                Write-Host "   ❌ $($test.name) - Still failing" -ForegroundColor Red
            }
        }
        catch {
            Write-Host "   ❌ $($test.name) - Still failing" -ForegroundColor Red
        }
    }
}

# Phase 8: Cleanup unwanted files
Write-Host "`n🧹 Phase 8: Cleaning up unwanted files..." -ForegroundColor Cyan

$cleanup_patterns = @(
    "*.tmp",
    "*.log",
    "*.bak",
    "*cache*",
    "temp_*",
    "debug_*",
    "test_*"
)

$cleanup_count = 0
foreach ($pattern in $cleanup_patterns) {
    $files = Get-ChildItem -Path "." -Filter $pattern -Recurse -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        try {
            Remove-Item $file.FullName -Force
            Write-Host "   🗑️  Removed: $($file.Name)" -ForegroundColor Gray
            $cleanup_count++
        }
        catch {
            Write-Host "   ⚠️  Could not remove: $($file.Name)" -ForegroundColor Yellow
        }
    }
}

Write-Host "   ✅ Cleaned up $cleanup_count files" -ForegroundColor Green

# Final Summary
Write-Host "`n🎉 Setup Complete!" -ForegroundColor Green
Write-Host "=================" -ForegroundColor Green
Write-Host "✅ WiFi SSID: $SSID" -ForegroundColor White
Write-Host "✅ ESP32 IP: $StaticIP" -ForegroundColor White
Write-Host "✅ Gateway: $Gateway" -ForegroundColor White
Write-Host "🌐 Web Interface: http://$StaticIP" -ForegroundColor Cyan

if ($failed_tests.Count -eq 0) {
    Write-Host "✅ All functionality tests passed!" -ForegroundColor Green
}
else {
    Write-Host "⚠️  Some tests still failing: $($failed_tests -join ', ')" -ForegroundColor Yellow
    Write-Host "💡 Check the ESP32 logs or try manual debugging" -ForegroundColor Blue
}

Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Open http://$StaticIP in your browser" -ForegroundColor White
Write-Host "   2. Check for any JavaScript errors in browser console" -ForegroundColor White
Write-Host "   3. Test tag management functionality" -ForegroundColor White
Write-Host "   4. Upload any additional content as needed" -ForegroundColor White

# Stop serial monitor if it was started
if ($serialJob) {
    Write-Host "`n📺 Final serial output check..." -ForegroundColor Cyan
    Get-SerialLogs -SerialJob $serialJob
    Stop-SerialMonitor -SerialJob $serialJob
}
