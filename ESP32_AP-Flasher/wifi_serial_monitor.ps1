#!/usr/bin/env pwsh
# WiFi Serial Monitor - Monitor ESP32 WiFi connection status via serial
param(
    [string]$ComPort = "COM10",
    [int]$BaudRate = 115200,
    [int]$Duration = 60
)

Write-Host "📺 ESP32 WiFi Serial Monitor" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green
Write-Host "Port: $ComPort | Baud: $BaudRate | Duration: ${Duration}s" -ForegroundColor Cyan
Write-Host "Monitoring WiFi connection status..." -ForegroundColor Yellow
Write-Host ""

# Check if PlatformIO is available
$pioPath = Get-Command pio -ErrorAction SilentlyContinue

if ($pioPath) {
    Write-Host "Using PlatformIO device monitor..." -ForegroundColor Green

    # Start monitoring with timeout
    $job = Start-Job -ScriptBlock {
        param($port, $baud, $duration)

        $timeout = (Get-Date).AddSeconds($duration)
        $process = Start-Process -FilePath "pio" -ArgumentList "device", "monitor", "--port", $port, "--baud", $baud -PassThru -NoNewWindow

        while ((Get-Date) -lt $timeout -and !$process.HasExited) {
            Start-Sleep -Seconds 1
        }

        if (!$process.HasExited) {
            $process.Kill()
        }
    } -ArgumentList $ComPort, $BaudRate, $Duration

    # Monitor for specific WiFi-related messages
    $startTime = Get-Date
    $wifiMessages = @()

    Write-Host "🔍 Looking for WiFi-related messages..." -ForegroundColor Cyan

    # Run pio monitor and capture output
    try {
        $pinfo = New-Object System.Diagnostics.ProcessStartInfo
        $pinfo.FileName = "pio"
        $pinfo.Arguments = "device monitor --port $ComPort --baud $BaudRate"
        $pinfo.UseShellExecute = $false
        $pinfo.RedirectStandardOutput = $true
        $pinfo.RedirectStandardError = $true
        $p = New-Object System.Diagnostics.Process
        $p.StartInfo = $pinfo
        $p.Start() | Out-Null

        $timeout = (Get-Date).AddSeconds($Duration)

        while ((Get-Date) -lt $timeout -and !$p.HasExited) {
            $line = $p.StandardOutput.ReadLine()
            if ($line) {
                $timestamp = Get-Date -Format "HH:mm:ss"

                # Check for WiFi-related messages
                $isWifiMessage = $false
                $messageType = "INFO"

                if ($line -match "(wifi|WiFi|WIFI)") {
                    $isWifiMessage = $true
                    $color = "Cyan"
                }
                elseif ($line -match "(connect|Connect|CONNECT)") {
                    $isWifiMessage = $true
                    $messageType = "CONNECT"
                    $color = "Green"
                }
                elseif ($line -match "(disconnect|Disconnect|DISCONNECT|failed|Failed|FAILED|error|Error|ERROR)") {
                    $isWifiMessage = $true
                    $messageType = "ERROR"
                    $color = "Red"
                }
                elseif ($line -match "(IP|ip|dhcp|DHCP|192\.168|10\.|172\.)") {
                    $isWifiMessage = $true
                    $messageType = "NETWORK"
                    $color = "Yellow"
                }
                elseif ($line -match "(AP|ap|Access Point|AccessPoint)") {
                    $isWifiMessage = $true
                    $messageType = "AP"
                    $color = "Magenta"
                }
                else {
                    $color = "Gray"
                }

                if ($isWifiMessage) {
                    Write-Host "[$timestamp] [$messageType] $line" -ForegroundColor $color
                    $wifiMessages += @{
                        Time    = $timestamp
                        Type    = $messageType
                        Message = $line
                    }
                }
                else {
                    Write-Host "[$timestamp] $line" -ForegroundColor $color
                }
            }
            Start-Sleep -Milliseconds 100
        }

        if (!$p.HasExited) {
            $p.Kill()
        }
    }
    catch {
        Write-Host "Error during monitoring: $($_.Exception.Message)" -ForegroundColor Red
    }

}
else {
    Write-Host "⚠️  PlatformIO not found. Using basic .NET serial monitor..." -ForegroundColor Yellow

    try {
        Add-Type -AssemblyName System.IO.Ports

        $serialPort = New-Object System.IO.Ports.SerialPort
        $serialPort.PortName = $ComPort
        $serialPort.BaudRate = $BaudRate
        $serialPort.DataBits = 8
        $serialPort.Parity = [System.IO.Ports.Parity]::None
        $serialPort.StopBits = [System.IO.Ports.StopBits]::One
        $serialPort.ReadTimeout = 1000

        $serialPort.Open()
        Write-Host "✅ Connected to $ComPort at $BaudRate baud" -ForegroundColor Green

        $startTime = Get-Date
        $timeout = $startTime.AddSeconds($Duration)
        $wifiMessages = @()

        while ((Get-Date) -lt $timeout) {
            try {
                $line = $serialPort.ReadLine()
                if ($line) {
                    $timestamp = Get-Date -Format "HH:mm:ss"

                    # Check for WiFi-related messages
                    $isWifiMessage = $false
                    $messageType = "INFO"

                    if ($line -match "(wifi|WiFi|WIFI)") {
                        $isWifiMessage = $true
                        $color = "Cyan"
                    }
                    elseif ($line -match "(connect|Connect|CONNECT)") {
                        $isWifiMessage = $true
                        $messageType = "CONNECT"
                        $color = "Green"
                    }
                    elseif ($line -match "(disconnect|Disconnect|DISCONNECT|failed|Failed|FAILED|error|Error|ERROR)") {
                        $isWifiMessage = $true
                        $messageType = "ERROR"
                        $color = "Red"
                    }
                    elseif ($line -match "(IP|ip|dhcp|DHCP|192\.168|10\.|172\.)") {
                        $isWifiMessage = $true
                        $messageType = "NETWORK"
                        $color = "Yellow"
                    }
                    elseif ($line -match "(AP|ap|Access Point|AccessPoint)") {
                        $isWifiMessage = $true
                        $messageType = "AP"
                        $color = "Magenta"
                    }
                    else {
                        $color = "Gray"
                    }

                    if ($isWifiMessage) {
                        Write-Host "[$timestamp] [$messageType] $line" -ForegroundColor $color
                        $wifiMessages += @{
                            Time    = $timestamp
                            Type    = $messageType
                            Message = $line
                        }
                    }
                    else {
                        Write-Host "[$timestamp] $line" -ForegroundColor $color
                    }
                }
            }
            catch {
                Start-Sleep -Milliseconds 100
            }
        }

        $serialPort.Close()
    }
    catch {
        Write-Host "❌ Error with serial monitoring: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n📊 Monitoring Summary" -ForegroundColor Green
Write-Host "=====================" -ForegroundColor Green

if ($wifiMessages.Count -gt 0) {
    Write-Host "Found $($wifiMessages.Count) WiFi-related messages:" -ForegroundColor Cyan

    $connectMessages = $wifiMessages | Where-Object { $_.Type -eq "CONNECT" }
    $errorMessages = $wifiMessages | Where-Object { $_.Type -eq "ERROR" }
    $networkMessages = $wifiMessages | Where-Object { $_.Type -eq "NETWORK" }

    if ($connectMessages.Count -gt 0) {
        Write-Host "✅ Connection Messages: $($connectMessages.Count)" -ForegroundColor Green
    }

    if ($networkMessages.Count -gt 0) {
        Write-Host "🌐 Network Messages: $($networkMessages.Count)" -ForegroundColor Yellow
    }

    if ($errorMessages.Count -gt 0) {
        Write-Host "❌ Error Messages: $($errorMessages.Count)" -ForegroundColor Red
    }

    Write-Host "`nLast few WiFi messages:" -ForegroundColor White
    $wifiMessages | Select-Object -Last 5 | ForEach-Object {
        Write-Host "  [$($_.Time)] [$($_.Type)] $($_.Message)" -ForegroundColor Gray
    }
}
else {
    Write-Host "⚠️  No WiFi-related messages detected during monitoring period" -ForegroundColor Yellow
    Write-Host "💡 This could mean:" -ForegroundColor Blue
    Write-Host "   - ESP32 is already connected and stable" -ForegroundColor White
    Write-Host "   - Wrong COM port selected" -ForegroundColor White
    Write-Host "   - ESP32 is not outputting debug messages" -ForegroundColor White
}

Write-Host "`nMonitoring completed." -ForegroundColor Green
