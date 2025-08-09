#!/usr/bin/env pwsh
# WiFi Serial Commander - Control ESP32 WiFi via serial commands with auto endpoint detection
param(
    [string]$ComPort = "COM10",
    [int]$BaudRate = 115200,
    [string]$SSID = "Faztrick",
    [string]$Password = "faztrick1234",
    [string]$StaticIP = "192.168.123.200",
    [string]$Gateway = "192.168.123.91",
    [string]$SubnetMask = "255.255.255.0",
    [string]$DNS = "8.8.8.8",
    [switch]$AutoScan,
    [switch]$Interactive,
    [int]$ScanTimeout = 30
)

Write-Host "🎮 ESP32 WiFi Serial Commander" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Write-Host "Port: $ComPort | Baud: $BaudRate" -ForegroundColor Cyan
Write-Host ""

# Serial Command Functions
function Send-SerialCommand {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [string]$Command,
        [int]$WaitTime = 2000
    )

    Write-Host "📤 Sending: $Command" -ForegroundColor Yellow
    $Port.WriteLine($Command)
    Start-Sleep -Milliseconds $WaitTime

    # Read response
    $response = ""
    $timeout = (Get-Date).AddMilliseconds(5000)

    while ((Get-Date) -lt $timeout) {
        try {
            if ($Port.BytesToRead -gt 0) {
                $response += $Port.ReadExisting()
            }
            else {
                Start-Sleep -Milliseconds 100
            }
        }
        catch {
            break
        }
    }

    if ($response) {
        Write-Host "📥 Response:" -ForegroundColor Cyan
        $response.Split("`n") | ForEach-Object {
            if ($_.Trim()) {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
    }

    return $response
}

function Get-WiFiStatus {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Host "`n📊 Getting WiFi Status..." -ForegroundColor Cyan

    $commands = @(
        "wifi.status",
        "wifi.getip",
        "wifi.getssid",
        "wifi.getmac",
        "system.info"
    )

    $status = @{}

    foreach ($cmd in $commands) {
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 1000
        $status[$cmd] = $response
    }

    return $status
}

function Get-AuthorEndpoints {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Host "`n🔗 Getting Author & Endpoint Information..." -ForegroundColor Cyan

    $commands = @(
        "author.get",
        "author.endpoints",
        "author.status",
        "version"
    )

    $info = @{}

    foreach ($cmd in $commands) {
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 2000
        $info[$cmd] = $response
    }

    return $info
}

function Set-WiFiConfig {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [string]$SSID,
        [string]$Password,
        [string]$IP,
        [string]$Gateway,
        [string]$Subnet,
        [string]$DNS
    )

    Write-Host "`n⚙️ Configuring WiFi..." -ForegroundColor Cyan

    $commands = @(
        "wifi.disconnect",
        "wifi.setssid `"$SSID`"",
        "wifi.setpassword `"$Password`"",
        "wifi.setstaticip `"$IP`"",
        "wifi.setgateway `"$Gateway`"",
        "wifi.setsubnet `"$Subnet`"",
        "wifi.setdns `"$DNS`"",
        "wifi.save",
        "wifi.connect"
    )

    foreach ($cmd in $commands) {
        Send-SerialCommand -Port $Port -Command $cmd -WaitTime 2000
        Start-Sleep -Seconds 1
    }
}

function Start-NetworkScan {
    param([string]$BaseNetwork = "192.168")

    Write-Host "`n🔍 Scanning for ESP32 endpoints..." -ForegroundColor Cyan

    $subnets = @(
        "192.168.1",
        "192.168.0",
        "192.168.123",
        "192.168.4",
        "10.0.0",
        "172.16.0"
    )

    $foundDevices = @()

    foreach ($subnet in $subnets) {
        Write-Host "   Scanning $subnet.x..." -ForegroundColor Yellow

        # Quick scan of common IPs
        $commonIPs = @(1, 100, 101, 200, 254)

        foreach ($ip in $commonIPs) {
            $fullIP = "$subnet.$ip"

            try {
                $ping = Test-Connection -ComputerName $fullIP -Count 1 -Quiet -TimeoutSec 1
                if ($ping) {
                    Write-Host "   📡 Found device at $fullIP" -ForegroundColor Green

                    # Test if it's an ESP32
                    try {
                        $response = Invoke-WebRequest -Uri "http://$fullIP" -TimeoutSec 3 -ErrorAction Stop
                        if ($response.Content -match "(ESP32|OpenEPaperLink|wifi|AP)" -or
                            $response.Headers.Server -match "ESP32") {
                            Write-Host "   ✅ ESP32 detected at $fullIP" -ForegroundColor Green
                            $foundDevices += @{
                                IP       = $fullIP
                                Status   = "ESP32 Detected"
                                Response = $response.StatusCode
                            }
                        }
                        else {
                            $foundDevices += @{
                                IP       = $fullIP
                                Status   = "Other Device"
                                Response = $response.StatusCode
                            }
                        }
                    }
                    catch {
                        $foundDevices += @{
                            IP       = $fullIP
                            Status   = "No HTTP Response"
                            Response = "N/A"
                        }
                    }
                }
            }
            catch {
                # Continue scanning
            }
        }
    }

    return $foundDevices
}

function Test-SerialCommands {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Host "`n🧪 Testing Serial Commands..." -ForegroundColor Cyan

    $testCommands = @(
        "help",
        "version",
        "status",
        "wifi.status",
        "system.info",
        "author.get",
        "author.endpoints",
        "author.status"
    )

    foreach ($cmd in $testCommands) {
        Write-Host "`n   Testing: $cmd" -ForegroundColor Yellow
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 3000

        if ($response -and $response.Length -gt 10) {
            Write-Host "   ✅ Command supported" -ForegroundColor Green
        }
        else {
            Write-Host "   ❌ Command not supported or no response" -ForegroundColor Red
        }
    }
}

