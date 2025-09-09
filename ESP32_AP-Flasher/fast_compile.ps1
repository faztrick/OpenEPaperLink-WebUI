#!/usr/bin/env pwsh
# ========================================================================
# Fast ESP32 Compilation Script - Optimized for Speed
# This is the speed-optimized version of compile.ps1
# ========================================================================

param(
    [string]$Environment = "OutdoorAP",
    [string]$ComPort = "COM10",
    [int]$BaudRate = 921600,
    [string]$FlashSize = "detect",
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [switch]$Monitor,
    [switch]$Clean,
    [switch]$FilesystemOnly,
    [switch]$AutoVenv
)

# Auto-detect and optionally bootstrap Python virtual environment
$scriptRoot = $PSScriptRoot
$venvPython = Join-Path $scriptRoot '.venv/Scripts/python.exe'
if (Test-Path $venvPython) {
    $env:PATH = (Join-Path $scriptRoot '.venv/Scripts'); $env:PATH += ";" + $env:PATH
    Write-Host "[fast_compile] Using venv python: $venvPython" -ForegroundColor DarkCyan
}
elseif ($AutoVenv) {
    Write-Host "[fast_compile] Creating virtual environment (.venv) ..." -ForegroundColor DarkCyan
    python -m venv (Join-Path $scriptRoot '.venv')
    & $venvPython -m pip install --upgrade pip
    if (Test-Path (Join-Path $scriptRoot 'requirements.txt')) { & $venvPython -m pip install -r (Join-Path $scriptRoot 'requirements.txt') }
    Write-Host "[fast_compile] Virtual environment ready." -ForegroundColor DarkCyan
    $env:PATH = (Join-Path $scriptRoot '.venv/Scripts'); $env:PATH += ";" + $env:PATH
}

# Fast build configuration
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Ensure we run relative paths from the script directory
try { Set-Location -Path $PSScriptRoot } catch {}

# Set build cache environment variables for faster builds
$env:PLATFORMIO_BUILD_CACHE_DIR = ".pio\build_cache"
$env:PLATFORMIO_LIBDEPS_CACHE_DIR = ".pio\libdeps_cache"
$env:PLATFORMIO_CORE_DIR = "$env:USERPROFILE\.platformio"

# Optimize job count (use more aggressive parallelization)
$cpuCores = [Environment]::ProcessorCount
$jobCount = [Math]::Min(24, $cpuCores * 3)  # 3x CPU cores for I/O bound tasks

# Colors for output
$Colors = @{
    Success  = "Green"
    Warning  = "Yellow"
    Error    = "Red"
    Info     = "Cyan"
    Progress = "Magenta"
}

function Write-FastOutput {
    param([string]$Message, [string]$Color = "White")
    $fgColor = if ($Colors.ContainsKey($Color)) { $Colors[$Color] } else { "White" }
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $Message" -ForegroundColor $fgColor
}

# Header
Write-FastOutput "⚡ FAST ESP32 Build Tool - Maximum Speed Mode" "Info"
Write-FastOutput "Environment: $Environment | Jobs: $jobCount | Mode: TURBO" "Info"
Write-FastOutput "========================================" "Info"

# Attempt to gracefully stop running web-ui server before flashing (optional)
try {
    Write-FastOutput "🔌 Checking for running web-ui server (localhost:3000)..." "Progress"
    $shutdownResp = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/shutdown" -TimeoutSec 2 -ErrorAction Stop
    Write-FastOutput "🛑 Requested web-ui shutdown: $($shutdownResp.message)" "Info"
    Start-Sleep 2
}
catch {
    Write-FastOutput "ℹ️ No active web-ui server to stop (or request failed)" "Warning"
}

# Get PlatformIO path
$pioPath = Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio'
if (-not (Test-Path $pioPath)) {
    $pioPath = "pio"
}

