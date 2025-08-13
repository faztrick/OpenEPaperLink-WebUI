#!/usr/bin/env pwsh
# ========================================================================
# ESP32 Development UI Launcher
# Choose between different UI interfaces for ESP32 development
# ========================================================================

$ErrorActionPreference = "Stop"

# Colors
$colors = @{
    Header    = "Cyan"
    Success   = "Green"
    Warning   = "Yellow"
    Error     = "Red"
    Info      = "White"
    Highlight = "Yellow"
}

function Show-Header {
    Clear-Host
    Write-Host @"
╔════════════════════════════════════════════════════════════════╗
║               🚀 ESP32 OutdoorAP Development Suite 🚀          ║
║                        UI Launcher v1.0                       ║
╚════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor $colors.Header
    Write-Host ""
}

function Show-ProjectInfo {
    Write-Host "📡 Project: " -NoNewline -ForegroundColor $colors.Info
    Write-Host "OpenEPaperLink ESP32 AP-Flasher" -ForegroundColor $colors.Highlight
    Write-Host "🎯 Target: " -NoNewline -ForegroundColor $colors.Info
    Write-Host "ESP32-S3 DevKit C-1 (OutdoorAP)" -ForegroundColor $colors.Highlight
    Write-Host "💾 Features: " -NoNewline -ForegroundColor $colors.Info
    Write-Host "WiFi, BLE, SubGHz, E-Paper Control" -ForegroundColor $colors.Highlight
    Write-Host ""

    # Check if build files exist
    if (Test-Path ".pio\build\OutdoorAP") {
        $lastBuild = (Get-ChildItem ".pio\build\OutdoorAP" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
        Write-Host "✅ Last Build: " -NoNewline -ForegroundColor $colors.Success
        Write-Host $lastBuild.ToString('yyyy-MM-dd HH:mm:ss') -ForegroundColor $colors.Info
    }
    else {
        Write-Host "⚠️  No builds found - " -NoNewline -ForegroundColor $colors.Warning
        Write-Host "Run a build first" -ForegroundColor $colors.Info
    }

    # Check COM ports
    try {
        $ports = Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match "COM\d+" } |
        ForEach-Object { if ($_.Caption -match "(COM\d+)") { $Matches[1] } } | Sort-Object
        if ($ports) {
            Write-Host "📱 COM Ports: " -NoNewline -ForegroundColor $colors.Success
            Write-Host ($ports -join ", ") -ForegroundColor $colors.Info
        }
    }
    catch {
        Write-Host "📱 COM Ports: " -NoNewline -ForegroundColor $colors.Warning
        Write-Host "Unable to detect" -ForegroundColor $colors.Info
    }
    Write-Host ""
}

function Show-Menu {
    Write-Host "🖥️  DEVELOPMENT INTERFACES:" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "   1) 📋 Console Menu (Fast)" -ForegroundColor $colors.Success
    Write-Host "      • Terminal-based interactive menu" -ForegroundColor $colors.Info
    Write-Host "      • Fast loading, keyboard navigation" -ForegroundColor $colors.Info
    Write-Host "      • All build, flash, and config options" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "   2) 🖼️  GUI Interface (Full-Featured)" -ForegroundColor $colors.Success
    Write-Host "      • Modern WPF graphical interface" -ForegroundColor $colors.Info
    Write-Host "      • Real-time output, progress bars" -ForegroundColor $colors.Info
    Write-Host "      • Point-and-click operation" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "🔧 DIRECT ACTIONS:" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "   3) ⚡ Quick Build + Upload" -ForegroundColor $colors.Warning
    Write-Host "   4) 🔨 Build Only (No Upload)" -ForegroundColor $colors.Info
    Write-Host "   5) 📤 Upload Only (No Build)" -ForegroundColor $colors.Info
    Write-Host "   6) ⚡ Turbo Mode (Fast Compile)" -ForegroundColor $colors.Warning
    Write-Host "   7) 📺 Serial Monitor" -ForegroundColor $colors.Info
    Write-Host "   8) 🧹 Clean Build" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "⚙️  CONFIGURATION:" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "   9) 📶 Configure WiFi" -ForegroundColor $colors.Info
    Write-Host "  10) ⚙️  Configure Newton M3" -ForegroundColor $colors.Info
    Write-Host "  11) 🌐 Open Web UI (192.168.4.1)" -ForegroundColor $colors.Info
    Write-Host ""
    Write-Host "   0) ❌ Exit" -ForegroundColor $colors.Error
    Write-Host ""
}

