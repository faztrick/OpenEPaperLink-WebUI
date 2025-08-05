#!/usr/bin/env pwsh
# ========================================================================
# ESP32 Development Console UI - Fast Terminal Interface
# Interactive menu system for ESP32 OutdoorAP development
# ========================================================================

# Configuration
$ErrorActionPreference = "Stop"
$global:config = @{
    Environment = "OutdoorAP"
    ComPort = "COM10"
    BaudRate = 921600
    Jobs = 0  # Auto
    FastBuild = $true
    Clean = $false
    Verbose = $false
    FilesystemOnly = $false
    SkipUpload = $false
    Monitor = $false
}

# Colors
$colors = @{
    Header = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "White"
    Prompt = "Magenta"
    Highlight = "Yellow"
}

function Show-Header {
    Clear-Host
    Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║                🚀 ESP32 OutdoorAP Dev Console 🚀              ║
║                     Fast Terminal Interface                   ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor $colors.Header
    Write-Host ""
}

function Show-Config {
    Write-Host "📋 Current Configuration:" -ForegroundColor $colors.Info
    Write-Host "   Environment    : " -NoNewline -ForegroundColor $colors.Info
    Write-Host $global:config.Environment -ForegroundColor $colors.Highlight
    Write-Host "   COM Port       : " -NoNewline -ForegroundColor $colors.Info
    Write-Host $global:config.ComPort -ForegroundColor $colors.Highlight
    Write-Host "   Baud Rate      : " -NoNewline -ForegroundColor $colors.Info
    Write-Host $global:config.BaudRate -ForegroundColor $colors.Highlight
    Write-Host "   Parallel Jobs  : " -NoNewline -ForegroundColor $colors.Info
    Write-Host $(if ($global:config.Jobs -eq 0) { "Auto" } else { $global:config.Jobs }) -ForegroundColor $colors.Highlight
    Write-Host "   Fast Build     : " -NoNewline -ForegroundColor $colors.Info
    Write-Host $global:config.FastBuild -ForegroundColor $(if ($global:config.FastBuild) { $colors.Success } else { $colors.Warning })
    Write-Host ""
}

function Show-Menu {
    Write-Host "🔧 BUILD & FLASH ACTIONS:" -ForegroundColor $colors.Info
    Write-Host "   1) 🔨 Build Only                    2) 📤 Upload Only" -ForegroundColor $colors.Info
    Write-Host "   3) 🚀 Build + Upload               4) ⚡ Turbo Build + Upload" -ForegroundColor $colors.Success
    Write-Host "   5) 📁 Filesystem Only              6) 🧹 Clean Build" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "📺 MONITORING & DEBUG:" -ForegroundColor $colors.Info
    Write-Host "   7) 📺 Serial Monitor               8) 🐛 Debug Build + Monitor" -ForegroundColor $colors.Info
    Write-Host "   9) 🎮 Start Simulator             10) 🔍 Device Info" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "⚙️  CONFIGURATION & TOOLS:" -ForegroundColor $colors.Info
    Write-Host "  11) 📶 Configure WiFi              12) ⚙️ Configure Newton M3" -ForegroundColor $colors.Info
    Write-Host "  13) ✅ Validate Config             14) 🧪 Test API Endpoints" -ForegroundColor $colors.Info
    Write-Host "  15) 🔄 Refresh COM Ports           16) 📁 Open Build Folder" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "🛠️  SETTINGS:" -ForegroundColor $colors.Info
    Write-Host "  17) ⚙️ Edit Configuration          18) 💾 Save/Load Profile" -ForegroundColor $colors.Info
    Write-Host "  19) 🌐 Open Web UI (192.168.4.1)  20) 📋 Show Build Log" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "   0) ❌ Exit" -ForegroundColor $colors.Error
    Write-Host ""
}

function Get-ComPorts {
    try {
        $ports = Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match "COM\d+" } | 
            ForEach-Object { 
                if ($_.Caption -match "(COM\d+)") { $Matches[1] }
            } | Sort-Object
        return $ports
    } catch {
        return @("COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "COM10")
    }
}

