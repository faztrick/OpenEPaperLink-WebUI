<#
Cleanup and archive logs and unwanted build artifacts.

Usage examples:
  # Preview (no changes):
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup_and_archive.ps1 -Preview

  # Execute (perform moves):
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup_and_archive.ps1 -Execute

Behavior:
- Creates an archive folder at <workspace>/logs/archived_unwanted-YYYYMMDD-HHMMSS
- Moves matched files and directories into the archive while preserving relative structure.
- Default matches:
  - workspace-level: pio_build_log.txt, build_output.txt, *.log
  - logs folders: logs/** (files)
  - ESP32_AP-Flasher: build/ and .pio/ and pio_build_log.txt
- Safety:
  - By default runs in preview mode. Use -Execute to actually move files.
  - Skips .git, node_modules, and other common VCS/runtime folders.
#>

param(
    [switch]$Execute,
    [switch]$Preview = $true,
    [string]$ProjectRoot = (Get-Location).Path
)

function NowStr() { Get-Date -Format "yyyyMMdd-HHmmss" }
function Info($m) { Write-Output "[INFO] $m" }
function Warn($m) { Write-Warning $m }

# Normalize ProjectRoot (robust)
# Prefer an absolute string path in $projectRootPath
$projectRootPath = $null
try {
    $rp = Resolve-Path -Path $ProjectRoot -ErrorAction SilentlyContinue
    if ($rp) { $projectRootPath = $rp.ProviderPath }
} catch { }
if (-not $projectRootPath -and (Test-Path $ProjectRoot)) {
    $projectRootPath = (Get-Item -Path $ProjectRoot).FullName
}
if (-not $projectRootPath) {
    # fallback to parent of script folder
    $projectRootPath = (Get-Item -Path (Split-Path -Parent $PSScriptRoot)).FullName
}
$projectRootPath = $projectRootPath.TrimEnd('\')

$timestamp = NowStr
$archiveRelative = "logs/archived_unwanted-$timestamp"
$archiveFull = Join-Path $projectRootPath $archiveRelative

$patterns = @(
    # specific files at workspace root
    @{ Path = $projectRootPath; Pattern = 'pio_build_log.txt' },
    @{ Path = $projectRootPath; Pattern = 'build_output.txt' },
    @{ Path = $projectRootPath; Pattern = '*.log' },
    @{ Path = "$projectRootPath\logs"; Pattern = '*' },

    # ESP32_AP-Flasher common build artifacts
    @{ Path = "$projectRootPath\ESP32_AP-Flasher\"; Pattern = 'pio_build_log.txt' },
    @{ Path = "$projectRootPath\ESP32_AP-Flasher\"; Pattern = 'build' ; IsDirectory = $true },
    @{ Path = "$projectRootPath\ESP32_AP-Flasher\"; Pattern = '.pio' ; IsDirectory = $true },
    @{ Path = "$projectRootPath\ESP32_AP-Flasher\logs"; Pattern = '*' }
)

$ignoreDirs = @('.git','node_modules','.venv','.venvs')

$toMove = @()

foreach ($p in $patterns) {
    $base = $p.Path
    if (-not (Test-Path $base)) { continue }
    if ($p.ContainsKey('IsDirectory') -and $p.IsDirectory) {
        # move directory if exists
        $dirPath = Join-Path $base $p.Pattern
        if (Test-Path $dirPath) {
            $toMove += [PSCustomObject]@{ Type='Directory'; Source=$dirPath }
        }
    } else {
        # files matching
        try {
            Get-ChildItem -Path $base -Filter $p.Pattern -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                # skip inside ignore dirs
                $skip = $false
                foreach ($id in $ignoreDirs) { if ($_.FullName -match "\\$id(\\|$)") { $skip = $true; break } }
                if (-not $skip) { $toMove += [PSCustomObject]@{ Type='File'; Source=$_.FullName } }
            }
        } catch {
            # ignore
        }
    }
}

if ($toMove.Count -eq 0) {
    Info "No matched logs or unwanted artifacts found to move."
    exit 0
}

# Prepare archive paths and preview output
$previewLines = @()
$previewLines += "Archive destination: $archiveFull"
$previewLines += "Items to move: $($toMove.Count)"
foreach ($it in $toMove) {
    $rel = $it.Source.Substring($projectRootPath.Length).TrimStart('\') -replace '\\','/'
    $dest = Join-Path $archiveFull $rel
    $previewLines += "$($it.Type) : $rel -> $dest"
}

# Print preview
Write-Output "----- Preview -----"
$previewLines | ForEach-Object { Write-Output $_ }
Write-Output "-------------------"

if (-not $Execute) {
    Info "Preview only. No files moved. Re-run with -Execute to perform the move."
    exit 0
}

# Execute moves
# Create archive base
if (-not (Test-Path $archiveFull)) { New-Item -Path $archiveFull -ItemType Directory -Force | Out-Null }

foreach ($it in $toMove) {
    $src = $it.Source
    $rel = $src.Substring($projectRootPath.Length).TrimStart('\')
    $dest = Join-Path $archiveFull $rel
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path $destDir)) { New-Item -Path $destDir -ItemType Directory -Force | Out-Null }
    try {
        if ($it.Type -eq 'File') {
            Move-Item -Path $src -Destination $dest -Force
            Write-Output "Moved file: $src -> $dest"
        } else {
            Move-Item -Path $src -Destination $dest -Force
            Write-Output "Moved directory: $src -> $dest"
        }
    } catch {
        Warn "Failed to move $src : $_"
    }
}

Info "Completed move into archive: $archiveFull"

# optional: remove empty directories from original locations (not implemented)

exit 0