# Clean if requested (parallel cleanup)
if ($Clean) {
    Write-FastOutput "🧹 Fast cleanup..." "Progress"
    $cleanJobs = @()
    $cleanJobs += Start-Job { Remove-Item -Recurse -Force ".pio" -ErrorAction SilentlyContinue }
    $cleanJobs += Start-Job { Remove-Item -Recurse -Force "OutdoorAP" -ErrorAction SilentlyContinue }
    $cleanJobs | Wait-Job | Out-Null
    $cleanJobs | Remove-Job
    Write-FastOutput "✅ Cleanup complete" "Success"
}

# Fast web file check and compression
if (-not $SkipBuild) {
    Write-FastOutput "⚡ Processing web files..." "Progress"
    $webTimer = [System.Diagnostics.Stopwatch]::StartNew()

    # Quick check if compression is needed
    $needsCompression = $true
    $dataWwwPath = "data\www"
    $compressedPath = "data\www_compressed"

    if ((Test-Path $dataWwwPath) -and (Test-Path $compressedPath)) {
        $sourceTime = (Get-ChildItem $dataWwwPath -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
        $compressedTime = (Get-ChildItem $compressedPath -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime

        if ($compressedTime -gt $sourceTime) {
            $needsCompression = $false
        }
    }

    if ($needsCompression) {
        python gzip_wwwfiles.py
    }

    $webTimer.Stop()
    Write-FastOutput "✅ Web files ready ($($webTimer.ElapsedMilliseconds)ms)" "Success"

    # Ultra-fast build
    Write-FastOutput "⚡ TURBO BUILD Starting..." "Progress"
    $buildTimer = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        if ($FilesystemOnly) {
            Write-FastOutput "  ├─ Filesystem only (${jobCount} jobs)..." "Progress"
            & $pioPath run --target buildfs --environment $Environment --jobs $jobCount
        }
        else {
            # Build firmware and filesystem in maximum parallel mode
            Write-FastOutput "  ├─ Firmware + Filesystem (${jobCount} parallel jobs)..." "Progress"

            # Start firmware build
            $firmwareJob = Start-Job -ScriptBlock {
                param($pioPath, $Environment, $jobCount)
                & $pioPath run --environment $Environment --jobs $jobCount
            } -ArgumentList $pioPath, $Environment, $jobCount

            # Start filesystem build simultaneously
            $filesystemJob = Start-Job -ScriptBlock {
                param($pioPath, $Environment)
                Start-Sleep 2  # Small delay to not overwhelm system
                & $pioPath run --target buildfs --environment $Environment --jobs 8
            } -ArgumentList $pioPath, $Environment

            # Wait for both to complete
            $firmwareJob, $filesystemJob | Wait-Job | Out-Null

            # Check results
            $firmwareResult = $firmwareJob | Receive-Job
            $filesystemResult = $filesystemJob | Receive-Job

            $firmwareJob, $filesystemJob | Remove-Job

            if ($LASTEXITCODE -ne 0) { throw "Build failed" }
        }

        $buildTimer.Stop()
        Write-FastOutput "✅ TURBO BUILD complete in $([math]::Round($buildTimer.ElapsedMilliseconds/1000, 1))s" "Success"
    }
    catch {
        Write-FastOutput "❌ Build failed: $_" "Error"
        exit 1
    }
}

# Fast binary organization (also prepare if SkipBuild to enable upload-only)
if (-not (Test-Path $Environment)) { New-Item -ItemType Directory -Path $Environment -Force | Out-Null }
if (-not $SkipBuild) {
    Write-FastOutput "⚡ Fast binary prep..." "Progress"

    $outputDir = $Environment
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }

    # Parallel copy all binaries
    $buildPath = ".pio\build\$Environment"
    $frameworkPath = "$env:USERPROFILE\.platformio\packages\framework-arduinoespressif32\tools\partitions"

    $copyJobs = @()
    $files = @{
        "boot_app0.bin"  = "$frameworkPath\boot_app0.bin"
        "firmware.bin"   = "$buildPath\firmware.bin"
        "bootloader.bin" = "$buildPath\bootloader.bin"
        "partitions.bin" = "$buildPath\partitions.bin"
        "littlefs.bin"   = "$buildPath\littlefs.bin"
    }

    foreach ($file in $files.GetEnumerator()) {
        if (Test-Path $file.Value) {
            $copyJobs += Start-Job -ScriptBlock {
                param($source, $dest)
                Copy-Item $source $dest -Force
            } -ArgumentList $file.Value, (Join-Path $outputDir $file.Key)
        }
    }

    $copyJobs | Wait-Job | Out-Null
    $copyJobs | Remove-Job

    # Fast merged firmware creation (skip if not needed for upload)
    if (-not $SkipUpload) {
        Write-FastOutput "⚡ Creating merged firmware..." "Progress"
        Push-Location $outputDir

        try {
            # For OPI octal flash, avoid overriding flash mode/freq; use size 32MB
            $mergeArgs = @(
                "--chip", "esp32-s3",
                "merge-bin", "-o", "merged-firmware.bin",
                "--flash-size", "32MB",
                "0x0000", "bootloader.bin",
                "0x8000", "partitions.bin",
                "0xe000", "boot_app0.bin",
                "0x10000", "firmware.bin",
                "0x00910000", "littlefs.bin"
            )

            python -m esptool @mergeArgs
        }
        finally {
            Pop-Location
        }
    }

    Write-FastOutput "✅ Binaries ready" "Success"
}