function Select-ComPort {
    $ports = Get-ComPorts
    if ($ports.Count -eq 0) {
        Write-Host "❌ No COM ports found!" -ForegroundColor $colors.Error
        return $global:config.ComPort
    }
    
    Write-Host "📱 Available COM Ports:" -ForegroundColor $colors.Info
    for ($i = 0; $i -lt $ports.Count; $i++) {
        $marker = if ($ports[$i] -eq $global:config.ComPort) { " (current)" } else { "" }
        Write-Host "   $($i + 1)) $($ports[$i])$marker" -ForegroundColor $colors.Info
    }
    
    $choice = Read-Host "Select port (1-$($ports.Count)) or Enter for current"
    if ($choice -and $choice -ge 1 -and $choice -le $ports.Count) {
        return $ports[$choice - 1]
    }
    return $global:config.ComPort
}

function Build-Arguments {
    $args = @()
    $args += "-Environment", $global:config.Environment
    $args += "-ComPort", $global:config.ComPort
    $args += "-BaudRate", $global:config.BaudRate
    
    if ($global:config.Jobs -gt 0) {
        $args += "-Jobs", $global:config.Jobs
    }
    
    if ($global:config.FastBuild) { $args += "-FastBuild" }
    if ($global:config.Clean) { $args += "-Clean" }
    if ($global:config.Verbose) { $args += "-Verbose" }
    if ($global:config.FilesystemOnly) { $args += "-FilesystemOnly" }
    if ($global:config.SkipUpload) { $args += "-SkipUpload" }
    if ($global:config.Monitor) { $args += "-Monitor" }
    
    return $args
}

function Execute-Script {
    param([string]$ScriptPath, [array]$Arguments = @())
    
    Write-Host ""
    Write-Host "⚡ Executing: $ScriptPath" -ForegroundColor $colors.Info
    Write-Host "   Arguments: $($Arguments -join ' ')" -ForegroundColor $colors.Info
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $colors.Header
    
    try {
        if (Test-Path $ScriptPath) {
            $timer = [System.Diagnostics.Stopwatch]::StartNew()
            & $ScriptPath @Arguments
            $timer.Stop()
            
            Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $colors.Header
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Operation completed successfully in $([math]::Round($timer.ElapsedMilliseconds/1000, 1))s" -ForegroundColor $colors.Success
            } else {
                Write-Host "❌ Operation failed with exit code: $LASTEXITCODE" -ForegroundColor $colors.Error
            }
        } else {
            Write-Host "❌ Script not found: $ScriptPath" -ForegroundColor $colors.Error
        }
    } catch {
        Write-Host "❌ Error executing script: $_" -ForegroundColor $colors.Error
    }
    
    Write-Host ""
    Read-Host "Press Enter to continue"
}

function Edit-Configuration {
    do {
        Show-Header
        Write-Host "⚙️  CONFIGURATION EDITOR" -ForegroundColor $colors.Header
        Write-Host ""
        Write-Host "1) Environment: $($global:config.Environment)" -ForegroundColor $colors.Info
        Write-Host "2) COM Port: $($global:config.ComPort)" -ForegroundColor $colors.Info
        Write-Host "3) Baud Rate: $($global:config.BaudRate)" -ForegroundColor $colors.Info
        Write-Host "4) Parallel Jobs: $(if ($global:config.Jobs -eq 0) { 'Auto' } else { $global:config.Jobs })" -ForegroundColor $colors.Info
        Write-Host "5) Fast Build: $($global:config.FastBuild)" -ForegroundColor $(if ($global:config.FastBuild) { $colors.Success } else { $colors.Warning })
        Write-Host "6) Clean Build: $($global:config.Clean)" -ForegroundColor $(if ($global:config.Clean) { $colors.Warning } else { $colors.Success })
        Write-Host "7) Verbose: $($global:config.Verbose)" -ForegroundColor $(if ($global:config.Verbose) { $colors.Warning } else { $colors.Success })
        Write-Host "8) Filesystem Only: $($global:config.FilesystemOnly)" -ForegroundColor $(if ($global:config.FilesystemOnly) { $colors.Warning } else { $colors.Success })
        Write-Host "9) Skip Upload: $($global:config.SkipUpload)" -ForegroundColor $(if ($global:config.SkipUpload) { $colors.Warning } else { $colors.Success })
        Write-Host "10) Auto Monitor: $($global:config.Monitor)" -ForegroundColor $(if ($global:config.Monitor) { $colors.Success } else { $colors.Warning })
        Write-Host ""
        Write-Host "0) Back to main menu" -ForegroundColor $colors.Info
        Write-Host ""
        
        $choice = Read-Host "Select option to modify (0-10)"
        
        switch ($choice) {
            "1" {
                Write-Host "Available environments: OutdoorAP, IndoorAP, Debug" -ForegroundColor $colors.Info
                $env = Read-Host "Enter environment (or Enter for current)"
                if ($env -and $env -in @("OutdoorAP", "IndoorAP", "Debug")) {
                    $global:config.Environment = $env
                }
            }
            "2" {
                $global:config.ComPort = Select-ComPort
            }
            "3" {
                Write-Host "Common baud rates: 115200, 460800, 921600, 1500000" -ForegroundColor $colors.Info
                $baud = Read-Host "Enter baud rate (or Enter for current)"
                if ($baud -and $baud -match '^\d+$') {
                    $global:config.BaudRate = [int]$baud
                }
            }
            "4" {
                Write-Host "Enter job count (0 for auto, 4-24 for manual)" -ForegroundColor $colors.Info
                $jobs = Read-Host "Parallel jobs (or Enter for current)"
                if ($jobs -and $jobs -match '^\d+$' -and [int]$jobs -ge 0 -and [int]$jobs -le 24) {
                    $global:config.Jobs = [int]$jobs
                }
            }
            "5" { $global:config.FastBuild = -not $global:config.FastBuild }
            "6" { $global:config.Clean = -not $global:config.Clean }
            "7" { $global:config.Verbose = -not $global:config.Verbose }
            "8" { $global:config.FilesystemOnly = -not $global:config.FilesystemOnly }
            "9" { $global:config.SkipUpload = -not $global:config.SkipUpload }
            "10" { $global:config.Monitor = -not $global:config.Monitor }
            "0" { return }
        }
    } while ($true)
}

