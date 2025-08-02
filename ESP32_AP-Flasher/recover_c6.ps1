# ESP32-C6 Recovery Script
# This script will completely erase the flash and reflash the ESP32-C6

Write-Host "ESP32-C6 Recovery Script" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

# Check if port is specified
$port = "COM11"  # Change this to match your port
if ($args.Count -gt 0) {
    $port = $args[0]
}

Write-Host "Using port: $port" -ForegroundColor Yellow

# Set ESP-IDF environment if not already set
if (-not $env:IDF_PATH) {
    $env:IDF_PATH = 'C:\Users\faztrick\esp\v5.3.1\esp-idf'
    Write-Host "Set IDF_PATH to: $env:IDF_PATH" -ForegroundColor Yellow
}

# Step 1: Completely erase the flash
Write-Host "`nStep 1: Erasing flash completely..." -ForegroundColor Cyan
try {
    esptool.py --chip esp32c6 --port $port erase_flash
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Flash erased successfully!" -ForegroundColor Green
    } else {
        Write-Host "Flash erase failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error running esptool: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Build the project for ESP32-C6
Write-Host "`nStep 2: Building ESP32-C6 firmware..." -ForegroundColor Cyan
try {
    platformio run -e ESP32_C6
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Build completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Build failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error building project: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Flash the firmware
Write-Host "`nStep 3: Flashing ESP32-C6 firmware..." -ForegroundColor Cyan
try {
    platformio run -e ESP32_C6 --target upload --upload-port $port
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Firmware flashed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Firmware flash failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error flashing firmware: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`nRecovery completed! Your ESP32-C6 should now boot properly." -ForegroundColor Green
Write-Host "You can monitor the output with: platformio device monitor --port $port" -ForegroundColor Yellow
