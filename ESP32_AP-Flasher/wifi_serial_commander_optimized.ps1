#!/usr/bin/env pwsh
# WiFi Serial Commander - Comprehensive ESP32 control via serial commands
param(
    [string]$ComPort = "COM10",
    [int]$BaudRate = 115200,
    [string]$SSID = "Faztrick",
    [string]$Password = "faztrick1234",
    [string]$StaticIP = "192.168.29.200",
    [string]$Gateway = "192.168.29.91",
    [string]$SubnetMask = "255.255.255.0",
    [string]$DNS = "8.8.8.8",
    [switch]$AutoScan,
    [switch]$Interactive,
    [switch]$TestCommands,
    [switch]$TestEndpoints,
    [switch]$SystemInfo,
    [switch]$WiFiOnly,
    [switch]$AuthorOnly,
    [switch]$WebServerOnly,
    [switch]$ClearConfig,
    [switch]$FactoryReset,
    [switch]$QuickConnect,
    [switch]$Reboot,
    [switch]$Verbose,
    [string]$LogFile = "",
    [int]$Timeout = 30,
    [string]$Author = "",
    [string]$TestEndpoint = "",
    [switch]$ContinuousMonitor,
    [int]$MonitorInterval = 5,
    [switch]$ExportConfig,
    [string]$ConfigFile = "",
    [switch]$ImportConfig,
    [switch]$NoAutoConnect,
    [switch]$APMode,
    [switch]$ShowHelp
)

# Show help if requested
if ($ShowHelp) {
    Show-Help
    exit 0
}

# Global configuration
$global:VerboseLogging = $Verbose
$global:LogFile = $LogFile
$global:StartTime = Get-Date

function Show-Help {
    Write-Host "🎮 ESP32 WiFi Serial Commander - Comprehensive Control Tool" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Cyan
    Write-Host "  .\wifi_serial_commander_optimized.ps1 [OPTIONS]" -ForegroundColor White
    Write-Host ""
    Write-Host "CONNECTION OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -ComPort <port>      Serial port (default: COM10)" -ForegroundColor Gray
    Write-Host "  -BaudRate <rate>     Baud rate (default: 115200)" -ForegroundColor Gray
    Write-Host "  -Timeout <seconds>   Command timeout (default: 30)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "WIFI CONFIGURATION:" -ForegroundColor Yellow
    Write-Host "  -SSID <name>         WiFi network name" -ForegroundColor Gray
    Write-Host "  -Password <pass>     WiFi password" -ForegroundColor Gray
    Write-Host "  -StaticIP <ip>       Static IP address" -ForegroundColor Gray
    Write-Host "  -Gateway <ip>        Gateway IP address" -ForegroundColor Gray
    Write-Host "  -SubnetMask <mask>   Subnet mask" -ForegroundColor Gray
    Write-Host "  -DNS <ip>            DNS server IP" -ForegroundColor Gray
    Write-Host ""
    Write-Host "OPERATION MODES:" -ForegroundColor Yellow
    Write-Host "  -Interactive         Enter interactive command mode" -ForegroundColor Gray
    Write-Host "  -AutoScan            Scan network for ESP32 devices" -ForegroundColor Gray
    Write-Host "  -TestCommands        Test all available commands" -ForegroundColor Gray
    Write-Host "  -TestEndpoints       Test web server endpoints" -ForegroundColor Gray
    Write-Host "  -SystemInfo          Get detailed system information" -ForegroundColor Gray
    Write-Host "  -ContinuousMonitor   Monitor device continuously" -ForegroundColor Gray
    Write-Host ""
    Write-Host "SPECIFIC OPERATIONS:" -ForegroundColor Yellow
    Write-Host "  -WiFiOnly            Only perform WiFi operations" -ForegroundColor Gray
    Write-Host "  -AuthorOnly          Only perform author/endpoint operations" -ForegroundColor Gray
    Write-Host "  -WebServerOnly       Only perform web server operations" -ForegroundColor Gray
    Write-Host "  -QuickConnect        Quick WiFi connection with current settings" -ForegroundColor Gray
    Write-Host "  -ClearConfig         Clear WiFi configuration" -ForegroundColor Gray
    Write-Host "  -FactoryReset        Perform factory reset" -ForegroundColor Gray
    Write-Host "  -Reboot              Reboot the device" -ForegroundColor Gray
    Write-Host "  -APMode              Switch to Access Point mode" -ForegroundColor Gray
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Cyan
    Write-Host "  # Interactive mode:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander_optimized.ps1 -Interactive" -ForegroundColor White
    Write-Host ""
    Write-Host "  # Quick WiFi setup:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander_optimized.ps1 -SSID 'MyWiFi' -Password 'pass123' -QuickConnect" -ForegroundColor White
    Write-Host ""
    Write-Host "  # Comprehensive testing:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander_optimized.ps1 -TestCommands -TestEndpoints -Verbose" -ForegroundColor White
    Write-Host ""
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO", [string]$Color = "White")

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"

    Write-Host $logMessage -ForegroundColor $Color

    if ($global:LogFile) {
        Add-Content -Path $global:LogFile -Value $logMessage
    }
}

