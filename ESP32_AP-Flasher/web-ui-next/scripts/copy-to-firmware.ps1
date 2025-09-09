param(
  [switch]$Clean,
  [string]$Source = "out",
  [string]$Target = "..\..\data\www-next"
)

$ErrorActionPreference = 'Stop'

Write-Host "[copy-to-firmware] Source: $Source  Target: $Target"

if (-not (Test-Path $Source)) {
  Write-Error "Source folder '$Source' not found. Run: npm run export:static"
}

if ($Clean -and (Test-Path $Target)) {
  Write-Host "Cleaning target $Target"
  Remove-Item -Recurse -Force $Target
}

if (-not (Test-Path $Target)) {
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
}

Get-ChildItem -Recurse -File $Source | ForEach-Object {
  $rel = $_.FullName.Substring((Resolve-Path $Source).Path.Length).TrimStart('\\', '/')
  $dest = Join-Path $Target $rel
  $destDir = Split-Path $dest -Parent
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
  Copy-Item $_.FullName $dest -Force
}

Write-Host "Copy complete. Optionally gzip with:"
Write-Host "python ..\..\gzip_wwwfiles.py --source $Target --dest ..\..\data\www-next-gz --clean"
