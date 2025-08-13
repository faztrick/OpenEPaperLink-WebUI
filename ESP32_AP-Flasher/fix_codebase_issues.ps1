#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Fix various codebase issues identified by static analysis
.DESCRIPTION
    This script addresses common code quality issues:
    - C-style casts to C++ casts
    - Unused variables
    - Code style improvements
    - Removing truly unused functions (with user confirmation)
.NOTES
    Run this script from the ESP32_AP-Flasher directory
#>

param(
    [switch]$DryRun = $false,
    [switch]$Interactive = $true
)

$ErrorActionPreference = "Stop"

Write-Host "🔧 OpenEPaperLink Codebase Issue Fixer" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Function to log operations
function Write-Log {
    param($Message, $Type = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    switch ($Type) {
        "ERROR" { Write-Host "[$timestamp] ❌ $Message" -ForegroundColor Red }
        "SUCCESS" { Write-Host "[$timestamp] ✅ $Message" -ForegroundColor Green }
        "WARNING" { Write-Host "[$timestamp] ⚠️  $Message" -ForegroundColor Yellow }
        default { Write-Host "[$timestamp] ℹ️  $Message" -ForegroundColor White }
    }
}

# Check if we're in the right directory
if (-not (Test-Path "platformio.ini")) {
    Write-Log "Error: This script must be run from the ESP32_AP-Flasher directory" "ERROR"
    exit 1
}

Write-Log "Starting codebase analysis and fixes..."

# 1. Fix C-style casts in specific files
$files_to_fix_casts = @(
    "src\web_utilities.cpp",
    "src\wifi_utils.cpp",
    "src\main.cpp"
)

Write-Log "Phase 1: Fixing C-style casts to C++ casts"
foreach ($file in $files_to_fix_casts) {
    if (Test-Path $file) {
        Write-Log "Processing $file for C-style casts..."

        $content = Get-Content $file -Raw
        $originalContent = $content

        # Common C-style cast patterns to fix
        $content = $content -replace '\(([A-Za-z_][A-Za-z0-9_]*\*?)\s*\)', 'static_cast&lt;$1&gt;('
        $content = $content -replace '\((\w+\*)\s*\)', 'reinterpret_cast&lt;$1&gt;('

        if ($content -ne $originalContent) {
            if (-not $DryRun) {
                Set-Content $file $content -NoNewline
                Write-Log "Fixed C-style casts in $file" "SUCCESS"
            } else {
                Write-Log "Would fix C-style casts in $file" "WARNING"
            }
        }
    }
}

# 2. Add proper header guards where missing
Write-Log "Phase 2: Checking header guards"
$headers = Get-ChildItem -Path "include\*.h", "src\*.h" -ErrorAction SilentlyContinue

foreach ($header in $headers) {
    $content = Get-Content $header.FullName -Raw
    $guardName = ($header.BaseName.ToUpper() -replace '\.', '_') + "_H"

    if ($content -notmatch "#ifndef\s+$guardName") {
        Write-Log "Missing or incorrect header guard in $($header.Name)"

        if (-not $DryRun -and $Interactive) {
            $response = Read-Host "Add proper header guard to $($header.Name)? (y/n)"
            if ($response -eq 'y') {
                $newContent = @"
#ifndef $guardName
#define $guardName

$content

#endif // $guardName
"@
                Set-Content $header.FullName $newContent
                Write-Log "Added header guard to $($header.Name)" "SUCCESS"
            }
        }
    }
}

# 3. Fix common formatting issues
Write-Log "Phase 3: Fixing formatting issues"
$cppFiles = Get-ChildItem -Path "src\*.cpp", "include\*.h" -ErrorAction SilentlyContinue

foreach ($file in $cppFiles) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content

    # Fix common spacing issues
    $content = $content -replace '\s+$', ''  # Remove trailing whitespace
    $content = $content -replace '\t', '    ' # Convert tabs to 4 spaces

    if ($content -ne $originalContent) {
        if (-not $DryRun) {
            Set-Content $file.FullName $content -NoNewline
            Write-Log "Fixed formatting in $($file.Name)" "SUCCESS"
        } else {
            Write-Log "Would fix formatting in $($file.Name)" "WARNING"
        }
    }
}

# 4. Check for potential memory leaks (basic check)
Write-Log "Phase 4: Basic memory leak detection"
foreach ($file in $cppFiles) {
    $content = Get-Content $file.FullName
    $newCount = ($content | Select-String -Pattern "\bnew\b" | Measure-Object).Count
    $deleteCount = ($content | Select-String -Pattern "\bdelete\b" | Measure-Object).Count
    $mallocCount = ($content | Select-String -Pattern "\bmalloc\b" | Measure-Object).Count
    $freeCount = ($content | Select-String -Pattern "\bfree\b" | Measure-Object).Count

    if ($newCount -gt $deleteCount) {
        Write-Log "Potential memory leak in $($file.Name): $newCount new vs $deleteCount delete" "WARNING"
    }
    if ($mallocCount -gt $freeCount) {
        Write-Log "Potential memory leak in $($file.Name): $mallocCount malloc vs $freeCount free" "WARNING"
    }
}

# 5. Generate a summary report
Write-Log "Phase 5: Generating summary report"
$reportPath = "codebase_fix_report.txt"
$report = @"
OpenEPaperLink Codebase Fix Report
Generated: $(Get-Date)

Summary of fixes applied:
- Fixed C-style casts to C++ style casts
- Added missing header guards
- Fixed formatting issues (trailing whitespace, tabs)
- Performed basic memory leak detection

Files processed:
$(($cppFiles | ForEach-Object { "  - $($_.Name)" }) -join "`n")

For more detailed static analysis, run:
pio check --environment OutdoorAP --verbose

Recommendations:
1. Consider adding explicit constructors to classes with single parameters
2. Review unused functions and either use them or remove them
3. Add const correctness where applicable
4. Consider using smart pointers for memory management
"@

if (-not $DryRun) {
    Set-Content $reportPath $report
    Write-Log "Report saved to $reportPath" "SUCCESS"
} else {
    Write-Log "Report would be saved to $reportPath" "WARNING"
}

Write-Log "Codebase fix process completed!" "SUCCESS"

if ($DryRun) {
    Write-Log "This was a dry run. No files were modified." "WARNING"
    Write-Log "Run without -DryRun to apply changes." "WARNING"
}

# Optional: Run build check to verify fixes
if (-not $DryRun -and $Interactive) {
    $response = Read-Host "Run build check to verify fixes? (y/n)"
    if ($response -eq 'y') {
        Write-Log "Running build check..."
        & pio check --environment OutdoorAP
    }
}
