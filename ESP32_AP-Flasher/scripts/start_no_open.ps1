#!/usr/bin/env pwsh
<#
Start services without opening any browser windows or extra consoles.

This script:
- starts a Python simple HTTP server serving the repo's web-ui/public folder on port 8001
- starts ngrok (if available) to forward to localhost:8001
- runs both processes hidden and writes PIDs and logs to .\logs\no_open

Usage: .\start_no_open.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServeDir = Join-Path $RepoRoot "..\web-ui\public"
$LogDir = Join-Path $RepoRoot "..\..\logs\no_open"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$PythonExe = "python"
$Port = 8001

$PidFile = Join-Path $LogDir "pids.json"

function Start-HiddenProcess($filePath, $arguments, $outLog, $errLog) {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $filePath
  $startInfo.Arguments = $arguments
  $startInfo.WorkingDirectory = $ServeDir
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $startInfo
  $proc.Start() | Out-Null

  # Async capture output to files
  $stdOut = $proc.StandardOutput
  $stdErr = $proc.StandardError

  Start-Job -ScriptBlock {
    param($reader, $path)
    while (-not $reader.EndOfStream) {
      $line = $reader.ReadLine()
      Add-Content -Path $path -Value $line
    }
  } -ArgumentList $stdOut, $outLog | Out-Null

  Start-Job -ScriptBlock {
    param($reader, $path)
    while (-not $reader.EndOfStream) {
      $line = $reader.ReadLine()
      Add-Content -Path $path -Value $line
    }
  } -ArgumentList $stdErr, $errLog | Out-Null

  return $proc
}

Write-Host "Starting python server (hidden) serving: $ServeDir on port $Port"
$pyOut = Join-Path $LogDir "python.out.log"
$pyErr = Join-Path $LogDir "python.err.log"

$pyArgs = "-m http.server $Port --directory `"$ServeDir`""
$pyProc = Start-HiddenProcess $PythonExe $pyArgs $pyOut $pyErr

Write-Host "Started python (PID: $($pyProc.Id))"

# Try to find ngrok in PATH or common install location
$ngrokExe = "ngrok"
try {
  & $ngrokExe version 2>$null
}
catch {
  $ngrokPath = Join-Path $env:USERPROFILE "AppData\Local\ngrok\ngrok.exe"
  if (Test-Path $ngrokPath) { $ngrokExe = $ngrokPath }
}

$ngrokOut = Join-Path $LogDir "ngrok.out.log"
$ngrokErr = Join-Path $LogDir "ngrok.err.log"

if (Get-Command $ngrokExe -ErrorAction SilentlyContinue) {
  Write-Host "Starting ngrok (hidden) -> http://localhost:$Port"
  $ngrokArgs = "http http://localhost:$Port --log=stdout"
  $ngrokProc = Start-HiddenProcess $ngrokExe $ngrokArgs $ngrokOut $ngrokErr
  Write-Host "Started ngrok (PID: $($ngrokProc.Id))"
}
else {
  Write-Host "ngrok not found in PATH or default location; skipping ngrok start." -ForegroundColor Yellow
  $ngrokProc = $null
}

# Save PIDs
$pids = @{
  python = if ($pyProc) { $pyProc.Id } else { $null }
  ngrok  = if ($ngrokProc) { $ngrokProc.Id } else { $null }
}
Set-Content -Path $PidFile -Value ($pids | ConvertTo-Json -Depth 2)
Write-Host "PID file written: $PidFile"
Write-Host "Logs: $LogDir"

Write-Host "Start complete. Use scripts\stop_no_open.ps1 to stop these background processes." -ForegroundColor Green
