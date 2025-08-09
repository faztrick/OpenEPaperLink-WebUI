#!/usr/bin/env pwsh
# Project Cleanup Script - Remove unwanted files and cache
param(
    [switch]$DryRun,
    [switch]$Verbose,
    [switch]$KeepBuild
)

Write-Host "🧹 ESP32 Project Cleanup Tool" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No files will be deleted" -ForegroundColor Yellow
    Write-Host ""
}

$projectRoot = Get-Location
Write-Host "📂 Project root: $projectRoot" -ForegroundColor Cyan

# Define unwanted file patterns
$unwantedPatterns = @(
    # Cache and temporary files
    "**/.DS_Store",
    "**/Thumbs.db",
    "**/*.tmp",
    "**/*.temp",
    "**/~*",

    # IDE files
    "**/.vscode/settings.json.bak",
    "**/.vscode/*.log",
    "**/**.swp",
    "**/**.swo",
    "**/.idea/*",

    # Compilation artifacts
    "**/*.o",
    "**/*.obj",
    "**/*.exe",
    "**/*.dll",
    "**/*.so",
    "**/*.dylib",

    # Log files
    "**/*.log",
    "**/debug.txt",
    "**/error.txt",

    # Backup files
    "**/*.bak",
    "**/*.backup",
    "**/*~",
    "**/#*#",

    # OS generated files
    "**/desktop.ini",
    "**/.directory",

    # Node.js (if any)
    "**/node_modules/*",

    # Python cache (if any)
    "**/__pycache__/*",
    "**/*.pyc",
    "**/*.pyo",

    # Build artifacts (optional)
    "**/build/**/*.bin.old",
    "**/build/**/*.elf.old",
    "**/.pio/build/**/*.bin.old"
)

# Define build patterns (removed only if -KeepBuild is not specified)
$buildPatterns = @(
    ".pio/build/**/firmware.*",
    ".pio/libdeps/**",
    "build/**",
    "compile_commands.json"
)

if (-not $KeepBuild) {
    $unwantedPatterns += $buildPatterns
    Write-Host "🏗️ Build files will be cleaned (use -KeepBuild to preserve)" -ForegroundColor Yellow
}
else {
    Write-Host "🏗️ Build files will be preserved" -ForegroundColor Green
}

$deletedCount = 0
$totalSize = 0

function Remove-UnwantedFiles {
    param(
        [string[]]$Patterns,
        [string]$Description
    )

    Write-Host "`n🔍 Scanning for $Description..." -ForegroundColor Cyan

    foreach ($pattern in $Patterns) {
        if ($Verbose) {
            Write-Host "   Checking pattern: $pattern" -ForegroundColor Gray
        }

        $files = Get-ChildItem -Path $projectRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like "*$($pattern.Replace('**/', '').Replace('*', '*'))*" }

        foreach ($file in $files) {
            $size = $file.Length
            $script:totalSize += $size
            $script:deletedCount++

            $relativePath = [System.IO.Path]::GetRelativePath($projectRoot, $file.FullName)

            if ($DryRun) {
                Write-Host "   [DRY RUN] Would delete: $relativePath ($([math]::Round($size/1KB, 2)) KB)" -ForegroundColor Yellow
            }
            else {
                try {
                    Remove-Item $file.FullName -Force
                    Write-Host "   ✅ Deleted: $relativePath ($([math]::Round($size/1KB, 2)) KB)" -ForegroundColor Green
                }
                catch {
                    Write-Host "   ❌ Failed to delete: $relativePath - $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
    }
}

function Remove-EmptyDirectories {
    Write-Host "`n🗂️ Removing empty directories..." -ForegroundColor Cyan

    do {
        $emptyDirs = Get-ChildItem -Path $projectRoot -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { (Get-ChildItem $_.FullName -Force -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0 }

        foreach ($dir in $emptyDirs) {
            $relativePath = [System.IO.Path]::GetRelativePath($projectRoot, $dir.FullName)

            if ($DryRun) {
                Write-Host "   [DRY RUN] Would remove empty directory: $relativePath" -ForegroundColor Yellow
            }
            else {
                try {
                    Remove-Item $dir.FullName -Force
                    Write-Host "   ✅ Removed empty directory: $relativePath" -ForegroundColor Green
                }
                catch {
                    Write-Host "   ❌ Failed to remove directory: $relativePath - $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
    } while ($emptyDirs.Count -gt 0 -and -not $DryRun)
}

function Clear-GitCache {
    Write-Host "`n🌿 Git cache cleanup..." -ForegroundColor Cyan

    if (Test-Path ".git") {
        if ($DryRun) {
            Write-Host "   [DRY RUN] Would run: git gc --aggressive --prune=now" -ForegroundColor Yellow
        }
        else {
            try {
                git gc --aggressive --prune=now 2>$null
                Write-Host "   ✅ Git cache cleaned" -ForegroundColor Green
            }
            catch {
                Write-Host "   ⚠️ Git cache cleanup failed or not available" -ForegroundColor Yellow
            }
        }
    }
    else {
        Write-Host "   ⚠️ Not a git repository" -ForegroundColor Yellow
    }
}

function Show-DiskUsage {
    Write-Host "`n📊 Disk usage analysis..." -ForegroundColor Cyan

    $totalProjectSize = (Get-ChildItem -Path $projectRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum

    Write-Host "   Total project size: $([math]::Round($totalProjectSize/1MB, 2)) MB" -ForegroundColor White

    # Show largest directories
    $largeDirs = Get-ChildItem -Path $projectRoot -Directory -Force -ErrorAction SilentlyContinue |
    ForEach-Object {
        $size = (Get-ChildItem $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{
            Name   = $_.Name
            SizeMB = [math]::Round($size / 1MB, 2)
        }
    } | Sort-Object SizeMB -Descending | Select-Object -First 5

    Write-Host "   Largest directories:" -ForegroundColor White
    foreach ($dir in $largeDirs) {
        Write-Host "     $($dir.Name): $($dir.SizeMB) MB" -ForegroundColor Gray
    }
}

# Main cleanup execution
try {
    Show-DiskUsage

    Remove-UnwantedFiles -Patterns $unwantedPatterns -Description "unwanted files"
    Remove-EmptyDirectories
    Clear-GitCache

    Write-Host "`n📈 Cleanup Summary:" -ForegroundColor Green
    Write-Host "=================" -ForegroundColor Green

    if ($DryRun) {
        Write-Host "🔍 DRY RUN RESULTS:" -ForegroundColor Yellow
        Write-Host "   Files that would be deleted: $deletedCount" -ForegroundColor White
        Write-Host "   Space that would be freed: $([math]::Round($totalSize/1MB, 2)) MB" -ForegroundColor White
    }
    else {
        Write-Host "✅ CLEANUP COMPLETED:" -ForegroundColor Green
        Write-Host "   Files deleted: $deletedCount" -ForegroundColor White
        Write-Host "   Space freed: $([math]::Round($totalSize/1MB, 2)) MB" -ForegroundColor White
    }

    Show-DiskUsage

}
catch {
    Write-Host "❌ Error during cleanup: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎯 Cleanup completed successfully!" -ForegroundColor Green
Write-Host "Usage examples:" -ForegroundColor Cyan
Write-Host "   .\cleanup_project.ps1 -DryRun      # Preview what will be deleted" -ForegroundColor Gray
Write-Host "   .\cleanup_project.ps1 -KeepBuild   # Clean but preserve build files" -ForegroundColor Gray
Write-Host "   .\cleanup_project.ps1 -Verbose     # Show detailed output" -ForegroundColor Gray
