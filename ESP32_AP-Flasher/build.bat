@echo off
REM Quick launcher for Enhanced OutdoorAP Build Script
REM Usage: build.bat [options]

title OutdoorAP Enhanced Build Tool

echo.
echo ========================================
echo  Enhanced OutdoorAP Build Tool
echo ========================================
echo.

REM Check if PowerShell is available
powershell -Command "Write-Host 'PowerShell available'" >nul 2>&1
if errorlevel 1 (
    echo Error: PowerShell not found!
    pause
    exit /b 1
)

REM Run the PowerShell script with all arguments
powershell -ExecutionPolicy Bypass -File "compile.ps1" %*

if errorlevel 1 (
    echo.
    echo Build failed! Check the output above for details.
    pause
) else (
    echo.
    echo Build completed successfully!
    timeout /t 3 >nul
)
