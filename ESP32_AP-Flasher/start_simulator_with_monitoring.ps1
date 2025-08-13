#!/usr/bin/env pwsh
# Wokwi Simulator with Serial Monitoring and C6 Module Testing
# This script starts the simulator and monitors for specific C6 module events

param(
    [string]$Environment = "OutdoorAP",
    [int]$Timeout = 120000,
    [switch]$ShowC6Events,
    [switch]$SaveLog,
    [string]$LogFile = "simulation.log"
)

Write-Host "=== ESP32 AP-Flasher with C6 Module Monitoring ===" -ForegroundColor Green

# Load environment variables
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]*)\s*=\s*(.*)\s*$") {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

$firmwarePath = ".pio\build\$Environment\firmware.elf"

# Build if needed
if (-not (Test-Path $firmwarePath)) {
    Write-Host "Building firmware..." -ForegroundColor Yellow
    & pio run -e $Environment
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# Prepare wokwi arguments
$wokwiArgs = @(
    "--elf", $firmwarePath
    "--diagram-file", "wokwi/diagram.json"
    "--timeout", $Timeout
)

if ($SaveLog) {
    $wokwiArgs += "--serial-log-file", $LogFile
    Write-Host "Serial output will be saved to: $LogFile" -ForegroundColor Cyan
}

Write-Host "Starting simulation with C6 module monitoring..." -ForegroundColor Green
Write-Host ""
Write-Host "Expected C6 Module Initialization Sequence:" -ForegroundColor Cyan
Write-Host "  1. [C6_MODULE] Initializing C6 module support..." -ForegroundColor White
Write-Host "  2. [C6_MODULE] Default configuration set" -ForegroundColor White
Write-Host "  3. [C6_MODULE] Initialization complete" -ForegroundColor White
Write-Host "  4. [C6_MODULE] Starting C6 module..." -ForegroundColor White
Write-Host "  5. [C6_MODULE] C6 module started successfully" -ForegroundColor White
Write-Host ""
Write-Host "Core Utilities Usage:" -ForegroundColor Cyan
Write-Host "  • StorageManager for C6 configuration persistence" -ForegroundColor White
Write-Host "  • SystemInfo for hardware and memory monitoring" -ForegroundColor White
Write-Host "  • LogUtils for structured logging output" -ForegroundColor White
Write-Host "  • CoreUtils for thread-safe operations" -ForegroundColor White
Write-Host ""
Write-Host "Web API Endpoints Available:" -ForegroundColor Cyan
Write-Host "  • GET /api/c6/status - C6 module health and status" -ForegroundColor White
Write-Host "  • POST /api/c6/config - Update C6 configuration" -ForegroundColor White
Write-Host "  • GET /get_ap_config - System configuration with C6 info" -ForegroundColor White
Write-Host ""

if ($ShowC6Events) {
    Write-Host "Monitoring for C6-specific events (use Ctrl+C to stop)..." -ForegroundColor Yellow
    Write-Host ""
}

# Start simulation
& wokwi-cli @wokwiArgs

$exitCode = $LASTEXITCODE
Write-Host ""

switch ($exitCode) {
    0 { Write-Host "✓ Simulation completed successfully" -ForegroundColor Green }
    42 { Write-Host "⏱ Simulation timeout reached" -ForegroundColor Yellow }
    default { Write-Host "✗ Simulation ended with exit code: $exitCode" -ForegroundColor Red }
}

if ($SaveLog -and (Test-Path $LogFile)) {
    Write-Host ""
    Write-Host "Analyzing log for C6 module events..." -ForegroundColor Cyan

    $logContent = Get-Content $LogFile
    $c6Events = $logContent | Select-String "\[C6_MODULE\]|\[CORE_UTILS\]|\[STORAGE\]"

    if ($c6Events.Count -gt 0) {
        Write-Host "Found $($c6Events.Count) C6/Core utility events:" -ForegroundColor Green
        $c6Events | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
    }
    else {
        Write-Host "No C6 module events found in log" -ForegroundColor Yellow
    }
}
