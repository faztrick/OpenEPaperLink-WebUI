#!/usr/bin/env pwsh
<#
Run a command hidden (no visible window). Useful for launching background helpers without popping up PowerShell.

Usage:
  .\run_hidden.ps1 -Command "python -m http.server 8001 --directory C:\path\to\dir" -Out logs/hidden.out -Err logs/hidden.err

This script starts the requested command using System.Diagnostics.Process with CreateNoWindow = $true
and redirects stdout/stderr to the supplied files.
#>

param(
  [Parameter(Mandatory = $true)] [string]$Command,
  [string]$Out = "logs/hidden.out",
  [string]$Err = "logs/hidden.err",
  [string]$WorkingDir = $(Get-Location)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path (Split-Path -Path $Out -Parent))) { New-Item -ItemType Directory -Path (Split-Path -Path $Out -Parent) -Force | Out-Null }
if (-not (Test-Path (Split-Path -Path $Err -Parent))) { New-Item -ItemType Directory -Path (Split-Path -Path $Err -Parent) -Force | Out-Null }

Write-Host "Launching hidden: $Command"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = "/c $Command"
$psi.WorkingDirectory = $WorkingDir
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$proc.Start() | Out-Null

$outWriter = [System.IO.File]::CreateText($Out)
$errWriter = [System.IO.File]::CreateText($Err)

Start-Job -ScriptBlock {
  param($reader, $writerPath)
  while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()
    Add-Content -Path $writerPath -Value $line
  }
} -ArgumentList $proc.StandardOutput, $Out | Out-Null

Start-Job -ScriptBlock {
  param($reader, $writerPath)
  while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()
    Add-Content -Path $writerPath -Value $line
  }
} -ArgumentList $proc.StandardError, $Err | Out-Null

Write-Host "Started hidden process (PID: $($proc.Id)). Output: $Out, Error: $Err"

return $proc.Id