# Fast upload
if (-not $SkipUpload) {
    Write-FastOutput "⚡ TURBO UPLOAD to $ComPort..." "Progress"
    $uploadTimer = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        Push-Location $Environment

        # Basic sanity: if SkipBuild was used, try to fetch binaries from last build location
        if (-not (Test-Path "firmware.bin")) {
            $lastFirmware = Join-Path ".pio\\build\\$Environment" "firmware.bin"
            if (Test-Path $lastFirmware) { Copy-Item $lastFirmware . -Force }
        }

        if ($FilesystemOnly) {
            # Fast filesystem-only upload
            python -m esptool -p $ComPort -b $BaudRate --chip esp32-s3 write-flash --flash-size detect 0x00910000 littlefs.bin
        }
        else {
            # Fast full upload using merged binary (faster than individual files)
            if (Test-Path "merged-firmware.bin") {
                python -m esptool -p $ComPort -b $BaudRate --chip esp32-s3 write-flash --flash-size detect 0x0000 merged-firmware.bin
            }
            else {
                # Fallback to individual files
                python -m esptool -p $ComPort -b $BaudRate --chip esp32-s3 write-flash --flash-size detect 0x0000 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin 0x00910000 littlefs.bin
            }
        }

        $uploadTimer.Stop()
        Write-FastOutput "✅ TURBO UPLOAD complete in $([math]::Round($uploadTimer.ElapsedMilliseconds/1000, 1))s" "Success"
    }
    catch {
        Write-FastOutput "❌ Upload failed: $_" "Error"
        exit 1
    }
    finally {
        Pop-Location
    }

    # Auto-monitor if requested
    if ($Monitor) {
        Write-FastOutput "📺 Starting monitor..." "Info"
        Start-Sleep 2
        & $pioPath device monitor --port $ComPort --baud 115200
    }
}

# Summary
Write-FastOutput "========================================" "Info"
Write-FastOutput "⚡ TURBO MODE COMPLETE! ⚡" "Success"
Write-FastOutput "🌐 Access device at: http://192.168.4.1" "Info"
Write-FastOutput "========================================" "Info"

# REMOVED: replaced by fast_compile.py
# Original PowerShell removed in favor of a cross-platform Python script.
# See ESP32_AP-Flasher/fast_compile.py