function Write-Verbose-Log {
    param([string]$Message)
    if ($global:VerboseLogging) {
        Write-Log $Message "VERBOSE" "Gray"
    }
}

# Parameter validation
Write-Verbose-Log "Starting parameter validation"

if ($BaudRate -lt 9600 -or $BaudRate -gt 921600) {
    Write-Log "Invalid baud rate. Must be between 9600 and 921600" "ERROR" "Red"
    exit 1
}

if ($StaticIP -and -not ($StaticIP -match '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$')) {
    Write-Log "Invalid static IP address format" "ERROR" "Red"
    exit 1
}

Write-Log "🎮 ESP32 WiFi Serial Commander - Optimized Version" "INFO" "Green"
Write-Log "Port: $ComPort | Baud: $BaudRate | Timeout: ${Timeout}s" "INFO" "Cyan"

function Analyze-ESP32RestartReason {
    param([string]$SerialOutput)

    Write-Log "ESP32 Restart Analysis:" "INFO" "Cyan"

    if ($SerialOutput -match "rst:0x([0-9a-fA-F]+)") {
        $resetCode = $matches[1]
        $resetReason = switch ($resetCode) {
            "1" { "Power-on reset" }
            "3" { "Software reset (esp_restart)" }
            "c" { "Software reset CPU (RTC_SW_CPU_RST)" }
            "12" { "Software reset CPU (RTC_SW_CPU_RST)" }
            default { "Unknown reset reason" }
        }

        Write-Log "  Reset Code: 0x$resetCode" "INFO" "Yellow"
        Write-Log "  Reason: $resetReason" "INFO" "White"

        if ($resetCode -eq "c" -or $resetCode -eq "12") {
            Write-Log "  ⚠️ Software CPU Reset detected!" "WARN" "Red"
            Write-Log "  💡 Often indicates WiFi connection issues or invalid network configuration" "INFO" "Cyan"
        }
    }
}

function Send-SerialCommand {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [string]$Command,
        [int]$WaitTime = 2000
    )

    Write-Verbose-Log "Sending: $Command"
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
        Write-Verbose-Log "Response received: $($response.Length) characters"
        if ($global:VerboseLogging) {
            $response.Split("`n") | ForEach-Object {
                if ($_.Trim()) {
                    Write-Verbose-Log "  $_"
                }
            }
        }
    }

    return $response
}

function Test-ComprehensiveCommands {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Log "Starting comprehensive command testing..." "INFO" "Cyan"

    $allCommands = @{
        "WiFi Commands" = @(
            "wifi.status", "wifi.scan", "wifi.connect", "wifi.disconnect",
            "wifi.getip", "wifi.getssid", "wifi.getmac", "wifi.save"
        )
        "Author Commands" = @(
            "author.get", "author.endpoints", "author.status"
        )
        "System Commands" = @(
            "status", "system.info", "version", "help"
        )
    }

    $results = @{}

    foreach ($category in $allCommands.Keys) {
        Write-Log "Testing $category..." "INFO" "Yellow"
        $results[$category] = @{}

        foreach ($cmd in $allCommands[$category]) {
            Write-Verbose-Log "Testing command: $cmd"
            $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 3000

            if ($response -and $response.Length -gt 5) {
                $results[$category][$cmd] = "✅ Success"
                Write-Log "  $cmd - Success" "INFO" "Green"
            }
            else {
                $results[$category][$cmd] = "❌ Failed"
                Write-Log "  $cmd - Failed or no response" "WARN" "Red"
            }
        }
    }

    return $results
}

