@echo off
echo ESP32-C6 Recovery Script
echo ========================

set PORT=COM11
if not "%1"=="" set PORT=%1

echo Using port: %PORT%

echo.
echo Step 1: Erasing flash completely...
esptool.py --chip esp32c6 --port %PORT% erase_flash
if errorlevel 1 (
    echo Flash erase failed!
    pause
    exit /b 1
)
echo Flash erased successfully!

echo.
echo Step 2: Building ESP32-C6 firmware...
platformio run -e ESP32_C6
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
echo Build completed successfully!

echo.
echo Step 3: Flashing ESP32-C6 firmware...
platformio run -e ESP32_C6 --target upload --upload-port %PORT%
if errorlevel 1 (
    echo Firmware flash failed!
    pause
    exit /b 1
)
echo Firmware flashed successfully!

echo.
echo Recovery completed! Your ESP32-C6 should now boot properly.
echo You can monitor the output with: platformio device monitor --port %PORT%
pause