function Show-DeviceInfo {
    Show-Header
    Write-Host "📱 DEVICE INFORMATION" -ForegroundColor $colors.Header
    Write-Host ""
    
    # Check build files
    $buildPath = ".pio\build\$($global:config.Environment)"
    if (Test-Path $buildPath) {
        $firmwareFile = Join-Path $buildPath "firmware.bin"
        if (Test-Path $firmwareFile) {
            $size = [math]::Round((Get-Item $firmwareFile).Length / 1MB, 2)
            $buildTime = (Get-Item $firmwareFile).LastWriteTime
            Write-Host "✅ Firmware: " -NoNewline -ForegroundColor $colors.Success
            Write-Host "firmware.bin (${size}MB)" -ForegroundColor $colors.Info
            Write-Host "   Built: $($buildTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor $colors.Info
        }
        
        $filesystemFile = Join-Path $buildPath "littlefs.bin"
        if (Test-Path $filesystemFile) {
            $size = [math]::Round((Get-Item $filesystemFile).Length / 1MB, 2)
            Write-Host "✅ Filesystem: " -NoNewline -ForegroundColor $colors.Success
            Write-Host "littlefs.bin (${size}MB)" -ForegroundColor $colors.Info
        }
    } else {
        Write-Host "⚠️  No build files found. Build the project first." -ForegroundColor $colors.Warning
    }
    
    Write-Host ""
    Write-Host "🎯 Target Device: ESP32-S3 DevKit C-1" -ForegroundColor $colors.Info
    Write-Host "📡 Project: OutdoorAP (E-Paper Link Access Point)" -ForegroundColor $colors.Info
    Write-Host "💾 Flash Size: 32MB (with PSRAM)" -ForegroundColor $colors.Info
    Write-Host "📶 Features: WiFi, BLE, SubGHz Radio, TFT Display" -ForegroundColor $colors.Info
    
    # Check COM port
    $ports = Get-ComPorts
    if ($global:config.ComPort -in $ports) {
        Write-Host "✅ COM Port: " -NoNewline -ForegroundColor $colors.Success
        Write-Host "$($global:config.ComPort) (Available)" -ForegroundColor $colors.Info
    } else {
        Write-Host "❌ COM Port: " -NoNewline -ForegroundColor $colors.Error
        Write-Host "$($global:config.ComPort) (Not Found)" -ForegroundColor $colors.Info
    }
    
    Write-Host ""
    Read-Host "Press Enter to continue"
}

function Show-BuildLog {
    $logPath = ".pio\build\$($global:config.Environment)\firmware.elf"
    if (Test-Path $logPath) {
        Write-Host "📋 Latest build log for $($global:config.Environment):" -ForegroundColor $colors.Info
        Write-Host "   Build time: $((Get-Item $logPath).LastWriteTime)" -ForegroundColor $colors.Info
        Write-Host "   Size: $([math]::Round((Get-Item $logPath).Length / 1MB, 2))MB" -ForegroundColor $colors.Info
    } else {
        Write-Host "❌ No build log found. Build the project first." -ForegroundColor $colors.Error
    }
    Read-Host "Press Enter to continue"
}

