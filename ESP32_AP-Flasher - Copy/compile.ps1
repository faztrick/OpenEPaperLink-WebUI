
#!/usr/bin/env pwsh
# ========================================================================
# Enhanced OutdoorAP Automated Build & Upload Script
# Optimized for fast, reliable builds with advanced features
# ========================================================================

param(
    [string]$Environment = "OutdoorAP",
    [string]$ComPort = "COM10",
    [int]$BaudRate = 921600,
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [switch]$Monitor,
    [switch]$Clean,
    [switch]$Verbose,
    [switch]$FilesystemOnly
)

# Configuration
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Colors for enhanced output
$Colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Progress = "Magenta"
}

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    $fgColor = if ($Colors.ContainsKey($Color)) { $Colors[$Color] } else { "White" }
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $Message" -ForegroundColor $fgColor
}

function Test-ComPort {
    param([string]$Port)
    try {
        $portInfo = Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match $Port }
        return $null -ne $portInfo
    }
    catch { return $false }
}

function Get-AvailableComPorts {
    Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match "COM\d+" } | 
        ForEach-Object { 
            if ($_.Caption -match "(COM\d+)") { $Matches[1] }
        }
}

# Header
Write-ColorOutput "🚀 Enhanced OutdoorAP Build & Flash Tool v2.0" "Info"
Write-ColorOutput "Environment: $Environment | Port: $ComPort | Baud: $BaudRate" "Info"
if ($FilesystemOnly) {
    Write-ColorOutput "Mode: Filesystem Only (Build + Erase + Upload)" "Warning"
}
Write-ColorOutput "========================================" "Info"

# Validate COM port
if (-not (Test-ComPort $ComPort)) {
    Write-ColorOutput "⚠️  Warning: COM port $ComPort not found!" "Warning"
    $availablePorts = Get-AvailableComPorts
    if ($availablePorts) {
        Write-ColorOutput "Available ports: $($availablePorts -join ', ')" "Warning"
        $ComPort = $availablePorts | Where-Object { $_ -match "COM1[0-9]" } | Select-Object -First 1
        if ($ComPort) {
            Write-ColorOutput "Auto-selecting: $ComPort" "Info"
        }
    }
}

# Validate environment exists
$pioConfigPath = "platformio.ini"
if (-not (Test-Path $pioConfigPath)) {
    Write-ColorOutput "❌ platformio.ini not found!" "Error"
    exit 1
}

$configContent = Get-Content $pioConfigPath -Raw
if ($configContent -notmatch "\[env:$Environment\]") {
    Write-ColorOutput "❌ Environment '$Environment' not found in platformio.ini!" "Error"
    exit 1
}

# Set build timestamp and version
$env:BUILD_TIME = [int64](Get-Date -UFormat %s)
$env:BUILD_VERSION = if ($env:GITHUB_REF_NAME) { $env:GITHUB_REF_NAME } else { "dev-$(Get-Date -Format 'yyyyMMdd-HHmm')" }
$env:SHA = if ($env:GITHUB_SHA) { $env:GITHUB_SHA } else { "local-build" }

Write-ColorOutput "📦 Build Version: $env:BUILD_VERSION" "Info"

# Clean if requested
if ($Clean) {
    Write-ColorOutput "🧹 Cleaning build directory..." "Progress"
    Remove-Item -Recurse -Force ".pio" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "$Environment" -ErrorAction SilentlyContinue
}

# Step 1: Prepare web files
if (-not $SkipBuild) {
    Write-ColorOutput "WEB Compressing web files..." "Progress"
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    
    try {
        python gzip_wwwfiles.py
        $timer.Stop()
        Write-ColorOutput "SUCCESS Web files compressed in $($timer.ElapsedMilliseconds)ms" "Success"
    }
    catch {
        Write-ColorOutput "ERROR Failed to compress web files: $_" "Error"
        exit 1
    }

    # Step 2: Build firmware or filesystem only
    if ($FilesystemOnly) {
        Write-ColorOutput "BUILD Building filesystem only for $Environment..." "Progress"
        $buildTimer = [System.Diagnostics.Stopwatch]::StartNew()
        
        $pioPath = Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio'
        if (-not (Test-Path $pioPath)) {
            $pioPath = "pio"  # Try global installation
        }
        
        try {
            # Build filesystem only
            Write-ColorOutput "  ├─ Building filesystem..." "Progress"
            & $pioPath run --target buildfs --environment $Environment
            if ($LASTEXITCODE -ne 0) { throw "Filesystem build failed" }
            
            $buildTimer.Stop()
            Write-ColorOutput "✅ Filesystem build completed in $([math]::Round($buildTimer.ElapsedMilliseconds/1000, 1))s" "Success"
        }
        catch {
            Write-ColorOutput "❌ Filesystem build failed: $_" "Error"
            exit 1
        }
    } else {
        Write-ColorOutput "BUILD Building firmware for $Environment..." "Progress"
        $buildTimer = [System.Diagnostics.Stopwatch]::StartNew()
        
        $pioPath = Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio'
        if (-not (Test-Path $pioPath)) {
            $pioPath = "pio"  # Try global installation
        }
        
        try {
            # Build main firmware
            Write-ColorOutput "  ├─ Compiling firmware..." "Progress"
            & $pioPath run --environment $Environment --jobs 4
            if ($LASTEXITCODE -ne 0) { throw "Firmware build failed" }
            
            # Build filesystem
            Write-ColorOutput "  ├─ Building filesystem..." "Progress"
            & $pioPath run --target buildfs --environment $Environment
            if ($LASTEXITCODE -ne 0) { throw "Filesystem build failed" }
            
            $buildTimer.Stop()
            Write-ColorOutput "✅ Build completed in $([math]::Round($buildTimer.ElapsedMilliseconds/1000, 1))s" "Success"
        }
        catch {
            Write-ColorOutput "❌ Build failed: $_" "Error"
            exit 1
        }
    }
}

