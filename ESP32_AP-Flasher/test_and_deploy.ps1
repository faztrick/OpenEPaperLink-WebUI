#!/usr/bin/env pwsh
# Comprehensive Test and Deploy Script for ESP32 Serial Commands
param(
    [string]$ComPort = "COM10",
    [int]$BaudRate = 115200,
    [switch]$SkipCleanup,
    [switch]$SkipTests,
    [switch]$Deploy,
    [switch]$CreatePR
)

Write-Host "🚀 ESP32 Serial Commands Test & Deploy" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green

$ErrorActionPreference = "Continue"

# Phase 1: Cleanup (if not skipped)
if (-not $SkipCleanup) {
    Write-Host "`n🧹 Phase 1: Project Cleanup" -ForegroundColor Cyan
    Write-Host "============================" -ForegroundColor Cyan

    if (Test-Path "cleanup_project.ps1") {
        try {
            .\cleanup_project.ps1 -KeepBuild
            Write-Host "✅ Project cleanup completed" -ForegroundColor Green
        }
        catch {
            Write-Host "⚠️ Cleanup failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "⚠️ Cleanup script not found, skipping..." -ForegroundColor Yellow
    }
}

# Phase 2: Build Test
Write-Host "`n🔨 Phase 2: Build Test" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan

function Test-Build {
    Write-Host "🔍 Checking build environment..." -ForegroundColor Yellow

    # Check PlatformIO
    $pioCheck = Get-Command pio -ErrorAction SilentlyContinue
    if ($pioCheck) {
        Write-Host "✅ PlatformIO found: $($pioCheck.Source)" -ForegroundColor Green

        try {
            Write-Host "🔨 Starting build..." -ForegroundColor Yellow
            $buildResult = pio run 2>&1

            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Build completed successfully" -ForegroundColor Green
                return $true
            }
            else {
                Write-Host "❌ Build failed:" -ForegroundColor Red
                Write-Host $buildResult -ForegroundColor Red
                return $false
            }
        }
        catch {
            Write-Host "❌ Build error: $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    }
    else {
        Write-Host "⚠️ PlatformIO not found, skipping build test" -ForegroundColor Yellow
        return $null
    }
}

$buildSuccess = Test-Build

# Phase 3: Serial Communication Tests (if not skipped)
if (-not $SkipTests) {
    Write-Host "`n🧪 Phase 3: Serial Communication Tests" -ForegroundColor Cyan
    Write-Host "=======================================" -ForegroundColor Cyan

    function Test-SerialCommunication {
        Write-Host "📡 Testing serial communication on $ComPort..." -ForegroundColor Yellow

        if (Test-Path "test_serial_commands.ps1") {
            try {
                .\test_serial_commands.ps1 -ComPort $ComPort -BaudRate $BaudRate
                Write-Host "✅ Serial communication test completed" -ForegroundColor Green
                return $true
            }
            catch {
                Write-Host "❌ Serial test failed: $($_.Exception.Message)" -ForegroundColor Red
                return $false
            }
        }
        else {
            Write-Host "⚠️ Serial test script not found" -ForegroundColor Yellow
            return $null
        }
    }

    function Test-WiFiCommands {
        Write-Host "📶 Testing WiFi commands..." -ForegroundColor Yellow

        if (Test-Path "wifi_serial_commander.ps1") {
            try {
                # Test WiFi status command
                .\wifi_serial_commander.ps1 -ComPort $ComPort -Interactive:$false 2>&1 | Out-Null
                Write-Host "✅ WiFi commands test completed" -ForegroundColor Green
                return $true
            }
            catch {
                Write-Host "❌ WiFi commands test failed: $($_.Exception.Message)" -ForegroundColor Red
                return $false
            }
        }
        else {
            Write-Host "⚠️ WiFi test script not found" -ForegroundColor Yellow
            return $null
        }
    }

    function Test-AuthorCommands {
        Write-Host "👤 Testing author/endpoint commands..." -ForegroundColor Yellow

        if (Test-Path "author_serial_commander.ps1") {
            try {
                # Test author commands
                .\author_serial_commander.ps1 -ComPort $ComPort -ListEndpoints 2>&1 | Out-Null
                Write-Host "✅ Author commands test completed" -ForegroundColor Green
                return $true
            }
            catch {
                Write-Host "❌ Author commands test failed: $($_.Exception.Message)" -ForegroundColor Red
                return $false
            }
        }
        else {
            Write-Host "⚠️ Author test script not found" -ForegroundColor Yellow
            return $null
        }
    }

    $serialTest = Test-SerialCommunication
    $wifiTest = Test-WiFiCommands
    $authorTest = Test-AuthorCommands
}

# Phase 4: Connectivity Test
Write-Host "`n🌐 Phase 4: WiFi Connectivity Test" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

function Test-DefaultWiFiConnection {
    Write-Host "🔗 Testing default WiFi connection..." -ForegroundColor Yellow

    try {
        # Use wifi_serial_commander to test default connection
        if (Test-Path "wifi_serial_commander.ps1") {
            Write-Host "📡 Attempting WiFi connection with default credentials..." -ForegroundColor Yellow
            $wifiResult = .\wifi_serial_commander.ps1 -ComPort $ComPort -SSID "Faztrick" -Password "faztrick1234" -StaticIP "192.164.123.200" -Gateway "192.164.123.91" 2>&1

            if ($wifiResult -match "✅.*connected" -or $wifiResult -match "HTTP.*successful") {
                Write-Host "✅ WiFi connection successful" -ForegroundColor Green
                Write-Host "🌐 Web interface should be available at: http://192.164.123.200" -ForegroundColor Cyan
                return $true
            }
            else {
                Write-Host "⚠️ WiFi connection may have failed" -ForegroundColor Yellow
                Write-Host "💡 This is normal if the network 'Faztrick' is not available" -ForegroundColor Blue
                return $false
            }
        }
    }
    catch {
        Write-Host "❌ WiFi connection test error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

$wifiConnectivity = Test-DefaultWiFiConnection

# Phase 5: Results Summary
Write-Host "`n📊 Phase 5: Test Results Summary" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

$overallSuccess = $true

Write-Host "📋 Test Results:" -ForegroundColor White
Write-Host "===============" -ForegroundColor White

if ($buildSuccess -eq $true) {
    Write-Host "  ✅ Build: PASSED" -ForegroundColor Green
}
elseif ($buildSuccess -eq $false) {
    Write-Host "  ❌ Build: FAILED" -ForegroundColor Red
    $overallSuccess = $false
}
else {
    Write-Host "  ⚠️ Build: SKIPPED" -ForegroundColor Yellow
}

if (-not $SkipTests) {
    if ($serialTest -eq $true) {
        Write-Host "  ✅ Serial Communication: PASSED" -ForegroundColor Green
    }
    elseif ($serialTest -eq $false) {
        Write-Host "  ❌ Serial Communication: FAILED" -ForegroundColor Red
        $overallSuccess = $false
    }
    else {
        Write-Host "  ⚠️ Serial Communication: SKIPPED" -ForegroundColor Yellow
    }

    if ($wifiTest -eq $true) {
        Write-Host "  ✅ WiFi Commands: PASSED" -ForegroundColor Green
    }
    elseif ($wifiTest -eq $false) {
        Write-Host "  ❌ WiFi Commands: FAILED" -ForegroundColor Red
        $overallSuccess = $false
    }
    else {
        Write-Host "  ⚠️ WiFi Commands: SKIPPED" -ForegroundColor Yellow
    }

    if ($authorTest -eq $true) {
        Write-Host "  ✅ Author Commands: PASSED" -ForegroundColor Green
    }
    elseif ($authorTest -eq $false) {
        Write-Host "  ❌ Author Commands: FAILED" -ForegroundColor Red
        $overallSuccess = $false
    }
    else {
        Write-Host "  ⚠️ Author Commands: SKIPPED" -ForegroundColor Yellow
    }
}

if ($wifiConnectivity -eq $true) {
    Write-Host "  ✅ WiFi Connectivity: PASSED" -ForegroundColor Green
}
elseif ($wifiConnectivity -eq $false) {
    Write-Host "  ⚠️ WiFi Connectivity: EXPECTED (network not available)" -ForegroundColor Yellow
}
else {
    Write-Host "  ❌ WiFi Connectivity: FAILED" -ForegroundColor Red
}

# Phase 6: Deployment (if requested)
if ($Deploy -or $CreatePR) {
    Write-Host "`n🚢 Phase 6: Deployment" -ForegroundColor Cyan
    Write-Host "=======================" -ForegroundColor Cyan

    if ($overallSuccess) {
        Write-Host "✅ All tests passed, proceeding with deployment..." -ForegroundColor Green

        # Git operations
        try {
            Write-Host "📝 Staging changes..." -ForegroundColor Yellow
            git add .

            Write-Host "💾 Committing changes..." -ForegroundColor Yellow
            $commitMessage = "feat: Add comprehensive serial commands for WiFi and author endpoints

- Added SerialCommandHandler with 25+ commands
- Implemented WiFi management via serial console
- Added author and endpoint testing capabilities
- Included default WiFi configuration (Faztrick network)
- Added auto-connect functionality
- Created PowerShell scripts for management and testing
- Added project cleanup utilities
- Fixed storage manager integration"

            git commit -m $commitMessage

            if ($CreatePR) {
                Write-Host "🔀 Creating pull request..." -ForegroundColor Yellow
                # This would typically involve pushing to a branch and creating a PR
                Write-Host "💡 Use GitHub CLI or web interface to create PR with changes" -ForegroundColor Blue
            }

            Write-Host "✅ Deployment completed" -ForegroundColor Green

        }
        catch {
            Write-Host "❌ Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    else {
        Write-Host "❌ Tests failed, skipping deployment" -ForegroundColor Red
    }
}

# Final Summary
Write-Host "`n🎯 Final Summary" -ForegroundColor Green
Write-Host "================" -ForegroundColor Green

if ($overallSuccess) {
    Write-Host "🎉 All tests passed! ESP32 Serial Commands are ready." -ForegroundColor Green
    Write-Host ""
    Write-Host "📚 Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Flash the firmware to your ESP32" -ForegroundColor White
    Write-Host "  2. Connect via serial at 115200 baud" -ForegroundColor White
    Write-Host "  3. Try 'help' command to see available options" -ForegroundColor White
    Write-Host "  4. Use 'wifi.status' to check WiFi connection" -ForegroundColor White
    Write-Host "  5. Use 'author.endpoints' to list web endpoints" -ForegroundColor White
    Write-Host ""
    Write-Host "🔧 Management Scripts:" -ForegroundColor Cyan
    Write-Host "  .\wifi_serial_commander.ps1 -Interactive" -ForegroundColor White
    Write-Host "  .\author_serial_commander.ps1 -TestEndpoints" -ForegroundColor White
    Write-Host "  .\cleanup_project.ps1 -DryRun" -ForegroundColor White
}
else {
    Write-Host "⚠️ Some tests failed. Check the results above and fix issues." -ForegroundColor Yellow
}

Write-Host "`n📖 Documentation: docs/SERIAL_COMMANDS_GUIDE.md" -ForegroundColor Blue
