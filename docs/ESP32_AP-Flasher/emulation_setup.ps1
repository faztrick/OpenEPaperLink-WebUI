# ESP32 Emulation Setup and Management Script
# This script helps set up and manage ESP32 emulation for the OpenEPaperLink project

param(
    [Parameter(Position = 0)]
    [ValidateSet("setup", "build", "wokwi", "qemu", "debug", "clean", "help")]
    [string]$Action = "help",

    [Parameter()]
    [string]$Environment = "OutdoorAP",

    [int]$WokwiTimeoutMs = 0,
    [switch]$WokwiInteractive,
    [switch]$WokwiWeb
)

# Configuration
$ProjectRoot = $PSScriptRoot
$BuildDir = Join-Path $ProjectRoot ".pio\build\$Environment"
$FirmwareElf = Join-Path $BuildDir "firmware.elf"
$WokwiDir = Join-Path $ProjectRoot "wokwi"
$WokwiDiagram = Join-Path $WokwiDir "diagram.json"
$TokenFile = Join-Path $ProjectRoot ".wokwi_token"

# Color output functions
function Write-Status($message) {
    Write-Host "[INFO] $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "[WARN] $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

# Check prerequisites
function Test-Prerequisites {
    Write-Status "Checking prerequisites..."

    $missingTools = @()

    # Check PlatformIO
    try {
        $pioVersion = & pio --version 2>$null
        Write-Status "PlatformIO found: $pioVersion"
    }
    catch {
        $missingTools += "PlatformIO CLI"
    }

    # Check for Wokwi CLI (optional)
    try {
        $wokwiVersion = & wokwi-cli --version 2>$null
        Write-Status "Wokwi CLI found: $wokwiVersion"
    }
    catch {
        Write-Warning "Wokwi CLI not found - install for advanced simulation features"
    }

    # Check for QEMU (optional)
    try {
        $qemuVersion = & qemu-system-xtensa --version 2>$null | Select-Object -First 1
        Write-Status "QEMU found: $qemuVersion"
    }
    catch {
        Write-Warning "QEMU not found - install for advanced emulation features"
    }

    # Check for GDB
    $gdbPath = "C:\Users\$env:USERNAME\.platformio\packages\toolchain-xtensa-esp32s3\bin\xtensa-esp32s3-elf-gdb.exe"
    if (Test-Path $gdbPath) {
        Write-Status "ESP32 GDB found: $gdbPath"
    }
    else {
        $missingTools += "ESP32 GDB toolchain"
    }

    if ($missingTools.Count -gt 0) {
        Write-Error "Missing required tools: $($missingTools -join ', ')"
        return $false
    }

    return $true
}

# Setup emulation environment
function Initialize-EmulationSetup {
    Write-Status "Setting up ESP32 emulation environment..."

    if (-not (Test-Prerequisites)) {
        return
    }

    # Create wokwi directory if it doesn't exist
    if (-not (Test-Path $WokwiDir)) {
        New-Item -ItemType Directory -Path $WokwiDir -Force
        Write-Status "Created Wokwi directory: $WokwiDir"
    }

    # Verify diagram.json exists
    if (-not (Test-Path $WokwiDiagram)) {
        Write-Error "Wokwi diagram.json not found. Please ensure wokwi/diagram.json exists."
        return
    }

    Write-Status "ESP32 emulation environment setup complete!"
    Write-Status "Available debug configurations in VS Code:"
    Write-Status "  - PIO Debug (Hardware) - Debug on real hardware"
    Write-Status "  - ESP32 QEMU Emulation - Debug with QEMU emulator"
    Write-Status "  - Wokwi ESP32 Simulator - Debug with Wokwi simulator"
}

# Build firmware for emulation
function Build-Firmware {
    Write-Status "Building firmware for ESP32 emulation..."

    Push-Location $ProjectRoot
    try {
    & pio run -e $Environment
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Build successful!"
            Write-Status "Firmware ELF: $FirmwareElf"
        }
        else {
            Write-Error "Build failed with exit code: $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

# Start Wokwi simulation
function Start-WokwiSimulation {
    Write-Status "Starting Wokwi ESP32 simulation..."

    if (-not (Test-Path $FirmwareElf)) {
        Write-Warning "Firmware not found. Building first..."
        Build-Firmware
    }

    if (-not (Test-Path $WokwiDiagram)) {
        Write-Error "Wokwi diagram not found: $WokwiDiagram"
        return
    }

    try {
        Write-Status "Use VS Code 'Wokwi ESP32 Simulator' debug configuration to debug"

        # If web is forced, open browser and return
        if ($WokwiWeb) {
            Write-Status "Opening Wokwi web interface (forced via -WokwiWeb)..."
            Start-Process "https://wokwi.com/vscode"
            return
        }

        # Prefer Wokwi CLI only if token is available; otherwise open web UI
        $token = $env:WOKWI_CLI_TOKEN
        if (-not $token -and (Test-Path $TokenFile)) {
            try { $token = (Get-Content $TokenFile -Raw).Trim() } catch {}
        }
        if ($token) {
            $env:WOKWI_CLI_TOKEN = $token
            try {
                & wokwi-cli --help > $null 2>&1
                Write-Status "Starting Wokwi CLI simulation..."
                Push-Location $WokwiDir
                try {
                    # Build argument list dynamically
                    $args = @('--diagram-file', 'diagram.json', '--elf', $FirmwareElf)
                    if ($WokwiTimeoutMs -ge 0) { $args += @('--timeout', $WokwiTimeoutMs) }
                    if ($WokwiInteractive) { $args += @('--interactive') }
                    & wokwi-cli @args
                    $exit = $LASTEXITCODE
                    if ($exit -ne 0) {
                        Write-Warning "Wokwi CLI exited with code $exit. Falling back to opening the web interface..."
                        Write-Warning "If this persists, check network/firewall for WebSocket (wss) access and token validity."
                        Start-Process "https://wokwi.com/vscode"
                    }
                }
                finally {
                    Pop-Location
                }
            }
            catch {
                Write-Warning "Wokwi CLI not available; opening Wokwi web interface..."
                Start-Process "https://wokwi.com/vscode"
            }
        }
        else {
            Write-Status "Opening Wokwi web interface (no WOKWI_CLI_TOKEN set)..."
            Start-Process "https://wokwi.com/vscode"
        }
    }
    catch {
        Write-Error "Failed to start Wokwi simulation: $_"
    }
}

# Start QEMU emulation
function Start-QemuEmulation {
    Write-Status "Starting QEMU ESP32 emulation..."

    if (-not (Test-Path $FirmwareElf)) {
        Write-Warning "Firmware not found. Building first..."
        Build-Firmware
    }

    try {
        Write-Status "Starting QEMU ESP32 emulation..."
        Write-Status "GDB will be available on localhost:3333"
        Write-Status "Use VS Code 'ESP32 QEMU Emulation' debug configuration to debug"

        $qemuCmd = @(
            "qemu-system-xtensa",
            "-M", "esp32",
            "-m", "4M",
            "-kernel", $FirmwareElf,
            "-serial", "stdio",
            "-gdb", "tcp::3333",
            "-S"
        )

        & $qemuCmd[0] $qemuCmd[1..($qemuCmd.Length - 1)]
    }
    catch {
        Write-Error "Failed to start QEMU emulation: $_"
        Write-Warning "Make sure QEMU with ESP32 support is installed"
    }
}

# Start debugging session
function Start-DebugSession {
    Write-Status "Starting ESP32 debug session..."
    Write-Status "Available debug configurations:"
    Write-Status "1. Hardware debugging - Connect to real ESP32 device"
    Write-Status "2. QEMU emulation - Full system emulation"
    Write-Status "3. Wokwi simulation - Web-based simulation"
    Write-Status ""
    Write-Status "Open VS Code and use F5 to start debugging with desired configuration"

    # Open VS Code with the project
    try {
        & code $ProjectRoot
    }
    catch {
        Write-Warning "Could not open VS Code automatically. Please open manually."
    }
}

# Clean build artifacts
function Clear-BuildArtifacts {
    Write-Status "Cleaning build artifacts..."

    Push-Location $ProjectRoot
    try {
        & pio run --target clean
        Write-Status "Build artifacts cleaned"
    }
    catch {
        Write-Error "Failed to clean build artifacts: $_"
    }
    finally {
        Pop-Location
    }
}

# Show help
function Show-Help {
    Write-Host @"
ESP32 Emulation Management Script

Usage: .\emulation_setup.ps1 [action] [-Environment OutdoorAP] [-Verbose]

Actions:
  setup   - Set up emulation environment and check prerequisites
  build   - Build firmware for emulation
  wokwi   - Start Wokwi ESP32 simulation
  qemu    - Start QEMU ESP32 emulation
  debug   - Open VS Code for debugging
  clean   - Clean build artifacts
  help    - Show this help message

Examples:
    .\emulation_setup.ps1 setup
    .\emulation_setup.ps1 build -Environment OutdoorAP
    .\emulation_setup.ps1 wokwi -Environment OutdoorAP
  .\emulation_setup.ps1 qemu
  .\emulation_setup.ps1 debug

For debugging:
1. Run: .\emulation_setup.ps1 setup
2. Run: .\emulation_setup.ps1 build
3. Run: .\emulation_setup.ps1 debug
4. In VS Code, press F5 and select desired debug configuration

Prerequisites:
- PlatformIO CLI
- VS Code with PlatformIO extension
- Wokwi extension (optional, for web simulation)
- QEMU with ESP32 support (optional, for system emulation)

"@ -ForegroundColor Cyan
}

# Main execution
switch ($Action.ToLower()) {
    "setup" { Initialize-EmulationSetup }
    "build" { Build-Firmware }
    "wokwi" { Start-WokwiSimulation }
    "qemu" { Start-QemuEmulation }
    "debug" { Start-DebugSession }
    "clean" { Clear-BuildArtifacts }
    "help" { Show-Help }
    default { Show-Help }
}

# REMOVED: replaced by emulation_setup.py
# Original PowerShell removed in favor of a cross-platform Python script.
# See ESP32_AP-Flasher/emulation_setup.py
