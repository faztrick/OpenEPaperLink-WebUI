#!/usr/bin/env pwsh
# ========================================================================
# Enhanced OutdoorAP Automated Build & Upload Script
# Optimized for fast, reliable builds with advanced features
# ========================================================================

param(
    [string]$Environment = "OutdoorAP",
    [string]$ComPort = "COM10",
    [int]$BaudRate = 921600,
    [ValidateSet('esp32s3', 'esp32c6', 'esp32c3')]
    [string]$Chip = 'esp32s3',
    [ValidateSet('qio', 'dio', 'dout', 'qout', 'opi')]
    [string]$FlashMode = 'opi',
    [ValidateSet('80m', '40m')]
    [string]$FlashFreq = '80m',
    [ValidateSet('32MB', '16MB', 'detect')]
    [string]$FlashSize = '32MB',
    [switch]$DetectFlash,
    [switch]$DetectOnly,
    [switch]$EraseAll,
    [switch]$UseMerged,
    [switch]$DotnetBuild,
    [switch]$AutoInstallEsptool,
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [switch]$Monitor,
    [switch]$Clean,
    [switch]$Verbose,
    [switch]$FilesystemOnly,
    [switch]$FastBuild,
    [int]$Jobs = 0,
    [switch]$SkipFilesystem,
    [switch]$LiveProgress
    , [int]$UploadTimeoutSec = 300
    , [int]$UploadStallTimeoutSec = 30
)

# Configuration
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Colors for enhanced output
$Colors = @{
    Success  = "Green"
    Warning  = "Yellow"
    Error    = "Red"
    Info     = "Cyan"
    Progress = "Magenta"
}

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    $fgColor = if ($Colors.ContainsKey($Color)) { $Colors[$Color] } else { "White" }
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $Message" -ForegroundColor $fgColor
}

# Ensure script runs from its own directory so relative paths work
try {
    Set-Location -Path $PSScriptRoot
}
catch {}

# Optimize job count
if ($Jobs -eq 0) {
    $cpuCores = [Environment]::ProcessorCount
    $Jobs = [Math]::Min(16, [Math]::Max(4, $cpuCores * 2))  # Use 2x CPU cores, max 16
}