# Step 3: Prepare binary files
Write-ColorOutput "📁 Organizing binary files..." "Progress"

# Create output directory
$outputDir = $Environment
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

# Define file paths
$buildPath = ".pio\build\$Environment"
$frameworkPath = "$env:USERPROFILE\.platformio\packages\framework-arduinoespressif32\tools\partitions"

$files = @{
    "boot_app0.bin" = "$frameworkPath\boot_app0.bin"
    "firmware.bin" = "$buildPath\firmware.bin"
    "bootloader.bin" = "$buildPath\bootloader.bin"
    "partitions.bin" = "$buildPath\partitions.bin"
    "littlefs.bin" = "$buildPath\littlefs.bin"
}

# Copy files with verification
foreach ($file in $files.GetEnumerator()) {
    $dest = Join-Path $outputDir $file.Key
    if (Test-Path $file.Value) {
        Copy-Item $file.Value $dest -Force
        $size = [math]::Round((Get-Item $dest).Length / 1KB, 1)
        Write-ColorOutput "  ├─ $($file.Key): ${size}KB" "Info"
    } else {
        Write-ColorOutput "  ├─ ⚠️  Missing: $($file.Key)" "Warning"
    }
}

# Step 4: Create merged firmware
Write-ColorOutput "MERGE Creating merged firmware..." "Progress"
Push-Location $outputDir

try {
    # Determine flash configuration based on environment
    $flashConfig = switch ($Environment) {
        "OutdoorAP" { 
            @{
                chip = "esp32-s3"
                mode = "qio"
                freq = "80m"
                size = "32MB"
                addresses = @{
                    "0x0000" = "bootloader.bin"
                    "0x8000" = "partitions.bin"
                    "0xe000" = "boot_app0.bin"
                    "0x10000" = "firmware.bin"
                    "0x00910000" = "littlefs.bin"
                }
            }
        }
        default { 
            @{
                chip = "esp32-s3"
                mode = "qio"
                freq = "80m"
                size = "16MB"
                addresses = @{
                    "0x0000" = "bootloader.bin"
                    "0x8000" = "partitions.bin"
                    "0xe000" = "boot_app0.bin"
                    "0x10000" = "firmware.bin"
                    "0x00910000" = "littlefs.bin"
                }
            }
        }
    }
    
    # Build merge command
    $mergeArgs = @(
        "--chip", $flashConfig.chip
        "merge_bin"
        "-o", "merged-firmware.bin"
        "--flash_mode", $flashConfig.mode
        "--flash_freq", $flashConfig.freq
        "--flash_size", $flashConfig.size
    )
    
    foreach ($addr in $flashConfig.addresses.GetEnumerator()) {
        if (Test-Path $addr.Value) {
            $mergeArgs += $addr.Key, $addr.Value
        }
    }
    
    python -m esptool @mergeArgs
    
    if (Test-Path "merged-firmware.bin") {
        $mergedSize = [math]::Round((Get-Item "merged-firmware.bin").Length / 1MB, 1)
        Write-ColorOutput "✅ Merged firmware created: ${mergedSize}MB" "Success"
    }
}
catch {
    Write-ColorOutput "❌ Failed to create merged firmware: $_" "Error"
}
finally {
    Pop-Location
}

# Step 5: Copy to espbinaries
Write-ColorOutput "💾 Copying to espbinaries..." "Progress"
if (-not (Test-Path "espbinaries")) {
    New-Item -ItemType Directory -Path "espbinaries" | Out-Null
}

Copy-Item "$outputDir\firmware.bin" "espbinaries\$Environment.bin" -Force
if (Test-Path "$outputDir\merged-firmware.bin") {
    Copy-Item "$outputDir\merged-firmware.bin" "espbinaries\${Environment}_full.bin" -Force
}

