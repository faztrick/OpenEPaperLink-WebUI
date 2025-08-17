#!/usr/bin/env pwsh
<#
Stop processes started by start_no_open.ps1

Usage: .\stop_no_open.ps1
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $RepoRoot "..\..\logs\no_open"
$PidFile = Join-Path $LogDir "pids.json"

if (-not (Test-Path $PidFile)) {
  Write-Host "PID file not found: $PidFile" -ForegroundColor Yellow
  exit 0
}

$pids = Get-Content $PidFile | ConvertFrom-Json

function Stop-IfRunning($procId) {
  if (-not $procId) { return }
  try {
    $proc = Get-Process -Id $procId -ErrorAction Stop
    Write-Host "Stopping PID $procId ($($proc.ProcessName))"
    $proc | Stop-Process -Force
  }
  catch {
    Write-Host "Process $procId not running" -ForegroundColor Green
  }
}

Stop-IfRunning $pids.python
Stop-IfRunning $pids.ngrok

Remove-Item $PidFile -ErrorAction SilentlyContinue
Write-Host "Stopped processes and removed PID file." -ForegroundColor Green