# Performance optimizations
if ($FastBuild) {
    # Use environment variables for faster builds (these are supported)
    $env:PLATFORMIO_BUILD_FLAGS = ""
    Write-ColorOutput "FastBuild mode enabled - using parallel compilation" "Info"
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
Write-ColorOutput "🚀 Enhanced OutdoorAP Build & Flash Tool v2.1 (Speed Optimized)" "Info"
Write-ColorOutput "Environment: $Environment | Port: $ComPort | Baud: $BaudRate | Chip: $Chip | Jobs: $Jobs" "Info"
Write-ColorOutput "Usage: compile.ps1 [-Environment <name>] [-ComPort COMx] [-BaudRate 921600] [-Chip esp32s3] [-FlashMode qio] [-FlashFreq 80m] [-FlashSize 32MB|16MB|detect] [-DetectOnly] [-DetectFlash] [-EraseAll] [-UseMerged] [-DotnetBuild] [-FastBuild] [-FilesystemOnly] [-Jobs <n>]" "Info"
if ($FilesystemOnly) {
    Write-ColorOutput "Mode: Filesystem Only (Build + Erase + Upload)" "Warning"
}
if ($FastBuild) {
    Write-ColorOutput "Mode: Fast Build (With Caching)" "Info"
}
if ($FlashMode -eq 'opi') {
    Write-ColorOutput "Mode: Octal (OPI) flash selected - will use default boot flash mode/freq (no override)" "Info"
}
Write-ColorOutput "========================================" "Info"

# Helper: Run an upload command with live progress but enforce total timeout and stall timeout.
function Invoke-LiveUploadWithWatchdog {
    param(
        [Parameter(Mandatory = $true)][string[]]$CommandParts, # first item executable, rest args
        [int]$TotalTimeoutSec = 300,
        [int]$StallTimeoutSec = 30
    )
    Write-ColorOutput "🏁 Live upload (timeout=${TotalTimeoutSec}s stall=${StallTimeoutSec}s)" "Info"
    $exe = $CommandParts[0]
    $args = if ($CommandParts.Length -gt 1) { $CommandParts[1..($CommandParts.Length - 1)] } else { @() }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = ($args -join ' ')
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $null = $proc.Start()

    $lastOutput = [DateTime]::UtcNow
    $stdoutSb = New-Object System.Text.StringBuilder
    $stderrSb = New-Object System.Text.StringBuilder
    $outReader = $proc.StandardOutput
    $errReader = $proc.StandardError

    while (-not $proc.HasExited) {
        $line = $null
        while (-not $outReader.EndOfStream) {
            $line = $outReader.ReadLine()
            if ($line -ne $null) {
                $stdoutSb.AppendLine($line) | Out-Null
                $lastOutput = [DateTime]::UtcNow
                Write-Host $line
            }
        }
        while (-not $errReader.EndOfStream) {
            $eline = $errReader.ReadLine()
            if ($eline -ne $null) {
                $stderrSb.AppendLine($eline) | Out-Null
                $lastOutput = [DateTime]::UtcNow
                Write-Host $eline -ForegroundColor Yellow
            }
        }
        $elapsed = (Get-Date) - $proc.StartTime
        $sinceLast = [DateTime]::UtcNow - $lastOutput
        if ($elapsed.TotalSeconds -ge $TotalTimeoutSec) {
            Write-ColorOutput "⏱️ Upload total timeout (${TotalTimeoutSec}s) reached. Terminating process." "Error"
            try { $proc.Kill() } catch {}
            break
        }
        if ($sinceLast.TotalSeconds -ge $StallTimeoutSec) {
            Write-ColorOutput "⚠️ No upload output for ${StallTimeoutSec}s (stall). Terminating process." "Error"
            try { $proc.Kill() } catch {}
            break
        }
        Start-Sleep -Milliseconds 200
    }
    # Flush remaining
    try {
        while (-not $outReader.EndOfStream) {
            $l2 = $outReader.ReadLine(); if ($l2 -ne $null) { Write-Host $l2; $stdoutSb.AppendLine($l2) | Out-Null }
        }
        while (-not $errReader.EndOfStream) {
            $l3 = $errReader.ReadLine(); if ($l3 -ne $null) { Write-Host $l3 -ForegroundColor Yellow; $stderrSb.AppendLine($l3) | Out-Null }
        }
    }
    catch {}

    return [PSCustomObject]@{
        ExitCode = $proc.ExitCode
        StdOut   = $stdoutSb.ToString()
        StdErr   = $stderrSb.ToString()
    }
}

# Centralized pio detection (so monitor and other steps can reuse)
$possiblePio = @(
    (Join-Path $PSScriptRoot '.venv\Scripts\pio.exe'),
    (Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio.exe'),
    (Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio'),
    'pio'
)
$Global:pioPath = $possiblePio | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Global:pioPath) { $Global:pioPath = 'pio' }

# Serial monitor fallback using .NET SerialPort if pio monitor isn't available
function Start-SerialMonitorFallback {
    param([string]$Port, [int]$Baud = 115200)
    Write-ColorOutput "Starting fallback serial monitor on $Port @ $Baud" "Info"
    try {
        $serial = New-Object System.IO.Ports.SerialPort $Port, $Baud, 'None', 8, 'One'
        $serial.ReadTimeout = 2000
        $serial.Open()
        Write-ColorOutput "Opened $Port - press Ctrl+C to stop" "Info"
        while ($serial.IsOpen) {
            try {
                $line = $serial.ReadLine()
                Write-Host $line
            }
            catch [System.TimeoutException] { }
        }
    }
    catch {
        Write-ColorOutput "Fallback serial monitor failed: $_" "Error"
    }
}

# Resolve esptool invoker: prefer workspace venv python -m esptool, fallback to global python or esptool.py
function Resolve-EsptoolInvoker {
    param([switch]$InstallIfMissing)
    $candidates = @(
        (Join-Path $PSScriptRoot '..\.venv\Scripts\python.exe'),
        (Join-Path $PSScriptRoot '.venv\Scripts\python.exe'),
        'python'
    )
    foreach ($py in $candidates) {
        if (Test-Path $py) {
            # Test module availability
            try {
                & $py -c "import esptool" 2>$null
                if ($LASTEXITCODE -eq 0) { return @($py, '-m', 'esptool') }
            }
            catch { }

            if ($InstallIfMissing) {
                Write-ColorOutput "Attempting to install esptool into $py environment..." "Info"
                try {
                    & $py -m pip install --upgrade esptool | Out-Null
                    & $py -c "import esptool" 2>$null
                    if ($LASTEXITCODE -eq 0) { return @($py, '-m', 'esptool') }
                }
                catch { }
            }
        }
    }

    # Fallback to esptool.py on PATH
    try {
        & esptool.py --version > $null 2>&1
        if ($LASTEXITCODE -eq 0) { return @('esptool.py') }
    }
    catch { }

    return $null
}

# Run an external process with a timeout, capturing stdout+stderr
function Start-ProcessWithTimeout {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int]$TimeoutSec = 30
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = ($Arguments -join ' ')
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    [void]$proc.Start()
    $timedOut = -not $proc.WaitForExit($TimeoutSec * 1000)
    if ($timedOut) {
        try { $proc.Kill() } catch {}
    }
    $output = ''
    try { $output = $proc.StandardOutput.ReadToEnd() + $proc.StandardError.ReadToEnd() } catch {}
    return [PSCustomObject]@{ ExitCode = if ($timedOut) { 258 } else { $proc.ExitCode }; TimedOut = $timedOut; Output = $output }
}

# Invoke esptool with timeout via resolved invoker (python -m esptool or esptool.py)
function Invoke-Esptool {
    param(
        [Parameter(Mandatory = $true)][string[]]$Args,
        [int]$TimeoutSec = 30,
        [switch]$AutoInstall
    )
    $esptoolInvoker = Resolve-EsptoolInvoker
    if (-not $esptoolInvoker -and $AutoInstall) { $esptoolInvoker = Resolve-EsptoolInvoker -InstallIfMissing }
    if (-not $esptoolInvoker) { throw "esptool not found. Install it with 'pip install esptool' or enable -AutoInstallEsptool." }

    if ($esptoolInvoker[0] -eq 'esptool.py') {
        return Start-ProcessWithTimeout -FilePath 'esptool.py' -Arguments $Args -TimeoutSec $TimeoutSec
    }
    else {
        $python = $esptoolInvoker[0]
        $moduleArgs = $esptoolInvoker[1..($esptoolInvoker.Length - 1)] + $Args
        return Start-ProcessWithTimeout -FilePath $python -Arguments $moduleArgs -TimeoutSec $TimeoutSec
    }
}

# For S3 + OPI path: retry esptool on common failure modes with lower baud/alternate reset
function Invoke-EsptoolWithRetry {
    param(
        [Parameter(Mandatory = $true)][string[]]$BaseArgs,
        [int]$InitialBaud = 921600,
        [string]$ComPort = 'COM10',
        [int]$TimeoutSec = 30,
        [switch]$IsOpi,
        [switch]$AutoInstall,
        [switch]$AllowNoStub  # When disabled, omit --no-stub fallback attempts (useful for erase-flash which needs stub for full chip erase)
    )
    # Helper to clone args and change -b and --before/--after quickly
    function With-Args {
        param([string[]]$src, [int]$baud, [string]$before, [string]$after)
        $dst = @()
        for ($i = 0; $i -lt $src.Count; $i++) {
            if ($src[$i] -eq '-b') { $dst += '-b'; $dst += "$baud"; $i++ ; continue }
            if ($src[$i] -eq '--before' -and $before) { $dst += '--before'; $dst += $before; $i++; continue }
            if ($src[$i] -eq '--after' -and $after) { $dst += '--after'; $dst += $after; $i++; continue }
            $dst += $src[$i]
        }
        return , $dst
    }
    function Add-NoStub {
        param([string[]]$src)
        # Insert --no-stub before subcommand (write-flash/erase-flash/erase_region)
        $dst = @()
        $inserted = $false
        for ($i = 0; $i -lt $src.Count; $i++) {
            if (-not $inserted -and ($src[$i] -in @('write-flash', 'erase-flash', 'erase_region', 'read_flash'))) {
                $dst += '--no-stub'
                $inserted = $true
            }
            $dst += $src[$i]
        }
        if (-not $inserted) { $dst += '--no-stub' }
        return , $dst
    }

    $attempts = @()
    # Attempt 1: as-is (fast baud)
    $attempts += [PSCustomObject]@{ Args = $BaseArgs; Label = "primary"; Baud = $InitialBaud }
    # Attempt 2: lower baud 460800, default reset
    $attempts += [PSCustomObject]@{ Args = (With-Args -src $BaseArgs -baud 460800 -before $null -after $null); Label = "fallback-460800"; Baud = 460800 }
    # Attempt 3: 115200 default-reset (many boards need manual BOOT + EN timing here)
    $attempts += [PSCustomObject]@{ Args = (With-Args -src $BaseArgs -baud 115200 -before 'default-reset' -after $null); Label = "fallback-115200"; Baud = 115200 }
    # Attempt 4: 115200 no-reset (keep current state)
    $attempts += [PSCustomObject]@{ Args = (With-Args -src $BaseArgs -baud 115200 -before 'no-reset' -after $null); Label = "fallback-115200-nr"; Baud = 115200 }

    if ($AllowNoStub) {
        # Attempt 5: 115200 default-reset with --no-stub (stub load failing)
        $attempts += [PSCustomObject]@{ Args = (Add-NoStub (With-Args -src $BaseArgs -baud 115200 -before 'default-reset' -after $null)); Label = "fallback-115200-nostub"; Baud = 115200 }
        # Attempt 6: 115200 no-reset both sides with --no-stub
        $attempts += [PSCustomObject]@{ Args = (Add-NoStub (With-Args -src $BaseArgs -baud 115200 -before 'no-reset' -after 'no-reset')); Label = "fallback-115200-nr-nostub"; Baud = 115200 }
    }

    foreach ($att in $attempts) {
        Write-ColorOutput "  - esptool attempt [$($att.Label)] @ $($att.Baud) on $ComPort..." "Progress"
        $res = Invoke-Esptool -Args $att.Args -TimeoutSec $TimeoutSec -AutoInstall:$AutoInstall
        if ($res.TimedOut) {
            Write-ColorOutput "  ├─ esptool timed out after ${TimeoutSec}s ([$($att.Label)])" "Warning"
        }
        if ($res.ExitCode -eq 0 -and -not $res.TimedOut) { return $res }
        # Print last 10 lines of output to aid debugging
        if ($res.Output) {
            $lines = $res.Output -split "\r?\n"
            $tail = ($lines | Select-Object -Last 12) -join [Environment]::NewLine
            Write-ColorOutput ("  - esptool output (last lines) [${($att.Label)}]:`n" + $tail) "Warning"
        }

        # For OPI we sometimes need a short pause between retries
        if ($IsOpi) { Start-Sleep -Seconds 2 }
    }
    return $res
}

# Probe flash information (size and IDs) using esptool
function Get-FlashInfo {
    param(
        [string]$Port,
        [int]$Baud,
        [string]$Chip
    )
    $esptoolInvoker = Resolve-EsptoolInvoker
    if (-not $esptoolInvoker -and $AutoInstallEsptool) { $esptoolInvoker = Resolve-EsptoolInvoker -InstallIfMissing }
    if (-not $esptoolInvoker) { throw "esptool not found. Install it with 'pip install esptool' or enable -AutoInstallEsptool." }

    $args = @('--chip', $Chip, '-p', $Port, '-b', $Baud, 'flash_id')
    $output = ""
    $res = Invoke-Esptool -Args $args -TimeoutSec 20 -AutoInstall:$AutoInstallEsptool
    $output = $res.Output

    $size = $null
    $manu = $null
    $dev = $null
    foreach ($line in ($output -split "\r?\n")) {
        if ($line -match 'Detected flash size:\s*([0-9]+MB)') { $size = $Matches[1] }
        if ($line -match 'Manufacturer:\s*0x([0-9a-fA-F]+)') { $manu = $Matches[1] }
        if ($line -match 'Device memory ID:\s*0x([0-9a-fA-F]+)') { $dev = $Matches[1] }
    }
    return [PSCustomObject]@{ RawOutput = $output; Size = $size; Manufacturer = $manu; DeviceID = $dev }
}

# Derive the active partition CSV for the selected environment and extract spiffs offset
function Get-PartitionCsvPathForEnv {
    param([string]$IniPath, [string]$Env)
    try {
        $lines = Get-Content $IniPath -Raw -ErrorAction Stop
        # Find the section header and capture until next section
        $pattern = "\[env:$([Regex]::Escape($Env))\](?<body>[\s\S]*?)(?=\n\[|\Z)"
        $m = [Regex]::Match($lines, $pattern)
        if ($m.Success) {
            $body = $m.Groups['body'].Value
            $pm = [Regex]::Match($body, "(?m)^\s*board_build\.partitions\s*=\s*(.+)$")
            if ($pm.Success) {
                $p = $pm.Groups[1].Value.Trim()
                # Normalize path relative to script directory
                $candidate = Join-Path $PSScriptRoot $p
                if (Test-Path $candidate) { return $candidate }
                if (Test-Path $p) { return $p }
            }
        }
    }
    catch {}
    return $null
}

function Get-SpiffsOffsetFromCsv {
    param([string]$CsvPath)
    if (-not $CsvPath) { return $null }
    try {
        $lines = Get-Content $CsvPath -ErrorAction Stop | Where-Object { -not ($_.Trim().StartsWith('#')) -and $_.Trim() -ne '' }
        foreach ($l in $lines) {
            $parts = $l.Split(',').ForEach({ $_.Trim() })
            # Accept either 'spiffs' or 'littlefs' as the filesystem partition label
            if ($parts.Length -ge 5 -and ($parts[0].ToLower() -eq 'spiffs' -or $parts[0].ToLower() -eq 'littlefs')) {
                $offset = $parts[3]
                # Ensure 0x prefix
                if ($offset -notmatch '^0x') { $offset = ('0x{0:X}' -f [int]$offset) }
                return $offset
            }
        }
    }
    catch {}
    return $null
}

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
$pioConfigPath = Join-Path $PSScriptRoot "platformio.ini"
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

# Auto-adjust defaults based on environment if not explicitly overridden
if ($Environment -eq 'OutdoorAP') {
    if (-not $PSBoundParameters.ContainsKey('Chip')) { $Chip = 'esp32s3' }
}

# Clean if requested
if ($Clean) {
    Write-ColorOutput "🧹 Cleaning build directory..." "Progress"
    Remove-Item -Recurse -Force ".pio" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "$Environment" -ErrorAction SilentlyContinue
}

# Step 1: Prepare web files (with caching)
if (-not $SkipBuild) {
    Write-ColorOutput "WEB Checking web files..." "Progress"
    $timer = [System.Diagnostics.Stopwatch]::StartNew()

    # Check if web files need recompression
    $webFilesNeedUpdate = $false
    $gzipScript = "gzip_wwwfiles.py"
    $dataWwwPath = "data\www"

    if (Test-Path $dataWwwPath) {
        $lastGzipTime = if (Test-Path $gzipScript) { (Get-Item $gzipScript).LastWriteTime } else { [DateTime]::MinValue }
        $newestWebFile = Get-ChildItem $dataWwwPath -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1

        if ($newestWebFile -and $newestWebFile.LastWriteTime -gt $lastGzipTime) {
            $webFilesNeedUpdate = $true
        }
    }
    else {
        $webFilesNeedUpdate = $true
    }

    if ($webFilesNeedUpdate -or $Clean) {
        Write-ColorOutput "  - Compressing web files..." "Progress"
        try {
            python gzip_wwwfiles.py
            $timer.Stop()
            Write-ColorOutput "✅ Web files compressed in $($timer.ElapsedMilliseconds)ms" "Success"
        }
        catch {
            Write-ColorOutput "❌ Failed to compress web files: $_" "Error"
            exit 1
        }
    }
    else {
        $timer.Stop()
        Write-ColorOutput "✅ Web files up-to-date (skipped compression)" "Success"
    }

    # Step 2: Build firmware or filesystem only (with optimizations)
    # Seed LittleFS with a default tagDB if missing, to avoid first-boot failures
    try {
        $fsCurrentDir = Join-Path $PSScriptRoot 'data\\current'
        $defaultTagDb = Join-Path $PSScriptRoot 'final_tagdb.json'
        if (Test-Path $defaultTagDb) {
            if (-not (Test-Path $fsCurrentDir)) { New-Item -ItemType Directory -Path $fsCurrentDir -Force | Out-Null }
            $destTagDb = Join-Path $fsCurrentDir 'tagDB.json'
            $destTagDbBak = Join-Path $fsCurrentDir 'tagDB.json.bak'
            if (-not (Test-Path $destTagDb)) { Copy-Item $defaultTagDb $destTagDb -Force }
            if (-not (Test-Path $destTagDbBak)) { Copy-Item $defaultTagDb $destTagDbBak -Force }
            Write-ColorOutput "FS Seed: Ensured default tagDB.json present in data/current" "Info"
        }
    }
    catch { Write-ColorOutput "FS Seed failed (continuing): $_" "Warning" }
    if ($FilesystemOnly) {
        Write-ColorOutput "BUILD Building filesystem only for $Environment..." "Progress"
        $buildTimer = [System.Diagnostics.Stopwatch]::StartNew()

        # Better PlatformIO `pio` detection: check common virtualenvs and local .venv
        $possiblePio = @(
            (Join-Path $PSScriptRoot '.venv\Scripts\pio.exe'),
            (Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio.exe'),
            (Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio'),
            'pio'
        )
        $pioPath = $possiblePio | Where-Object { Test-Path $_ } | Select-Object -First 1
        if (-not $pioPath) { $pioPath = 'pio' }

        try {
            # Build filesystem only with optimizations
            Write-ColorOutput "  - Building filesystem..." "Progress"
            & $pioPath run --target buildfs --environment $Environment --jobs 8
            if ($LASTEXITCODE -ne 0) { throw "Filesystem build failed" }

            $buildTimer.Stop()
            Write-ColorOutput "✅ Filesystem build completed in $([math]::Round($buildTimer.ElapsedMilliseconds/1000, 1))s" "Success"
        }
        catch {
            Write-ColorOutput "❌ Filesystem build failed: $_" "Error"
            exit 1
        }
    }
    else {
        Write-ColorOutput "BUILD Building firmware for $Environment..." "Progress"
        $buildTimer = [System.Diagnostics.Stopwatch]::StartNew()

        $pioPath = Join-Path $env:USERPROFILE '\.platformio\penv\Scripts\pio'
        if (-not (Test-Path $pioPath)) {
            $pioPath = "pio"  # Try global installation
        }

        # Get CPU core count for optimal parallel jobs
        $jobCount = $Jobs

        try {
            # Build main firmware with parallel compilation
            Write-ColorOutput "  - Compiling firmware - $jobCount parallel jobs..." "Progress"

            # Build with optimized parallel compilation
            $buildArgs = @("run", "--environment", $Environment, "--jobs", $jobCount)

            # If dotnet build requested, run it first (Release) to prebuild any dotnet-based tools
            if ($DotnetBuild) {
                Write-ColorOutput "  - Running dotnet build (Release) to prebuild native tools..." "Progress"
                try {
                    dotnet build -c Release | Out-Null
                }
                catch {
                    Write-ColorOutput "  ├─ dotnet build failed (continuing): $_" "Warning"
                }
            }

            & $pioPath @buildArgs
            if ($LASTEXITCODE -ne 0) { throw "Firmware build failed" }

            # Build filesystem in parallel if possible
            Write-ColorOutput "  - Building filesystem (background)..." "Progress"
            $filesystemJob = Start-Job -ScriptBlock {
                param($pioPath, $Environment)
                $fsArgs = @("run", "--target", "buildfs", "--environment", $Environment, "--jobs", "4")
                & $pioPath @fsArgs | Out-Null
            } -ArgumentList $pioPath, $Environment

            # Wait for filesystem build to complete
            $filesystemJob | Wait-Job | Out-Null
            $filesystemResult = $filesystemJob | Receive-Job
            $filesystemJob | Remove-Job

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

# Optional: Detect flash info before organizing binaries
if ($DetectOnly -or $DetectFlash) {
    try {
        Write-ColorOutput "🔍 Probing flash info on $ComPort..." "Progress"
        $info = Get-FlashInfo -Port $ComPort -Baud $BaudRate -Chip $Chip
        if ($info.Size) { Write-ColorOutput "  ├─ Detected flash size: $($info.Size)" "Info" } else { Write-ColorOutput "  ├─ Detected flash size: (unknown)" "Warning" }
        if ($info.Manufacturer) { Write-ColorOutput "  ├─ Manufacturer ID: 0x$($info.Manufacturer)" "Info" }
        if ($info.DeviceID) { Write-ColorOutput "  ├─ Device ID: 0x$($info.DeviceID)" "Info" }

        if ($DetectOnly) {
            Write-ColorOutput "Detection only requested. Exiting." "Info"
            exit 0
        }

        if ($DetectFlash -and $info.Size) {
            switch ($info.Size) {
                '32MB' { $FlashSize = '32MB' }
                '16MB' { $FlashSize = '16MB' }
                default { Write-ColorOutput "  ├─ Non-standard size '$($info.Size)' detected; keeping CSV-inferred size ($FlashSize) for merge and using 'detect' for write." "Warning" }
            }
        }
    }
    catch {
        Write-ColorOutput "Flash detect failed: $_" "Warning"
        if ($DetectOnly) { exit 1 }
    }
}

# Step 3: Prepare binary files (with parallel copying)
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
    "boot_app0.bin"  = "$frameworkPath\boot_app0.bin"
    "firmware.bin"   = "$buildPath\firmware.bin"
    "bootloader.bin" = "$buildPath\bootloader.bin"
    "partitions.bin" = "$buildPath\partitions.bin"
    "littlefs.bin"   = "$buildPath\littlefs.bin"
}

# Copy files with verification using fast synchronous copy (fewer tasks overhead)
Write-ColorOutput "  - Copying binaries to output directory (fast-mode)" "Progress"
foreach ($file in $files.GetEnumerator()) {
    if (Test-Path $file.Value) {
        $dest = Join-Path $outputDir $file.Key
        Copy-Item $file.Value $dest -Force
        $sizeKb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
        Write-ColorOutput "  - $($file.Key): ${sizeKb}KB" "Info"
    }
    else {
        Write-ColorOutput "  - ⚠️  Missing: $($file.Key)" "Warning"
    }
}

# Step 4: Create merged firmware
Write-ColorOutput "MERGE Creating merged firmware..." "Progress"
Push-Location $outputDir

try {
    # Determine flash configuration based on environment
    $partCsv = Get-PartitionCsvPathForEnv -IniPath $pioConfigPath -Env $Environment
    $spiffsOffset = Get-SpiffsOffsetFromCsv -CsvPath $partCsv
    if (-not $spiffsOffset) {
        # Fallback offsets if parse fails
        $spiffsOffset = if ($FlashSize -eq '16MB') { '0x00410000' } else { '0x00910000' }
    }

    # Infer flash size from selected partition CSV if not explicitly set
    if ($FlashSize -eq 'detect' -or -not $PSBoundParameters.ContainsKey('FlashSize')) {
        if ($partCsv -and (Split-Path $partCsv -Leaf) -match '^32MB_') { $FlashSize = '32MB' }
        elseif ($partCsv -and (Split-Path $partCsv -Leaf) -match '^16MB_') { $FlashSize = '16MB' }
        else { $FlashSize = '16MB' }
    }

    $flashConfig = @{
        chip      = $Chip
        mode      = $FlashMode
        freq      = $FlashFreq
        size      = $FlashSize
        addresses = @{
            "0x0000"      = "bootloader.bin"
            "0x8000"      = "partitions.bin"
            "0xe000"      = "boot_app0.bin"
            "0x10000"     = "firmware.bin"
            $spiffsOffset = "littlefs.bin"
        }
    }

    if ($SkipFilesystem) {
        # Remove filesystem entry if requested
        $fsKey = $spiffsOffset
        if ($flashConfig.addresses.ContainsKey($fsKey)) {
            [void]$flashConfig.addresses.Remove($fsKey)
            Write-ColorOutput "MERGE Note: Skipping filesystem (littlefs) in merged image as requested" "Info"
        }
    }

    # Build merge command
    $mergeArgs = @(
        "--chip", $flashConfig.chip,
        "merge-bin",
        "-o", "merged-firmware.bin"
    )

    # For OPI octal flash, do not override flash mode/freq; use defaults embedded in images/bootloader
    if ($flashConfig.mode -and $flashConfig.mode -ne 'opi') {
        $mergeArgs += @("--flash-mode", $flashConfig.mode)
        if ($flashConfig.freq) { $mergeArgs += @("--flash-freq", $flashConfig.freq) }
    }

    $mergeArgs += @(
        "--flash-size", $flashConfig.size
    )

    foreach ($addr in $flashConfig.addresses.GetEnumerator()) {
        if (Test-Path $addr.Value) {
            $mergeArgs += $addr.Key, $addr.Value
        }
    }

    $esptoolInvoker = Resolve-EsptoolInvoker
    if (-not $esptoolInvoker -and $AutoInstallEsptool) { $esptoolInvoker = Resolve-EsptoolInvoker -InstallIfMissing }
    if (-not $esptoolInvoker) { throw "esptool not found. Install it with 'pip install esptool' or enable -AutoInstallEsptool." }
    if ($esptoolInvoker[0] -eq 'esptool.py') {
        $mergeCmd = @('esptool.py') + $mergeArgs
        $proc = Start-Process -FilePath $mergeCmd[0] -ArgumentList $mergeCmd[1..($mergeCmd.Length - 1)] -NoNewWindow -Wait -PassThru
    }
    else {
        # esptoolInvoker is like @('C:\path\to\python.exe','-m','esptool')
        $python = $esptoolInvoker[0]
        $moduleArgs = $esptoolInvoker[1..($esptoolInvoker.Length - 1)] + $mergeArgs
        $proc = Start-Process -FilePath $python -ArgumentList $moduleArgs -NoNewWindow -Wait -PassThru
    }
    if ($proc.ExitCode -ne 0) { throw "esptool merge-bin failed" }

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
    # Optional full chip erase
    if ($EraseAll) {
        try {
            Write-ColorOutput "🧽 Erasing entire flash on $ComPort..." "Progress"
            Write-ColorOutput "🔧 Tip: Hold the BOOT button (GPIO0) then tap EN/RST, keep holding BOOT until 'Connecting' progresses." "Info"
            Write-ColorOutput "     If connection stalls, release BOOT and tap EN again during 115200 attempts." "Info"
            $eraseAllArgs = @(
                "-p", $ComPort,
                "-b", $BaudRate,
                "--before", "default-reset",
                "--after", "hard-reset",
                "--chip", $flashConfig.chip,
                "erase-flash"
            )
            # Full chip erase requires stub for reliability; disable no-stub fallbacks so we don't hit ROM limitation
            $res = Invoke-EsptoolWithRetry -BaseArgs $eraseAllArgs -InitialBaud $BaudRate -ComPort $ComPort -TimeoutSec 45 -IsOpi:($FlashMode -eq 'opi') -AutoInstall:$AutoInstallEsptool -AllowNoStub:$false
            if ($res.ExitCode -ne 0) { throw "Chip erase failed (code $($res.ExitCode))" }
        }
        catch {
            Write-ColorOutput "❌ Full erase failed: $_" "Warning"
            Write-ColorOutput "💡 You can retry manually: esptool.py --chip $($flashConfig.chip) -p $ComPort -b 115200 erase_flash" "Info"
            Write-ColorOutput "   (Hold BOOT before running; release after 'Erasing' begins.)" "Info"
        }
    }

    if ($FilesystemOnly) {
        Write-ColorOutput "📤 Erasing and uploading filesystem only to $ComPort..." "Progress"
        $uploadTimer = [System.Diagnostics.Stopwatch]::StartNew()

        try {
            # Get filesystem partition address from active environment's partition CSV
            $partCsv = Get-PartitionCsvPathForEnv -IniPath $pioConfigPath -Env $Environment
            $filesystemAddress = Get-SpiffsOffsetFromCsv -CsvPath $partCsv
            if (-not $filesystemAddress) {
                # Fallback if parsing fails
                $filesystemAddress = if ($FlashSize -eq '32MB') { '0x00910000' } else { '0x00410000' }
            }

            $littlefsPath = Join-Path $outputDir "littlefs.bin"
            if (-not (Test-Path $littlefsPath)) {
                throw "Filesystem binary not found: $littlefsPath"
            }
            # Use absolute path for esptool
            try { $littlefsPath = (Resolve-Path -Path $littlefsPath).Path } catch {}

            Write-ColorOutput "  - Connecting to device..." "Progress"
            Write-ColorOutput "  - Erasing filesystem partition..." "Progress"

            # Erase filesystem partition first
            $eraseArgs = @(
                "-p", $ComPort
                "-b", $BaudRate
                "--before", "default-reset"
                "--after", "no_reset"
                "--chip", $flashConfig.chip
                "erase_region"
                $filesystemAddress
                "0x6F0000"  # Size of filesystem partition (7MB)
            )
            $resErase = Invoke-EsptoolWithRetry -BaseArgs $eraseArgs -InitialBaud $BaudRate -ComPort $ComPort -TimeoutSec 40 -IsOpi:($FlashMode -eq 'opi') -AutoInstall:$AutoInstallEsptool
            if ($resErase.ExitCode -ne 0) { throw "Filesystem erase failed (code $($resErase.ExitCode))" }

            Write-ColorOutput "  - Uploading filesystem..." "Progress"

            # Upload filesystem
            $uploadArgs = @(
                "-p", $ComPort,
                "-b", $BaudRate,
                "--before", "no-reset",
                "--after", "hard-reset",
                "--chip", $flashConfig.chip,
                "write-flash"
            )

            # For OPI octal flash, avoid overriding flash mode
            if ($flashConfig.mode -and $flashConfig.mode -ne 'opi') {
                $uploadArgs += @("--flash-mode", $flashConfig.mode)
            }
            $uploadArgs += @("--flash-size", "detect", $filesystemAddress, $littlefsPath)

            $resFs = Invoke-EsptoolWithRetry -BaseArgs $uploadArgs -InitialBaud $BaudRate -ComPort $ComPort -TimeoutSec 180 -IsOpi:($FlashMode -eq 'opi') -AutoInstall:$AutoInstallEsptool
            if ($resFs.ExitCode -ne 0) { throw "Filesystem upload failed (code $($resFs.ExitCode))" }

            $uploadTimer.Stop()
            Write-ColorOutput "✅ Filesystem erase and upload completed in $([math]::Round($uploadTimer.ElapsedMilliseconds/1000, 1))s" "Success"

            # Monitor if requested
            if ($Monitor) {
                # Prefer COM13 for quick monitoring if available
                $availablePorts = Get-AvailableComPorts
                if ($availablePorts -contains 'COM13') { $ComPort = 'COM13' }
                Write-ColorOutput "📺 Starting serial monitor on $ComPort..." "Info"
                Start-Sleep 2  # Wait for device to reset
                try {
                    if (Test-Path $Global:pioPath -PathType Leaf -ErrorAction SilentlyContinue -and $Global:pioPath -ne 'pio') {
                        & $Global:pioPath device monitor --port $ComPort --baud 115200
                    }
                    else {
                        # If pio isn't found as an executable path, try running `pio` command; if it fails, fallback
                        try { & pio device monitor --port $ComPort --baud 115200 }
                        catch { Start-SerialMonitorFallback -Port $ComPort -Baud 115200 }
                    }
                }
                catch {
                    Write-ColorOutput "Monitor start failed: $_ - falling back to built-in monitor" "Warning"
                    Start-SerialMonitorFallback -Port $ComPort -Baud 115200
                }
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
    }
    else {
        Write-ColorOutput "📤 Uploading firmware to $ComPort..." "Progress"
        $uploadTimer = [System.Diagnostics.Stopwatch]::StartNew()

        try {
            # Build upload arguments (either merged or per-segment)
            if ($UseMerged -and (Test-Path (Join-Path $outputDir 'merged-firmware.bin'))) {
                $uploadArgs = @(
                    "-p", $ComPort,
                    "-b", $BaudRate,
                    "--before", "default-reset",
                    "--after", "hard-reset",
                    "--chip", $flashConfig.chip,
                    "write-flash",
                    "0x0000", (Resolve-Path -Path (Join-Path $outputDir 'merged-firmware.bin')).Path
                )
                if ($LiveProgress) {
                    # Stream esptool output live for progress visibility
                    $esptoolInvoker = Resolve-EsptoolInvoker -InstallIfMissing:$AutoInstallEsptool
                    if (-not $esptoolInvoker) { throw "esptool not found for live progress." }
                    $cmdParts = @()
                    if ($esptoolInvoker[0] -eq 'esptool.py') {
                        $cmdParts += 'esptool.py'
                    }
                    else {
                        $cmdParts += $esptoolInvoker[0]
                        $cmdParts += $esptoolInvoker[1..($esptoolInvoker.Length - 1)]
                    }
                    $cmdParts += $uploadArgs
                    $liveResult = Invoke-LiveUploadWithWatchdog -CommandParts $cmdParts -TotalTimeoutSec $UploadTimeoutSec -StallTimeoutSec $UploadStallTimeoutSec
                    if ($liveResult.ExitCode -ne 0) { throw "Upload failed (live mode watchdog)" }
                    $uploadTimer.Stop()
                    Write-ColorOutput "✅ Upload completed in $([math]::Round($uploadTimer.ElapsedMilliseconds/1000, 1))s" "Success"
                    # Skip retry wrapper when using live progress
                    $resFw = [PSCustomObject]@{ ExitCode = 0 }
                }
            }
            else {
                $uploadArgs = @(
                    "-p", $ComPort,
                    "-b", $BaudRate,
                    "--before", "default-reset",
                    "--after", "hard-reset",
                    "--chip", $flashConfig.chip,
                    "write-flash"
                )
                # For OPI octal flash, do not override flash mode
                if ($flashConfig.mode -and $flashConfig.mode -ne 'opi') {
                    $uploadArgs += @("--flash-mode", $flashConfig.mode)
                }
                $uploadArgs += @("--flash-size", ($FlashSize -ne 'detect' ? $FlashSize : 'detect'))
                foreach ($addr in $flashConfig.addresses.GetEnumerator()) {
                    $filePath = Join-Path $outputDir $addr.Value
                    if (Test-Path $filePath) {
                        if ($SkipFilesystem -and ($addr.Value -like 'littlefs.bin' -or $addr.Value -like 'spiffs.bin')) {
                            Write-ColorOutput "  - Skipping filesystem image ($($addr.Value)) due to -SkipFilesystem" "Info"
                            continue
                        }
                        try { $filePath = (Resolve-Path -Path $filePath).Path } catch {}
                        $uploadArgs += $addr.Key, $filePath
                    }
                }

                if ($LiveProgress) {
                    # Stream esptool output live for progress visibility
                    $esptoolInvoker = Resolve-EsptoolInvoker -InstallIfMissing:$AutoInstallEsptool
                    if (-not $esptoolInvoker) { throw "esptool not found for live progress." }
                    $cmdParts = @()
                    if ($esptoolInvoker[0] -eq 'esptool.py') {
                        $cmdParts += 'esptool.py'
                    }
                    else {
                        $cmdParts += $esptoolInvoker[0]
                        $cmdParts += $esptoolInvoker[1..($esptoolInvoker.Length - 1)]
                    }
                    $cmdParts += $uploadArgs
                    $liveResult = Invoke-LiveUploadWithWatchdog -CommandParts $cmdParts -TotalTimeoutSec $UploadTimeoutSec -StallTimeoutSec $UploadStallTimeoutSec
                    if ($liveResult.ExitCode -ne 0) { throw "Upload failed (live mode watchdog)" }
                    $uploadTimer.Stop()
                    Write-ColorOutput "✅ Upload completed in $([math]::Round($uploadTimer.ElapsedMilliseconds/1000, 1))s" "Success"
                    # Skip retry wrapper when using live progress
                    $resFw = [PSCustomObject]@{ ExitCode = 0 }
                }
            }

            if (-not $LiveProgress) {
                Write-ColorOutput "  - Connecting to device..." "Progress"
                $resFw = Invoke-EsptoolWithRetry -BaseArgs $uploadArgs -InitialBaud $BaudRate -ComPort $ComPort -TimeoutSec 240 -IsOpi:($FlashMode -eq 'opi') -AutoInstall:$AutoInstallEsptool
            }
            if ($resFw.ExitCode -ne 0) { throw "Upload failed (code $($resFw.ExitCode))" }

            $uploadTimer.Stop()
            Write-ColorOutput "✅ Upload completed in $([math]::Round($uploadTimer.ElapsedMilliseconds/1000, 1))s" "Success"

            # Monitor if requested
            if ($Monitor) {
                # Prefer COM13 for quick monitoring if available
                $availablePorts = Get-AvailableComPorts
                if ($availablePorts -contains 'COM13') { $ComPort = 'COM13' }
                Write-ColorOutput "📺 Starting serial monitor on $ComPort..." "Info"
                Start-Sleep 2  # Wait for device to reset
                try {
                    if (Test-Path $Global:pioPath -PathType Leaf -ErrorAction SilentlyContinue -and $Global:pioPath -ne 'pio') {
                        & $Global:pioPath device monitor --port $ComPort --baud 115200
                    }
                    else {
                        try { & pio device monitor --port $ComPort --baud 115200 }
                        catch { Start-SerialMonitorFallback -Port $ComPort -Baud 115200 }
                    }
                }
                catch {
                    Write-ColorOutput "Monitor start failed: $_ - falling back to built-in monitor" "Warning"
                    Start-SerialMonitorFallback -Port $ComPort -Baud 115200
                }
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
    Write-ColorOutput "✅ FAST Filesystem Build, Erase & Upload Complete!" "Success"
}
else {
    Write-ColorOutput "✅ FAST OutdoorAP Build and Flash Complete!" "Success"
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
Write-ColorOutput "💡 Use -FastBuild for even faster incremental builds!" "Info"
Write-ColorOutput "⚡ Use fast_compile.ps1 for maximum speed!" "Info"
Write-ColorOutput "========================================" "Info"

# REMOVED: replaced by compile.py
# Original PowerShell removed in favor of a cross-platform Python script.
# See ESP32_AP-Flasher/compile.py