# Main execution
try {
    # Auto scan for devices if requested
    if ($AutoScan) {
        $devices = Start-NetworkScan

        if ($devices.Count -gt 0) {
            Write-Host "`n📋 Found devices:" -ForegroundColor Green
            $devices | ForEach-Object {
                Write-Host "   $($_.IP) - $($_.Status)" -ForegroundColor White
            }

            $esp32Devices = $devices | Where-Object { $_.Status -eq "ESP32 Detected" }
            if ($esp32Devices.Count -gt 0) {
                Write-Host "`n✅ ESP32 devices found - you can access them via HTTP" -ForegroundColor Green
                $esp32Devices | ForEach-Object {
                    Write-Host "   🌐 http://$($_.IP)" -ForegroundColor Cyan
                }
            }
        }
        else {
            Write-Host "`n⚠️ No devices found on common networks" -ForegroundColor Yellow
        }
    }

    # Setup serial connection
    Add-Type -AssemblyName System.IO.Ports

    $serialPort = New-Object System.IO.Ports.SerialPort
    $serialPort.PortName = $ComPort
    $serialPort.BaudRate = $BaudRate
    $serialPort.DataBits = 8
    $serialPort.Parity = [System.IO.Ports.Parity]::None
    $serialPort.StopBits = [System.IO.Ports.StopBits]::One
    $serialPort.ReadTimeout = 1000
    $serialPort.WriteTimeout = 1000

    Write-Host "🔌 Connecting to $ComPort..." -ForegroundColor Cyan
    $serialPort.Open()
    Write-Host "✅ Connected to ESP32 serial port" -ForegroundColor Green

    # Wait for startup messages
    Start-Sleep -Seconds 2

    # Clear any startup messages
    try {
        $serialPort.ReadExisting() | Out-Null
    }
    catch { }

    if ($Interactive) {
        Write-Host "`n🎮 Interactive Mode - Enter commands (type 'exit' to quit):" -ForegroundColor Green
        Write-Host "Available commands:" -ForegroundColor Yellow
        Write-Host "   WiFi: wifi.status, wifi.scan, wifi.connect, wifi.disconnect" -ForegroundColor Gray
        Write-Host "   WiFi: wifi.getip, wifi.getssid, wifi.getmac" -ForegroundColor Gray
        Write-Host "   WiFi: wifi.setssid, wifi.setpassword, wifi.save" -ForegroundColor Gray
        Write-Host "   Author: author.get, author.set, author.endpoints, author.status" -ForegroundColor Gray
        Write-Host "   System: system.info, system.reboot, help, version, status" -ForegroundColor Gray
        Write-Host ""

        while ($true) {
            $userCommand = Read-Host "ESP32> "

            if ($userCommand -eq "exit" -or $userCommand -eq "quit") {
                break
            }

            if ($userCommand.Trim()) {
                Send-SerialCommand -Port $serialPort -Command $userCommand -WaitTime 3000
            }
        }
    }
    else {
        # Test basic commands
        Test-SerialCommands -Port $serialPort

        # Get current WiFi status
        $status = Get-WiFiStatus -Port $serialPort

        # Get author and endpoint information
        $authorInfo = Get-AuthorEndpoints -Port $serialPort

        # Configure WiFi if parameters provided
        if ($SSID -and $Password) {
            Set-WiFiConfig -Port $serialPort -SSID $SSID -Password $Password -IP $StaticIP -Gateway $Gateway -Subnet $SubnetMask -DNS $DNS

            Write-Host "`n⏳ Waiting for WiFi connection..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10

            # Check status after configuration
            $newStatus = Get-WiFiStatus -Port $serialPort

            # Test new connection
            if ($StaticIP) {
                Write-Host "`n🏓 Testing HTTP connection to $StaticIP..." -ForegroundColor Cyan
                try {
                    $httpTest = Invoke-WebRequest -Uri "http://$StaticIP" -TimeoutSec 10
                    Write-Host "✅ HTTP connection successful!" -ForegroundColor Green
                    Write-Host "🌐 Access ESP32 at: http://$StaticIP" -ForegroundColor Cyan
                }
                catch {
                    Write-Host "❌ HTTP connection failed: $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
    }

    Write-Host "`n📊 Final Status Check..." -ForegroundColor Cyan
    $finalStatus = Get-WiFiStatus -Port $serialPort

}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($serialPort -and $serialPort.IsOpen) {
        Write-Host "`n🔌 Closing serial connection..." -ForegroundColor Yellow
        $serialPort.Close()
        Write-Host "✅ Serial connection closed" -ForegroundColor Green
    }
}

Write-Host "`n🎯 WiFi Serial Commander Complete!" -ForegroundColor Green
Write-Host "Usage examples:" -ForegroundColor Cyan
Write-Host "   .\wifi_serial_commander.ps1 -AutoScan" -ForegroundColor Gray
Write-Host "   .\wifi_serial_commander.ps1 -Interactive" -ForegroundColor Gray
Write-Host "   .\wifi_serial_commander.ps1 -SSID 'MyWiFi' -Password 'mypass'" -ForegroundColor Gray
Write-Host ""
Write-Host "New Serial Commands Added:" -ForegroundColor Yellow
Write-Host "   WiFi Commands: wifi.status, wifi.getip, wifi.setssid, etc." -ForegroundColor Gray
Write-Host "   Author Commands: author.get, author.set, author.endpoints" -ForegroundColor Gray
Write-Host "   System Commands: system.info, system.reboot, version, help" -ForegroundColor Gray
