<#
Scan ESP32_AP-Flasher/lib and lib2 for duplicate filenames across libraries.
Writes a detailed report to build/logs/duplicate_lib_report.txt and prints a concise summary.

Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\check_duplicate_libs.ps1

#>

param(
    [string]$ProjectRoot = $(Split-Path -Parent $PSScriptRoot),
    [string[]]$LibDirs = @('lib','lib2'),
    [string]$ReportPath = "$PSScriptRoot\..\logs\duplicate_lib_report.txt"
)

function Get-NowIso() { Get-Date -Format o }

Write-Output "$(Get-NowIso) - Starting duplicate library filename scan"

$absProjectRoot = Resolve-Path $ProjectRoot

$searchExt = @('*.h','*.hpp','*.c','*.cpp','*.cc')

$entries = @()

foreach ($d in $LibDirs) {
    $full = Join-Path $absProjectRoot $d
    if (-not (Test-Path $full)) {
        Write-Output "$(Get-NowIso) - Skipping missing directory: $full"
        continue
    }
    foreach ($ext in $searchExt) {
        Get-ChildItem -Path $full -Recurse -Filter $ext -File -ErrorAction SilentlyContinue | ForEach-Object {
            $entries += [PSCustomObject]@{
                Name = $_.Name
                RelPath = $_.FullName.Substring($absProjectRoot.Path.Length + 1) -replace '\\','/'
                FullPath = $_.FullName
                LibraryRoot = (Resolve-Path $_.Directory.FullName).Path.Substring($absProjectRoot.Path.Length + 1) -split '[\\/]' | Select-Object -First 1
            }
        }
    }
}

if ($entries.Count -eq 0) {
    Write-Output "$(Get-NowIso) - No header/source files found under the configured lib directories."
    exit 0
}

$grouped = $entries | Group-Object -Property Name

$duplicates = $grouped | Where-Object { $_.Count -gt 1 }

$reportLines = @()
$reportLines += "$(Get-NowIso) - Duplicate library filename report"
$reportLines += "Project root: $($absProjectRoot.Path)"
$reportLines += "Searched lib dirs: $($LibDirs -join ', ')"
$reportLines += "Found files: $($entries.Count)"
$reportLines += ""

if ($duplicates.Count -eq 0) {
    $reportLines += "No duplicate basenames found across lib directories."
} else {
    $reportLines += "Duplicates detected (basename -> occurrences):"
    foreach ($g in $duplicates | Sort-Object Name) {
        $reportLines += "- $($g.Name) : $($g.Count) occurrences"
        foreach ($it in $g.Group) {
            $reportLines += "    - $($it.RelPath)"
        }
        $reportLines += ""
    }
}

$reportLines += "Analysis notes:"
$reportLines += "- Files with identical basenames can cause include-resolution ambiguity depending on build system include order."
$reportLines += "- Recommended remediations: keep one copy, rename locally-scoped headers, or adjust include paths in your build system."

$reportDir = Split-Path -Parent $ReportPath
if (-not (Test-Path $reportDir)) { New-Item -Path $reportDir -ItemType Directory -Force | Out-Null }

$reportLines | Out-File -FilePath $ReportPath -Encoding utf8

Write-Output "$(Get-NowIso) - Wrote detailed report to: $ReportPath"

Write-Output "Summary:"
if ($duplicates.Count -eq 0) {
    Write-Output "  No duplicate basenames found."
} else {
    foreach ($g in $duplicates | Sort-Object Name) {
        Write-Output "  $($g.Name) -> $($g.Count) occurrences"
    }
    Write-Output "See report for full paths and remediation suggestions."
}

Write-Output "$(Get-NowIso) - Done"
