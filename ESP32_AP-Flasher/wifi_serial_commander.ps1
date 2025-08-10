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
    Write-Host "  .\wifi_serial_commander.ps1 [OPTIONS]" -ForegroundColor White
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
    Write-Host "CONFIGURATION MANAGEMENT:" -ForegroundColor Yellow
    Write-Host "  -ExportConfig        Export current configuration" -ForegroundColor Gray
    Write-Host "  -ImportConfig        Import configuration from file" -ForegroundColor Gray
    Write-Host "  -ConfigFile <file>   Configuration file path" -ForegroundColor Gray
    Write-Host ""
    Write-Host "ADVANCED OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -Author <name>       Set author name" -ForegroundColor Gray
    Write-Host "  -TestEndpoint <url>  Test specific endpoint" -ForegroundColor Gray
    Write-Host "  -NoAutoConnect       Don't auto-connect to WiFi" -ForegroundColor Gray
    Write-Host "  -MonitorInterval <s> Monitor interval in seconds (default: 5)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "LOGGING & DEBUG:" -ForegroundColor Yellow
    Write-Host "  -Verbose             Enable verbose logging" -ForegroundColor Gray
    Write-Host "  -LogFile <file>      Log output to file" -ForegroundColor Gray
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Cyan
    Write-Host "  # Interactive mode:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander.ps1 -Interactive" -ForegroundColor White
    Write-Host ""
    Write-Host "  # Quick WiFi setup:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander.ps1 -SSID 'MyWiFi' -Password 'pass123' -QuickConnect" -ForegroundColor White
    Write-Host ""
    Write-Host "  # Comprehensive testing:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander.ps1 -TestCommands -TestEndpoints -Verbose" -ForegroundColor White
    Write-Host ""
    Write-Host "  # Network discovery:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander.ps1 -AutoScan -ContinuousMonitor" -ForegroundColor White
    Write-Host ""
    Write-Host "  # Configuration management:" -ForegroundColor Gray
    Write-Host "  .\wifi_serial_commander.ps1 -ExportConfig -ConfigFile 'esp32_config.json'" -ForegroundColor White
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

if ($Timeout -lt 5 -or $Timeout -gt 300) {
    Write-Log "Invalid timeout. Must be between 5 and 300 seconds" "ERROR" "Red"
    exit 1
}

if ($MonitorInterval -lt 1 -or $MonitorInterval -gt 60) {
    Write-Log "Invalid monitor interval. Must be between 1 and 60 seconds" "ERROR" "Red"
    exit 1
}

# Validate IP address ranges
if ($StaticIP) {
    $ipParts = $StaticIP.Split('.')
    foreach ($part in $ipParts) {
        if ([int]$part -gt 255 -or [int]$part -lt 0) {
            Write-Log "Invalid IP address: Each octet must be 0-255" "ERROR" "Red"
            exit 1
        }
    }

    # Check for common typos
    if ($StaticIP -match "192\.164\.") {
        Write-Log "Possible typo detected: 192.164.x.x" "WARN" "Yellow"
        Write-Host "   Did you mean 192.168.x.x?" -ForegroundColor Cyan
        $confirmation = Read-Host "Continue anyway? (y/N)"
        if ($confirmation -ne "y" -and $confirmation -ne "Y") {
            exit 1
        }
    }
}

# Configuration management functions
function Export-Configuration {
    param([string]$FilePath, [hashtable]$Config)

    try {
        $configJson = $Config | ConvertTo-Json -Depth 10
        Set-Content -Path $FilePath -Value $configJson
        Write-Log "Configuration exported to $FilePath" "INFO" "Green"
        return $true
    }
    catch {
        Write-Log "Failed to export configuration: $($_.Exception.Message)" "ERROR" "Red"
        return $false
    }
}

function Import-Configuration {
    param([string]$FilePath)

    try {
        if (-not (Test-Path $FilePath)) {
            Write-Log "Configuration file not found: $FilePath" "ERROR" "Red"
            return $null
        }

        $configJson = Get-Content -Path $FilePath -Raw
        $config = $configJson | ConvertFrom-Json
        Write-Log "Configuration imported from $FilePath" "INFO" "Green"
        return $config
    }
    catch {
        Write-Log "Failed to import configuration: $($_.Exception.Message)" "ERROR" "Red"
        return $null
    }
}