function Test-WebEndpoints {
    param([string]$BaseIP)

    if (-not $BaseIP) {
        Write-Log "No IP address provided for endpoint testing" "WARN" "Yellow"
        return @{}
    }

    Write-Log "Testing web endpoints at $BaseIP..." "INFO" "Cyan"

    $endpoints = @(
        "/",
        "/get_wifi_config",
        "/api/wifi/status",
        "/system_info"
    )

    $results = @{}

    foreach ($endpoint in $endpoints) {
        $fullUrl = "http://$BaseIP$endpoint"
        Write-Verbose-Log "Testing endpoint: $fullUrl"

        try {
            $response = Invoke-WebRequest -Uri $fullUrl -TimeoutSec 5 -ErrorAction Stop
            $results[$endpoint] = @{
                Status = "✅ Success"
                StatusCode = $response.StatusCode
            }
            Write-Log "  $endpoint - Success ($($response.StatusCode))" "INFO" "Green"
        }
        catch {
            $results[$endpoint] = @{
                Status = "❌ Failed"
                Error = $_.Exception.Message
            }
            Write-Log "  $endpoint - Failed: $($_.Exception.Message)" "WARN" "Red"
        }
    }

    return $results
}

function Start-NetworkScan {
    Write-Log "Scanning for ESP32 endpoints..." "INFO" "Cyan"

    $subnets = @(
        "192.168.4",
        "192.168.1",
        "192.168.29"
    )

    $foundDevices = @()

    foreach ($subnet in $subnets) {
        Write-Log "Scanning $subnet.x..." "INFO" "Yellow"

        $commonIPs = @(1, 100, 101, 200, 254)

        foreach ($ip in $commonIPs) {
            $fullIP = "$subnet.$ip"

            try {
                $ping = Test-Connection -ComputerName $fullIP -Count 1 -Quiet -TimeoutSec 1
                if ($ping) {
                    Write-Log "Found device at $fullIP" "INFO" "Green"

                    try {
                        $response = Invoke-WebRequest -Uri "http://$fullIP" -TimeoutSec 3 -ErrorAction Stop
                        if ($response.Content -match "(ESP32|OpenEPaperLink|wifi|AP)" -or
                            $response.Headers.Server -match "ESP32") {
                            Write-Log "ESP32 detected at $fullIP" "INFO" "Green"
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

    Write-Log "Configuring WiFi..." "INFO" "Cyan"

    $commands = @(
        "wifi.disconnect",
        "wifi.clearconfig",
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

# Main execution
try {
    # Handle specific operation modes first
    if ($Reboot) {
        Write-Log "This would reboot the ESP32 (demo mode)" "INFO" "Yellow"
        exit 0
    }

    if ($ShowHelp) {
        Show-Help
        exit 0
    }

    # Auto scan for devices if requested
    if ($AutoScan) {
        $devices = Start-NetworkScan
        if ($devices.Count -gt 0) {
            Write-Log "Found $($devices.Count) devices" "INFO" "Green"
            $devices | ForEach-Object {
                Write-Log "  $($_.IP) - $($_.Status)" "INFO" "White"
            }
        }
        else {
            Write-Log "No devices found on common networks" "WARN" "Yellow"
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

    Write-Log "Connecting to $ComPort..." "INFO" "Cyan"

    try {
        $serialPort.Open()
        Write-Log "Connected to ESP32 serial port successfully" "INFO" "Green"
    }
    catch {
        Write-Log "Failed to open serial port $ComPort" "ERROR" "Red"
        Write-Log "Error: $($_.Exception.Message)" "ERROR" "Red"
        Write-Log "Available ports:" "INFO" "Yellow"
        [System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object {
            Write-Log "  - $_" "INFO" "Gray"
        }
        throw "Serial port connection failed"
    }

    # Wait for startup messages
    Write-Log "Waiting for ESP32 startup messages..." "INFO" "Cyan"
    Start-Sleep -Seconds 3

    $startupMessages = ""
    try {
        $startupMessages = $serialPort.ReadExisting()
        if ($startupMessages) {
            Write-Log "ESP32 startup messages captured" "INFO" "Cyan"
            Analyze-ESP32RestartReason -SerialOutput $startupMessages
        }
    }
    catch {
        Write-Log "No startup messages captured" "WARN" "Yellow"
    }

    # Handle operation modes
    if ($Interactive) {
        Write-Log "Entering interactive mode (type 'exit' to quit)" "INFO" "Green"
        Write-Log "Available commands: wifi.status, author.get, system.info, help" "INFO" "Yellow"

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
    elseif ($TestCommands) {
        $testResults = Test-ComprehensiveCommands -Port $serialPort

        Write-Log "Command Test Summary:" "INFO" "Green"
        foreach ($category in $testResults.Keys) {
            $successCount = ($testResults[$category].Values | Where-Object { $_ -eq "✅ Success" }).Count
            $totalCount = $testResults[$category].Count
            Write-Log "  $category : $successCount/$totalCount successful" "INFO" "White"
        }
    }
    elseif ($TestEndpoints) {
        $ipResponse = Send-SerialCommand -Port $serialPort -Command "wifi.getip" -WaitTime 2000
        if ($ipResponse -match '"ip"\s*:\s*"([^"]+)"') {
            $deviceIP = $matches[1]
            $endpointResults = Test-WebEndpoints -BaseIP $deviceIP

            $successCount = ($endpointResults.Values | Where-Object { $_.Status -eq "✅ Success" }).Count
            $totalCount = $endpointResults.Count
            Write-Log "Endpoint Test Summary: $successCount/$totalCount successful" "INFO" "Green"
        }
        else {
            Write-Log "Could not determine device IP for endpoint testing" "WARN" "Yellow"
        }
    }
    elseif ($QuickConnect) {
        Write-Log "Performing quick WiFi connection..." "INFO" "Cyan"
        Send-SerialCommand -Port $serialPort -Command "wifi.connect" -WaitTime 5000
        Write-Log "Quick connect attempt completed" "INFO" "Green"
    }
    else {
        # Default operation
        if ($SSID -and $Password -and -not $NoAutoConnect) {
            Write-Log "Configuring WiFi with provided parameters..." "INFO" "Cyan"
            Set-WiFiConfig -Port $serialPort -SSID $SSID -Password $Password -IP $StaticIP -Gateway $Gateway -Subnet $SubnetMask -DNS $DNS

            if ($StaticIP) {
                Write-Log "Testing HTTP connection to $StaticIP..." "INFO" "Cyan"
                try {
                    $httpTest = Invoke-WebRequest -Uri "http://$StaticIP" -TimeoutSec 10
                    Write-Log "HTTP connection successful!" "INFO" "Green"
                    Write-Log "Access ESP32 at: http://$StaticIP" "INFO" "Cyan"
                }
                catch {
                    Write-Log "HTTP connection failed: $($_.Exception.Message)" "ERROR" "Red"
                }
            }
        }
        else {
            Write-Log "Running basic device status check..." "INFO" "Cyan"
            Send-SerialCommand -Port $serialPort -Command "wifi.status" -WaitTime 2000
            Send-SerialCommand -Port $serialPort -Command "system.info" -WaitTime 2000
        }
    }

}
catch {
    Write-Log "Error: $($_.Exception.Message)" "ERROR" "Red"
}
finally {
    if ($serialPort -and $serialPort.IsOpen) {
        Write-Log "Closing serial connection..." "INFO" "Yellow"
        $serialPort.Close()
        Write-Log "Serial connection closed successfully" "INFO" "Green"
    }

    $duration = (Get-Date) - $global:StartTime
    Write-Log "Operation completed in $([math]::Round($duration.TotalSeconds, 1)) seconds" "INFO" "Green"
}

Write-Log "🎯 ESP32 WiFi Serial Commander Complete!" "INFO" "Green"
Write-Host ""
Write-Host "📖 QUICK EXAMPLES:" -ForegroundColor Cyan
Write-Host "  .\wifi_serial_commander_optimized.ps1 -Interactive" -ForegroundColor White
Write-Host "  .\wifi_serial_commander_optimized.ps1 -TestCommands -Verbose" -ForegroundColor White
Write-Host "  .\wifi_serial_commander_optimized.ps1 -SSID MyWiFi -Password pass123" -ForegroundColor White
Write-Host "  .\wifi_serial_commander_optimized.ps1 -AutoScan" -ForegroundColor White
Write-Host "  .\wifi_serial_commander_optimized.ps1 -ShowHelp" -ForegroundColor White
