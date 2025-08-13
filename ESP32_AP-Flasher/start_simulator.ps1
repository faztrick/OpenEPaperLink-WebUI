#!/usr/bin/env pwsh
# Wokwi Simulator Launcher with C6 Support
# This script sets up the environment and starts the Wokwi simulator

param(
    [string]$Environment = "OutdoorAP",
    [int]$Timeout = 60000,
    [switch]$Interactive,
    [switch]$Help
)

if ($Help) {
    Write-Host "Wokwi Simulator Launcher" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\start_simulator.ps1 [-Environment <env>] [-Timeout <ms>] [-Interactive] [-Help]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -Environment  Build environment (OutdoorAP, WokwiAP) [default: OutdoorAP]"
    Write-Host "  -Timeout      Simulation timeout in milliseconds [default: 60000]"
    Write-Host "  -Interactive  Enable interactive mode (stdin to serial)"
    Write-Host "  -Help         Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\start_simulator.ps1"
    Write-Host "  .\start_simulator.ps1 -Environment WokwiAP -Timeout 120000"
    Write-Host "  .\start_simulator.ps1 -Interactive"
    exit 0
}

Write-Host "=== ESP32 AP-Flasher Wokwi Simulator ===" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Timeout: $Timeout ms" -ForegroundColor Yellow

# Load environment variables from .env file if it exists
if (Test-Path ".env") {
    Write-Host "Loading environment from .env file..." -ForegroundColor Cyan
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]*)\s*=\s*(.*)\s*$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
            Write-Host "  Set $name" -ForegroundColor Gray
        }
    }
}

# Check if WOKWI_CLI_TOKEN is set
if (-not $env:WOKWI_CLI_TOKEN) {
    Write-Host "Error: WOKWI_CLI_TOKEN not found!" -ForegroundColor Red
    Write-Host "Please set your Wokwi token in the .env file or environment." -ForegroundColor Yellow
    Write-Host "Get your token from: https://wokwi.com/dashboard/ci" -ForegroundColor Cyan
    exit 1
}

# Check if firmware exists
$firmwarePath = ".pio\build\$Environment\firmware.elf"
if (-not (Test-Path $firmwarePath)) {
    Write-Host "Firmware not found: $firmwarePath" -ForegroundColor Red
    Write-Host "Building firmware for $Environment..." -ForegroundColor Yellow

    $buildResult = & pio run -e $Environment
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed! Please check the build output above." -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path $firmwarePath)) {
        Write-Host "Build completed but firmware file not found!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Using firmware: $firmwarePath" -ForegroundColor Green

# Build Wokwi command
$wokwiArgs = @(
    "--elf", $firmwarePath
    "--diagram-file", "wokwi/diagram.json"
    "--timeout", $Timeout
)

if ($Interactive) {
    $wokwiArgs += "--interactive"
    Write-Host "Interactive mode enabled - stdin will be redirected to serial" -ForegroundColor Cyan
}

# Check for diagram file
if (-not (Test-Path "wokwi/diagram.json")) {
    Write-Host "Error: Diagram file not found: wokwi/diagram.json" -ForegroundColor Red
    exit 1
}

Write-Host "Starting Wokwi simulator..." -ForegroundColor Green
Write-Host "Command: wokwi-cli $($wokwiArgs -join ' ')" -ForegroundColor Gray
Write-Host ""
Write-Host "Simulator Features:" -ForegroundColor Cyan
Write-Host "  • ESP32-S3 main controller with 32MB flash, 8MB PSRAM" -ForegroundColor White
Write-Host "  • ESP32-C6 module for RF communication (pins 47/48)" -ForegroundColor White
Write-Host "  • RGB LEDs on pins 16, 17, 18" -ForegroundColor White
Write-Host "  • IR receiver on pin 4" -ForegroundColor White
Write-Host "  • External SPI flash on pins 10-13" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop simulation" -ForegroundColor Yellow
Write-Host ""

# Start the simulator
try {
    & wokwi-cli @wokwiArgs
    $exitCode = $LASTEXITCODE

    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "Simulation completed successfully" -ForegroundColor Green
    }
    elseif ($exitCode -eq 42) {
        Write-Host "Simulation timeout reached" -ForegroundColor Yellow
    }
    else {
        Write-Host "Simulation ended with exit code: $exitCode" -ForegroundColor Red
    }
}
catch {
    Write-Host "Error starting simulator: $_" -ForegroundColor Red
    exit 1
}