function Get-CurrentConfiguration {
    return @{
        ComPort = $ComPort
        BaudRate = $BaudRate
        SSID = $SSID
        Password = $Password
        StaticIP = $StaticIP
        Gateway = $Gateway
        SubnetMask = $SubnetMask
        DNS = $DNS
        Timeout = $Timeout
        MonitorInterval = $MonitorInterval
        Author = $Author
        TestEndpoint = $TestEndpoint
        Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
}
if ($StaticIP) {
    $ipParts = $StaticIP.Split('.')
    foreach ($part in $ipParts) {
        if ([int]$part -gt 255 -or [int]$part -lt 0) {
            Write-Host "❌ Invalid IP address: Each octet must be 0-255" -ForegroundColor Red
            exit 1
        }
    }

    # Check for common typos
    if ($StaticIP -match "192\.164\.") {
        Write-Host "⚠️  Possible typo detected: 192.164.x.x" -ForegroundColor Yellow
        Write-Host "   Did you mean 192.168.x.x?" -ForegroundColor Cyan
        $confirmation = Read-Host "Continue anyway? (y/N)"
        if ($confirmation -ne "y" -and $confirmation -ne "Y") {
            exit 1
        }
    }
}

Write-Host "🎮 ESP32 WiFi Serial Commander" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Write-Host "Port: $ComPort | Baud: $BaudRate" -ForegroundColor Cyan
Write-Host ""

function Analyze-ESP32RestartReason {
    param([string]$SerialOutput)

    Write-Host "`n🔍 ESP32 Restart Analysis:" -ForegroundColor Cyan

    if ($SerialOutput -match "rst:0x([0-9a-fA-F]+)") {
        $resetCode = $matches[1]
        $resetReason = switch ($resetCode) {
            "1" { "Power-on reset" }
            "3" { "Software reset (esp_restart)" }
            "4" { "Legacy watch dog reset" }
            "5" { "Deep sleep reset" }
            "6" { "Reset by SLC module" }
            "7" { "Timer group0 watch dog reset" }
            "8" { "Timer group1 watch dog reset" }
            "9" { "RTC watch dog Reset" }
            "10" { "Instrusion tested to reset CPU" }
            "11" { "Time Group reset CPU" }
            "12" { "Software reset CPU (RTC_SW_CPU_RST)" }
            "13" { "RTC reset CPU" }
            "14" { "for APP CPU, reseted by PRO CPU" }
            "15" { "Reset when the vdd voltage is not stable" }
            "16" { "RTC Watch dog reset digital core and rtc module" }
            default { "Unknown reset reason" }
        }

        Write-Host "   Reset Code: 0x$resetCode" -ForegroundColor Yellow
        Write-Host "   Reason: $resetReason" -ForegroundColor White

        # Specific analysis for your case
        if ($resetCode -eq "c" -or $resetCode -eq "12") {
            Write-Host "   ⚠️  Software CPU Reset detected!" -ForegroundColor Red
            Write-Host "   💡 This often indicates:" -ForegroundColor Cyan
            Write-Host "      - WiFi connection issues" -ForegroundColor Gray
            Write-Host "      - Invalid network configuration" -ForegroundColor Gray
            Write-Host "      - Watchdog timeout from hanging operations" -ForegroundColor Gray
            Write-Host "      - Memory allocation failures" -ForegroundColor Gray
        }
    }
}

function Test-ComprehensiveCommands {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Log "Starting comprehensive command testing..." "INFO" "Cyan"

    $allCommands = @{
        "WiFi Commands" = @(
            "wifi.status", "wifi.scan", "wifi.connect", "wifi.disconnect",
            "wifi.getip", "wifi.getssid", "wifi.getmac", "wifi.save",
            "wifi.clearconfig", "wifi.apstatus"
        )
        "Author Commands" = @(
            "author.get", "author.endpoints", "author.status"
        )
        "System Commands" = @(
            "status", "system.info", "version", "help"
        )
        "Web Commands" = @(
            "web.status", "web.start", "web.info"
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
    param([System.IO.Ports.SerialPort]$Port, [string]$BaseIP)

    if (-not $BaseIP) {
        Write-Log "No IP address provided for endpoint testing" "WARN" "Yellow"
        return @{}
    }

    Write-Log "Testing web endpoints at $BaseIP..." "INFO" "Cyan"

    $endpoints = @(
        "/",
        "/get_wifi_config",
        "/api/wifi/status",
        "/system_info",
        "/network_info",
        "/api/wifi/scan",
        "/tag_cmd",
        "/ota_check"
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
                ContentLength = $response.Content.Length
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

function Start-ContinuousMonitoring {
    param([System.IO.Ports.SerialPort]$Port, [int]$IntervalSeconds = 5)

    Write-Log "Starting continuous monitoring (interval: ${IntervalSeconds}s)" "INFO" "Cyan"
    Write-Log "Press Ctrl+C to stop monitoring" "INFO" "Yellow"

    $monitorCount = 0

    try {
        while ($true) {
            $monitorCount++
            Write-Log "=== Monitor Cycle $monitorCount ===" "INFO" "Cyan"

            # Get WiFi status
            $wifiResponse = Send-SerialCommand -Port $Port -Command "wifi.status" -WaitTime 2000
            if ($wifiResponse) {
                Write-Log "WiFi Status: Connected" "INFO" "Green"
            }
            else {
                Write-Log "WiFi Status: No response" "WARN" "Yellow"
            }

            # Get system info
            $sysResponse = Send-SerialCommand -Port $Port -Command "system.info" -WaitTime 2000
            if ($sysResponse) {
                # Extract key info from response
                if ($sysResponse -match "free_heap.*?(\d+)") {
                    Write-Log "Free Heap: $($matches[1]) bytes" "INFO" "White"
                }
                if ($sysResponse -match "uptime_ms.*?(\d+)") {
                    $uptimeMs = [long]$matches[1]
                    $uptimeMin = [math]::Round($uptimeMs / 60000, 1)
                    Write-Log "Uptime: $uptimeMin minutes" "INFO" "White"
                }
            }

            Start-Sleep -Seconds $IntervalSeconds
        }
    }
    catch [System.Management.Automation.HaltCommandException] {
        Write-Log "Monitoring stopped by user" "INFO" "Yellow"
    }
    catch {
        Write-Log "Monitoring error: $($_.Exception.Message)" "ERROR" "Red"
    }
}

function Invoke-QuickConnect {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Log "Performing quick WiFi connection..." "INFO" "Cyan"

    # Quick sequence of commands for fast connection
    $quickCommands = @(
        "wifi.status",
        "wifi.connect"
    )

    foreach ($cmd in $quickCommands) {
        Write-Verbose-Log "Quick command: $cmd"
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 2000
        Start-Sleep -Milliseconds 500
    }

    # Wait a bit for connection
    Start-Sleep -Seconds 5

    # Check final status
    $finalStatus = Send-SerialCommand -Port $Port -Command "wifi.status" -WaitTime 2000
    if ($finalStatus -and $finalStatus -match "connected.*true") {
        Write-Log "Quick connect successful!" "INFO" "Green"
        return $true
    }
    else {
        Write-Log "Quick connect failed" "WARN" "Red"
        return $false
    }
}
    param([System.IO.Ports.SerialPort]$Port)

    Write-Host "`n🧪 Testing Author Endpoints..." -ForegroundColor Cyan
    Write-Host "💡 Use 'author.test' to test specific endpoints" -ForegroundColor Yellow

    $testCommands = @(
        "author.test",
        "author.get",
        "author.endpoints",
        "author.status"
    )

    foreach ($cmd in $testCommands) {
        Write-Host "`n   Testing: $cmd" -ForegroundColor Yellow
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 3000

        if ($response -and $response.Length -gt 5) {
            Write-Host "   ✅ Response received" -ForegroundColor Green
            $response.Split("`n") | ForEach-Object {
                if ($_.Trim()) {
                    Write-Host "      $_" -ForegroundColor Gray
                }
            }
        }
        else {
            Write-Host "   ❌ No response or command not supported" -ForegroundColor Red
        }
    }
}

function Test-AuthorEndpoints {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Log "Testing Author Endpoints..." "INFO" "Cyan"
    Write-Log "💡 Use 'author.test' to test specific endpoints" "INFO" "Yellow"

    $testCommands = @(
        "author.test",
        "author.get",
        "author.endpoints",
        "author.status"
    )

    foreach ($cmd in $testCommands) {
        Write-Verbose-Log "Testing: $cmd"
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 3000

        if ($response -and $response.Length -gt 5) {
            Write-Log "  $cmd - Response received" "INFO" "Green"
            if ($global:VerboseLogging) {
                $response.Split("`n") | ForEach-Object {
                    if ($_.Trim()) {
                        Write-Verbose-Log "    $_"
                    }
                }
            }
        }
        else {
            Write-Log "  $cmd - No response or command not supported" "WARN" "Red"
        }
    }
}

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
    param(
        [System.IO.Ports.SerialPort]$Port,
        [string]$CurrentSSID = "",
        [string]$CurrentPassword = "",
        [string]$CurrentStaticIP = "",
        [string]$CurrentGateway = "",
        [string]$CurrentSubnetMask = "",
        [string]$CurrentDNS = ""
    )

    Write-Host "`n📊 Getting WiFi Status..." -ForegroundColor Cyan

    $commands = @(
        "wifi.status",
        "wifi.scan",
        "wifi.connect",
        "wifi.disconnect"
    )

    # Only add configuration commands if values are provided
    if ($CurrentSSID) { $commands += "wifi.setssid `"$CurrentSSID`"" }
    if ($CurrentPassword) { $commands += "wifi.setpassword `"$CurrentPassword`"" }
    if ($CurrentStaticIP) { $commands += "wifi.setstaticip `"$CurrentStaticIP`"" }
    if ($CurrentGateway) { $commands += "wifi.setgateway `"$CurrentGateway`"" }
    if ($CurrentSubnetMask) { $commands += "wifi.setsubnet `"$CurrentSubnetMask`"" }
    if ($CurrentDNS) { $commands += "wifi.setdns `"$CurrentDNS`"" }

    $commands += @(
        "wifi.save",
        "wifi.cleanconfig",
        "wifi.apstatus"
    )

    $status = @{}

    foreach ($cmd in $commands) {
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 1000
        if ($response) {
            Write-Host "$response" -ForegroundColor Green
            $status[$cmd] = $response.Trim()
        }
        else {
            $status[$cmd] = "No response"
        }
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
        "wifi.scan",
        "wifi.clearconfig",
        "wifi.save",
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
        "192.168.4",
        "192.168.1",
        "192.168.29",
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
            Write-Host $response -ForegroundColor Green
            $response.Split("`n") | ForEach-Object {
                if ($_.Trim()) {
                    Write-Host "      $_" -ForegroundColor Gray
                }
            }
        }
        else {
            Write-Host "   ❌ Command not supported or no response" -ForegroundColor Red
        }
    }
}

# Main execution
Write-Log "🎮 ESP32 WiFi Serial Commander - Starting" "INFO" "Green"
Write-Log "Port: $ComPort | Baud: $BaudRate | Timeout: ${Timeout}s" "INFO" "Cyan"

try {
    # Handle configuration import first
    if ($ImportConfig -and $ConfigFile) {
        Write-Log "Importing configuration from $ConfigFile..." "INFO" "Cyan"
        $importedConfig = Import-Configuration -FilePath $ConfigFile
        if ($importedConfig) {
            # Override parameters with imported values
            $SSID = $importedConfig.SSID
            $Password = $importedConfig.Password
            $StaticIP = $importedConfig.StaticIP
            $Gateway = $importedConfig.Gateway
            $SubnetMask = $importedConfig.SubnetMask
            $DNS = $importedConfig.DNS
            Write-Log "Configuration imported successfully" "INFO" "Green"
        }
    }

    # Handle configuration export
    if ($ExportConfig) {
        $configToExport = Get-CurrentConfiguration
        $exportFile = if ($ConfigFile) { $ConfigFile } else { "esp32_config_$(Get-Date -Format 'yyyyMMdd_HHmmss').json" }
        Export-Configuration -FilePath $exportFile -Config $configToExport
    }

    # Auto scan for devices if requested
    if ($AutoScan) {
        Write-Log "Scanning network for ESP32 devices..." "INFO" "Cyan"
        $devices = Start-NetworkScan

        if ($devices.Count -gt 0) {
            Write-Log "Found $($devices.Count) devices:" "INFO" "Green"
            $devices | ForEach-Object {
                Write-Log "  $($_.IP) - $($_.Status)" "INFO" "White"
            }

            $esp32Devices = $devices | Where-Object { $_.Status -eq "ESP32 Detected" }
            if ($esp32Devices.Count -gt 0) {
                Write-Log "ESP32 devices found - accessible via HTTP:" "INFO" "Green"
                $esp32Devices | ForEach-Object {
                    Write-Log "  🌐 http://$($_.IP)" "INFO" "Cyan"
                }
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

    # Wait for startup messages and analyze them
    Write-Log "Waiting for ESP32 startup messages..." "INFO" "Cyan"
    Start-Sleep -Seconds 3

    # Capture and analyze startup messages
    $startupMessages = ""
    try {
        $startupMessages = $serialPort.ReadExisting()
        if ($startupMessages) {
            Write-Log "ESP32 Startup Messages captured:" "INFO" "Cyan"
            $startupMessages.Split("`n") | ForEach-Object {
                if ($_.Trim()) {
                    Write-Verbose-Log "  $_"
                }
            }

            # Analyze restart reason
            Analyze-ESP32RestartReason -SerialOutput $startupMessages
        }
    }
    catch {
        Write-Log "No startup messages captured" "WARN" "Yellow"
    }

    # Handle specific operation modes
    if ($Reboot) {
        Write-Log "Rebooting ESP32..." "INFO" "Yellow"
        Send-SerialCommand -Port $serialPort -Command "system.reboot" -WaitTime 2000
        Write-Log "Reboot command sent" "INFO" "Green"
        return
    }

    if ($FactoryReset) {
        Write-Log "Performing factory reset..." "INFO" "Yellow"
        Send-SerialCommand -Port $serialPort -Command "wifi.clearconfig" -WaitTime 2000
        Write-Log "Factory reset command sent" "INFO" "Green"
        return
    }

    if ($ClearConfig) {
        Write-Log "Clearing WiFi configuration..." "INFO" "Yellow"
        Send-SerialCommand -Port $serialPort -Command "wifi.clearconfig" -WaitTime 2000
        Write-Log "Configuration cleared" "INFO" "Green"
        return
    }

    if ($APMode) {
        Write-Log "Switching to AP mode..." "INFO" "Yellow"
        Send-SerialCommand -Port $serialPort -Command "wifi.clearconfig" -WaitTime 2000
        Write-Log "Switched to AP mode" "INFO" "Green"
        return
    }

    if ($Interactive) {
        Write-Log "Entering interactive mode (type 'exit' to quit):" "INFO" "Green"
        Write-Log "Available commands:" "INFO" "Yellow"
        Write-Log "  WiFi: wifi.status, wifi.scan, wifi.connect, wifi.disconnect" "INFO" "Gray"
        Write-Log "  WiFi: wifi.getip, wifi.getssid, wifi.getmac, wifi.save" "INFO" "Gray"
        Write-Log "  Author: author.get, author.set, author.endpoints, author.status" "INFO" "Gray"
        Write-Log "  Author: author.test (💡 test specific endpoints)" "INFO" "Gray"
        Write-Log "  System: system.info, system.reboot, help, version, status" "INFO" "Gray"
        Write-Log "  Web: web.status, web.start, web.info" "INFO" "Gray"

        while ($true) {
            $userCommand = Read-Host "ESP32> "

            if ($userCommand -eq "exit" -or $userCommand -eq "quit") {
                break
            }

            if ($userCommand.Trim()) {
                Send-SerialCommand -Port $serialPort -Command $userCommand -WaitTime 3000
            }
        }
        return
    }

    # Handle specific testing modes
    if ($TestCommands) {
        Write-Log "Running comprehensive command tests..." "INFO" "Cyan"
        $testResults = Test-ComprehensiveCommands -Port $serialPort

        # Summary
        Write-Log "Command Test Summary:" "INFO" "Green"
        foreach ($category in $testResults.Keys) {
            $successCount = ($testResults[$category].Values | Where-Object { $_ -eq "✅ Success" }).Count
            $totalCount = $testResults[$category].Count
            Write-Log "  $category`: $successCount/$totalCount successful" "INFO" "White"
        }
    }

    if ($TestEndpoints) {
        # First get the IP address
        $ipResponse = Send-SerialCommand -Port $serialPort -Command "wifi.getip" -WaitTime 2000
        if ($ipResponse -and $ipResponse -match '"ip"\s*:\s*"([^"]+)"') {
            $deviceIP = $matches[1]
            Write-Log "Testing endpoints at IP: $deviceIP" "INFO" "Cyan"
            $endpointResults = Test-WebEndpoints -Port $serialPort -BaseIP $deviceIP

            # Summary
            $successCount = ($endpointResults.Values | Where-Object { $_.Status -eq "✅ Success" }).Count
            $totalCount = $endpointResults.Count
            Write-Log "Endpoint Test Summary: $successCount/$totalCount successful" "INFO" "Green"
        }
        else {
            Write-Log "Could not determine device IP for endpoint testing" "WARN" "Yellow"
        }
    }

    if ($SystemInfo) {
        Write-Log "Getting comprehensive system information..." "INFO" "Cyan"
        $sysInfo = Send-SerialCommand -Port $serialPort -Command "system.info" -WaitTime 3000
        $version = Send-SerialCommand -Port $serialPort -Command "version" -WaitTime 2000
        $wifiStatus = Send-SerialCommand -Port $serialPort -Command "wifi.status" -WaitTime 2000
        Write-Log "System information retrieved" "INFO" "Green"
    }

    if ($ContinuousMonitor) {
        Start-ContinuousMonitoring -Port $serialPort -IntervalSeconds $MonitorInterval
        return
    }

    if ($QuickConnect) {
        $success = Invoke-QuickConnect -Port $serialPort
        if ($success) {
            Write-Log "Quick connect completed successfully" "INFO" "Green"
        }
        return
    }

    if ($Author) {
        Write-Log "Setting author to: $Author" "INFO" "Yellow"
        Send-SerialCommand -Port $serialPort -Command "author.set `"$Author`"" -WaitTime 2000
    }

    if ($TestEndpoint) {
        Write-Log "Testing specific endpoint: $TestEndpoint" "INFO" "Yellow"
        Send-SerialCommand -Port $serialPort -Command "author.test `"$TestEndpoint`"" -WaitTime 3000
    }

    # Handle mode-specific operations
    if ($WiFiOnly) {
        Write-Log "WiFi-only mode - performing WiFi operations..." "INFO" "Cyan"
        if ($SSID -and $Password) {
            Set-WiFiConfig -Port $serialPort -SSID $SSID -Password $Password -IP $StaticIP -Gateway $Gateway -Subnet $SubnetMask -DNS $DNS
        }
        $status = Get-WiFiStatus -Port $serialPort
        return
    }

    if ($AuthorOnly) {
        Write-Log "Author-only mode - performing author operations..." "INFO" "Cyan"
        Test-AuthorEndpoints -Port $serialPort
        $authorInfo = Get-AuthorEndpoints -Port $serialPort
        return
    }

    if ($WebServerOnly) {
        Write-Log "Web server mode - testing web server..." "INFO" "Cyan"
        Send-SerialCommand -Port $serialPort -Command "web.status" -WaitTime 2000
        Send-SerialCommand -Port $serialPort -Command "web.start" -WaitTime 2000
        return
    }

    # Default operation - comprehensive setup and testing
    if (-not $NoAutoConnect) {
        # Configure WiFi if parameters provided
        if ($SSID -and $Password) {
            Write-Log "Configuring WiFi with provided parameters..." "INFO" "Cyan"
            Set-WiFiConfig -Port $serialPort -SSID $SSID -Password $Password -IP $StaticIP -Gateway $Gateway -Subnet $SubnetMask -DNS $DNS
            $newStatus = Get-WiFiStatus -Port $serialPort -CurrentSSID $SSID -CurrentPassword $Password -CurrentStaticIP $StaticIP -CurrentGateway $Gateway -CurrentSubnetMask $SubnetMask -CurrentDNS $DNS

            # Test new connection
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
            # Run basic commands when no WiFi config is provided
            Write-Log "Running basic device tests..." "INFO" "Cyan"
            Test-SerialCommands -Port $serialPort
            $status = Get-WiFiStatus -Port $serialPort
            $authorInfo = Get-AuthorEndpoints -Port $serialPort
            Test-AuthorEndpoints -Port $serialPort
        }
    }

    Write-Log "Final status check..." "INFO" "Cyan"
    $finalStatus = Get-WiFiStatus -Port $serialPort

}
catch {
    Write-Log "Error: $($_.Exception.Message)" "ERROR" "Red"
    if ($global:VerboseLogging) {
        Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR" "Red"
    }
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
Write-Log "📊 Session Summary:" "INFO" "Cyan"
Write-Log "  Port: $ComPort @ $BaudRate baud" "INFO" "Gray"
Write-Log "  Duration: $([math]::Round(((Get-Date) - $global:StartTime).TotalSeconds, 1))s" "INFO" "Gray"
if ($global:LogFile) {
    Write-Log "  Log file: $($global:LogFile)" "INFO" "Gray"
}

Write-Host ""
Write-Host "📖 USAGE EXAMPLES:" -ForegroundColor Cyan
Write-Host "  # Quick WiFi setup:" -ForegroundColor Gray
Write-Host "  .\wifi_serial_commander.ps1 -SSID 'MyWiFi' -Password 'pass123' -QuickConnect" -ForegroundColor White
Write-Host ""
Write-Host "  # Comprehensive testing:" -ForegroundColor Gray
Write-Host "  .\wifi_serial_commander.ps1 -TestCommands -TestEndpoints -Verbose" -ForegroundColor White
Write-Host ""
Write-Host "  # Interactive mode:" -ForegroundColor Gray
Write-Host "  .\wifi_serial_commander.ps1 -Interactive" -ForegroundColor White
Write-Host ""
Write-Host "  # Network discovery:" -ForegroundColor Gray
Write-Host "  .\wifi_serial_commander.ps1 -AutoScan -ContinuousMonitor" -ForegroundColor White
Write-Host ""
Write-Host "  # Configuration management:" -ForegroundColor Gray
Write-Host "  .\wifi_serial_commander.ps1 -ExportConfig -ConfigFile 'esp32_backup.json'" -ForegroundColor White
Write-Host ""
Write-Host "💡 AVAILABLE COMMANDS:" -ForegroundColor Yellow
Write-Host "  WiFi: wifi.status, wifi.scan, wifi.connect, wifi.setssid, wifi.save" -ForegroundColor Gray
Write-Host "  Author: author.get, author.set, author.endpoints, author.test" -ForegroundColor Gray
Write-Host "  System: system.info, system.reboot, version, help, status" -ForegroundColor Gray
Write-Host "  Web: web.status, web.start, web.info" -ForegroundColor Gray
Write-Host ""
Write-Host "🔧 ADVANCED OPTIONS:" -ForegroundColor Yellow
Write-Host "  Use -ShowHelp for complete parameter list" -ForegroundColor Gray
Write-Host "  Use -Verbose for detailed logging" -ForegroundColor Gray
Write-Host "  Use -LogFile to save output to file" -ForegroundColor Gray