# Main menu loop
do {
    Show-Header
    Show-Config
    Show-Menu
    
    $choice = Read-Host "Select action (0-20)"
    
    switch ($choice) {
        "1" {  # Build Only
            $global:config.SkipUpload = $true
            $global:config.Monitor = $false
            Execute-Script ".\compile.ps1" (Build-Arguments)
        }
        "2" {  # Upload Only
            $global:config.SkipUpload = $false
            Execute-Script ".\compile.ps1" @("-Environment", $global:config.Environment, "-ComPort", $global:config.ComPort, "-BaudRate", $global:config.BaudRate, "-SkipBuild")
        }
        "3" {  # Build + Upload
            $global:config.SkipUpload = $false
            $global:config.Monitor = $false
            Execute-Script ".\compile.ps1" (Build-Arguments)
        }
        "4" {  # Turbo Build + Upload
            $global:config.SkipUpload = $false
            $global:config.Monitor = $false
            Execute-Script ".\fast_compile.ps1" (Build-Arguments)
        }
        "5" {  # Filesystem Only
            $global:config.FilesystemOnly = $true
            $global:config.SkipUpload = $false
            Execute-Script ".\compile.ps1" (Build-Arguments)
            $global:config.FilesystemOnly = $false
        }
        "6" {  # Clean Build
            $global:config.Clean = $true
            $global:config.SkipUpload = $false
            Execute-Script ".\compile.ps1" (Build-Arguments)
            $global:config.Clean = $false
        }
        "7" {  # Serial Monitor
            Write-Host "📺 Starting serial monitor on $($global:config.ComPort)..." -ForegroundColor $colors.Info
            Execute-Script "pio" @("device", "monitor", "--port", $global:config.ComPort, "--baud", "115200")
        }
        "8" {  # Debug Build + Monitor
            $global:config.Verbose = $true
            $global:config.Monitor = $true
            Execute-Script ".\compile.ps1" (Build-Arguments)
            $global:config.Verbose = $false
            $global:config.Monitor = $false
        }
        "9" {  # Start Simulator
            Execute-Script "pio" @("run", "--target", "exec", "--environment", "simulation")
        }
        "10" {  # Device Info
            Show-DeviceInfo
        }
        "11" {  # Configure WiFi
            Execute-Script ".\configure_wifi.ps1"
        }
        "12" {  # Configure Newton M3
            Execute-Script ".\configure_newton_m3.ps1"
        }
        "13" {  # Validate Config
            Execute-Script "python" @(".\validate_config.py")
        }
        "14" {  # Test API Endpoints
            Execute-Script ".\test_api_endpoints.ps1"
        }
        "15" {  # Refresh COM Ports
            Write-Host "🔄 Available COM ports:" -ForegroundColor $colors.Info
            $ports = Get-ComPorts
            $ports | ForEach-Object { Write-Host "   $_" -ForegroundColor $colors.Info }
            Read-Host "Press Enter to continue"
        }
        "16" {  # Open Build Folder
            $buildFolder = $global:config.Environment
            if (Test-Path $buildFolder) {
                Start-Process "explorer.exe" $buildFolder
            } else {
                Write-Host "❌ Build folder not found. Build the project first." -ForegroundColor $colors.Error
                Read-Host "Press Enter to continue"
            }
        }
        "17" {  # Edit Configuration
            Edit-Configuration
        }
        "18" {  # Save/Load Profile
            Write-Host "💾 Profile management not implemented yet." -ForegroundColor $colors.Warning
            Read-Host "Press Enter to continue"
        }
        "19" {  # Open Web UI
            Write-Host "🌐 Opening ESP32 Web UI..." -ForegroundColor $colors.Info
            Start-Process "http://192.168.4.1"
            Read-Host "Press Enter to continue"
        }
        "20" {  # Show Build Log
            Show-BuildLog
        }
        "0" {  # Exit
            Write-Host "👋 Goodbye!" -ForegroundColor $colors.Success
            exit 0
        }
        default {
            Write-Host "❌ Invalid choice. Please select 0-20." -ForegroundColor $colors.Error
            Start-Sleep 2
        }
    }
} while ($true)
