<#
.SYNOPSIS
    Create (if needed) and initialize a Python virtual environment for ESP32_AP-Flasher helper scripts.
.DESCRIPTION
    - Creates .venv at repository root (ESP32_AP-Flasher/.venv)
    - Upgrades pip
    - Installs requirements.txt
    - Prints activation instructions
.NOTES
    Run from any location: `pwsh -File ESP32_AP-Flasher/scripts/setup_venv.ps1`
#>
[CmdletBinding()]
param(
    [string]$PythonExecutable = 'python'
)

$ErrorActionPreference = 'Stop'

Write-Host "[setup_venv] Using python executable: $PythonExecutable"

# Resolve repo root (script directory -> parent)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir '..')
Set-Location $RepoRoot

$VenvPath = Join-Path $RepoRoot '.venv'
$PythonDir = Join-Path $VenvPath 'Scripts'
$PythonInVenv = Join-Path $PythonDir 'python.exe'

if (-not (Test-Path $VenvPath)) {
    Write-Host "[setup_venv] Creating virtual environment at $VenvPath" -ForegroundColor Cyan
    & $PythonExecutable -m venv $VenvPath
} else {
    Write-Host "[setup_venv] Reusing existing virtual environment at $VenvPath" -ForegroundColor Yellow
}

Write-Host "[setup_venv] Upgrading pip" -ForegroundColor Cyan
& $PythonInVenv -m pip install --upgrade pip

$ReqFile = Join-Path $RepoRoot 'requirements.txt'
if (Test-Path $ReqFile) {
    Write-Host "[setup_venv] Installing requirements from $ReqFile" -ForegroundColor Cyan
    & $PythonInVenv -m pip install -r $ReqFile
} else {
    Write-Warning "requirements.txt not found at $ReqFile"
}

Write-Host "`n[setup_venv] Done." -ForegroundColor Green
Write-Host "Activate with:" -NoNewline; Write-Host " `n    ./.venv/Scripts/Activate.ps1" -ForegroundColor Magenta
Write-Host "Or in this shell session: `n    & '$PythonInVenv' <your_script>.py" -ForegroundColor DarkGray