# Step 6: Upload firmware
if (-not $SkipUpload) {
    if ($FilesystemOnly) {
        Write-ColorOutput "📤 Erasing and uploading filesystem only to $ComPort..." "Progress"
        $uploadTimer = [System.Diagnostics.Stopwatch]::StartNew()
        
        try {
            # Get filesystem partition address based on environment
            $filesystemAddress = switch ($Environment) {
                "OutdoorAP" { "0x00910000" }
                default { "0x00910000" }
            }
            
            $littlefsPath = Join-Path $outputDir "littlefs.bin"
            if (-not (Test-Path $littlefsPath)) {
                throw "Filesystem binary not found: $littlefsPath"
            }
            
            Write-ColorOutput "  ├─ Connecting to device..." "Progress"
            Write-ColorOutput "  ├─ Erasing filesystem partition..." "Progress"
            
            # Erase filesystem partition first
            $eraseArgs = @(
                "-p", $ComPort
                "-b", $BaudRate
                "--before", "default_reset"
                "--after", "no_reset"
                "--chip", $flashConfig.chip
                "erase_region"
                $filesystemAddress
                "0x6F0000"  # Size of filesystem partition (7MB)
            )
            
            python -m esptool @eraseArgs
            if ($LASTEXITCODE -ne 0) { throw "Filesystem erase failed" }
            
            Write-ColorOutput "  ├─ Uploading filesystem..." "Progress"
            
            # Upload filesystem
            $uploadArgs = @(
                "-p", $ComPort
                "-b", $BaudRate
                "--before", "no_reset"
                "--after", "hard_reset"
                "--chip", $flashConfig.chip
                "write_flash"
                "--flash_mode", $flashConfig.mode
                "--flash_size", "detect"
                $filesystemAddress, $littlefsPath
            )
            
            python -m esptool @uploadArgs
            if ($LASTEXITCODE -ne 0) { throw "Filesystem upload failed" }
            
            $uploadTimer.Stop()
            Write-ColorOutput "✅ Filesystem erase and upload completed in $([math]::Round($uploadTimer.ElapsedMilliseconds/1000, 1))s" "Success"
            
            # Monitor if requested
            if ($Monitor) {
                Write-ColorOutput "� Starting serial monitor..." "Info"
                Start-Sleep 2  # Wait for device to reset
                & $pioPath device monitor --port $ComPort --baud 115200
            }
        }
        catch {
            Write-ColorOutput "❌ Filesystem upload failed: $_" "Error"
            Write-ColorOutput "💡 Troubleshooting tips:" "Info"
            Write-ColorOutput "  - Check COM port connection" "Info"
            Write-ColorOutput "  - Hold BOOT button during upload" "Info"
            Write-ColorOutput "  - Try lower baud rate: --BaudRate 460800" "Info"
            exit 1
        }
    } else {
        Write-ColorOutput "�📤 Uploading firmware to $ComPort..." "Progress"
        $uploadTimer = [System.Diagnostics.Stopwatch]::StartNew()
        
        try {
            # Build upload arguments
            $uploadArgs = @(
                "-p", $ComPort
                "-b", $BaudRate
                "--before", "default_reset"
                "--after", "hard_reset"
                "--chip", $flashConfig.chip
                "write_flash"
                "--flash_mode", $flashConfig.mode
                "--flash_size", "detect"
            )
            
            # Add file addresses
            foreach ($addr in $flashConfig.addresses.GetEnumerator()) {
                $filePath = Join-Path $outputDir $addr.Value
                if (Test-Path $filePath) {
                    $uploadArgs += $addr.Key, $filePath
                }
            }
            
            Write-ColorOutput "  ├─ Connecting to device..." "Progress"
            python -m esptool @uploadArgs
            
            $uploadTimer.Stop()
            Write-ColorOutput "✅ Upload completed in $([math]::Round($uploadTimer.ElapsedMilliseconds/1000, 1))s" "Success"
            
            # Monitor if requested
            if ($Monitor) {
                Write-ColorOutput "📺 Starting serial monitor..." "Info"
                Start-Sleep 2  # Wait for device to reset
                & $pioPath device monitor --port $ComPort --baud 115200
            }
        }
        catch {
            Write-ColorOutput "❌ Upload failed: $_" "Error"
            Write-ColorOutput "💡 Troubleshooting tips:" "Info"
            Write-ColorOutput "  - Check COM port connection" "Info"
            Write-ColorOutput "  - Hold BOOT button during upload" "Info"
            Write-ColorOutput "  - Try lower baud rate: --BaudRate 460800" "Info"
            exit 1
        }
    }
}

# Summary
Write-ColorOutput "========================================" "Info"
if ($FilesystemOnly) {
    Write-ColorOutput "SUCCESS Filesystem Build, Erase & Upload Complete!" "Success"
} else {
    Write-ColorOutput "SUCCESS OutdoorAP Build and Flash Complete!" "Success"
}
if (Test-Path "$outputDir\firmware.bin") {
    $firmwareSize = [math]::Round((Get-Item "$outputDir\firmware.bin").Length / 1MB, 1)
    Write-ColorOutput "📊 Firmware size: ${firmwareSize}MB" "Info"
}
if (Test-Path "$outputDir\littlefs.bin") {
    $filesystemSize = [math]::Round((Get-Item "$outputDir\littlefs.bin").Length / 1MB, 1)
    Write-ColorOutput "📁 Filesystem size: ${filesystemSize}MB" "Info"
}
Write-ColorOutput "📍 Files location: $outputDir\" "Info"
Write-ColorOutput "🌐 Access at: http://192.168.4.1" "Info"
Write-ColorOutput "========================================" "Info"