function Get-ComPort {
    try {
        $ports = Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match "COM\d+" } |
        ForEach-Object { if ($_.Caption -match "(COM\d+)") { $Matches[1] } } | Sort-Object
        return $ports | Where-Object { $_ -match "COM1[0-9]" } | Select-Object -First 1
    }
    catch {
        return "COM10"
    }
}

function Execute-Action {
    param([string]$ScriptPath, [array]$Arguments = @())

    Write-Host ""
    Write-Host "⚡ Executing: " -NoNewline -ForegroundColor $colors.Info
    Write-Host "$ScriptPath $($Arguments -join ' ')" -ForegroundColor $colors.Highlight
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $colors.Header

    try {
        if (Test-Path $ScriptPath) {
            $timer = [System.Diagnostics.Stopwatch]::StartNew()
            & $ScriptPath @Arguments
            $timer.Stop()

            Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $colors.Header
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Completed in $([math]::Round($timer.ElapsedMilliseconds/1000, 1))s" -ForegroundColor $colors.Success
            }
            else {
                Write-Host "❌ Failed with exit code: $LASTEXITCODE" -ForegroundColor $colors.Error
            }
        }
        else {
            Write-Host "❌ Script not found: $ScriptPath" -ForegroundColor $colors.Error
        }
    }
    catch {
        Write-Host "❌ Error: $_" -ForegroundColor $colors.Error
    }

    Write-Host ""
    Read-Host "Press Enter to continue"
}

# Main launcher loop
do {
    Show-Header
    Show-ProjectInfo
    Show-Menu

    $choice = Read-Host "Select option (0-11)"

    switch ($choice) {
        "1" {
            # Console Menu
            if (Test-Path ".\dev_menu.ps1") {
                & ".\dev_menu.ps1"
            }
            else {
                Write-Host "❌ dev_menu.ps1 not found!" -ForegroundColor $colors.Error
                Read-Host "Press Enter to continue"
            }
        }
        "2" {
            # GUI Interface
            if (Test-Path ".\esp32_dev_ui.ps1") {
                Write-Host "🖼️  Loading GUI interface..." -ForegroundColor $colors.Info
                & ".\esp32_dev_ui.ps1"
            }
            else {
                Write-Host "❌ esp32_dev_ui.ps1 not found!" -ForegroundColor $colors.Error
                Read-Host "Press Enter to continue"
            }
        }
        "3" {
            # Quick Build + Upload
            $comPort = Get-ComPort
            Execute-Action ".\compile.ps1" @("-Environment", "OutdoorAP", "-ComPort", $comPort, "-FastBuild")
        }
        "4" {
            # Build Only
            Execute-Action ".\compile.ps1" @("-Environment", "OutdoorAP", "-SkipUpload", "-FastBuild")
        }
        "5" {
            # Upload Only
            $comPort = Get-ComPort
            Execute-Action ".\compile.ps1" @("-Environment", "OutdoorAP", "-ComPort", $comPort, "-SkipBuild")
        }
        "6" {
            # Turbo Mode
            $comPort = Get-ComPort
            Execute-Action ".\fast_compile.ps1" @("-Environment", "OutdoorAP", "-ComPort", $comPort)
        }
        "7" {
            # Serial Monitor
            $comPort = Get-ComPort
            Write-Host "📺 Starting serial monitor on $comPort..." -ForegroundColor $colors.Info
            Execute-Action "pio" @("device", "monitor", "--port", $comPort, "--baud", "115200")
        }
        "8" {
            # Clean Build
            Execute-Action ".\compile.ps1" @("-Environment", "OutdoorAP", "-Clean", "-SkipUpload")
        }
        "9" {
            # Configure WiFi
            Execute-Action ".\configure_wifi.ps1"
        }
        "10" {
            # Configure Newton M3
            Execute-Action ".\configure_newton_m3.ps1"
        }
        "11" {
            # Open Web UI
            Write-Host "🌐 Opening ESP32 Web UI..." -ForegroundColor $colors.Info
            Start-Process "http://192.168.4.1"
            Read-Host "Press Enter to continue"
        }
        "0" {
            # Exit
            Write-Host ""
            Write-Host "👋 Thanks for using ESP32 Development Suite!" -ForegroundColor $colors.Success
            Write-Host "🚀 Happy coding!" -ForegroundColor $colors.Info
            exit 0
        }
        default {
            Write-Host "❌ Invalid choice. Please select 0-11." -ForegroundColor $colors.Error
            Start-Sleep 2
        }
    }
} while ($true)
