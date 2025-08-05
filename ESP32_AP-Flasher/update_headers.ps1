# Universal Header Integration Script
# This script updates all HTML files to use the universal header

param(
    [Parameter()]
    [ValidateSet("preview", "apply", "revert", "help")]
    [string]$Action = "help",
    
    [Parameter()]
    [switch]$Verbose
)

$ProjectRoot = $PSScriptRoot
$WwwRoot = Join-Path $ProjectRoot "wwwroot"

function Write-Status($message) {
    Write-Host "[INFO] $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "[WARN] $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

function Get-HeaderInstructions {
    return @"
<!-- Universal Header Integration -->
<!-- Include these scripts in your HTML head section: -->
<script src="universal-header-loader.js" defer></script>
<link rel="stylesheet" href="visibility-fix.css" type="text/css" />

<!-- Replace your existing header with this placeholder: -->
<div id="universal-header-placeholder"></div>
"@
}

function Preview-HeaderChanges {
    Write-Status "Previewing header changes for HTML files..."
    
    $htmlFiles = Get-ChildItem -Path $WwwRoot -Filter "*.html" | Where-Object {
        $_.Name -notmatch "universal-header|visibility-test|two-line-header-test|menu-test"
    }
    
    foreach ($htmlFile in $htmlFiles) {
        Write-Status "Analyzing: $($htmlFile.Name)"
        
        $content = Get-Content $htmlFile.FullName -Raw
        
        # Check if already using universal header
        if ($content -match "universal-header-loader\.js") {
            Write-Host "  ✅ Already using universal header" -ForegroundColor Green
            continue
        }
        
        # Check for existing header
        if ($content -match "<header[^>]*class=") {
            Write-Host "  📝 Has existing header - needs update" -ForegroundColor Cyan
            
            # Extract current header type
            if ($content -match '<header[^>]*class="([^"]*)"') {
                Write-Host "    Current header class: $($Matches[1])" -ForegroundColor Gray
            }
        }
        else {
            Write-Host "  ❌ No header found" -ForegroundColor Red
        }
        
        # Check if scripts are included
        if ($content -notmatch "visibility-fix\.css") {
            Write-Host "  📋 Needs visibility-fix.css" -ForegroundColor Yellow
        }
    }
}

function Apply-HeaderChanges {
    Write-Status "Applying universal header to all HTML files..."
    
    $htmlFiles = Get-ChildItem -Path $WwwRoot -Filter "*.html" | Where-Object {
        $_.Name -notmatch "universal-header|visibility-test|two-line-header-test|menu-test"
    }
    
    $updatedCount = 0
    
    foreach ($htmlFile in $htmlFiles) {
        Write-Status "Processing: $($htmlFile.Name)"
        
        try {
            $content = Get-Content $htmlFile.FullName -Raw
            $originalContent = $content
            
            # Skip if already using universal header
            if ($content -match "universal-header-loader\.js") {
                Write-Host "  ⏭️ Already using universal header" -ForegroundColor Yellow
                continue
            }
            
            # Add universal header loader script to head
            if ($content -match "(<head[^>]*>)") {
                $headTag = $Matches[1]
                $newHead = $headTag + "`n`t<!-- Universal Header Integration -->`n`t<script src=`"universal-header-loader.js`" defer></script>"
                $content = $content -replace [regex]::Escape($headTag), $newHead
            }
            
            # Add visibility-fix.css if not present
            if ($content -notmatch "visibility-fix\.css") {
                # Find a good place to add the CSS (after other CSS links)
                if ($content -match "(<link[^>]*\.css[^>]*>)(?=\s*(?:<link|</head>))") {
                    $lastCssLink = $Matches[1]
                    $newCssLink = $lastCssLink + "`n`t<link rel=`"stylesheet`" href=`"visibility-fix.css`" type=`"text/css`" />"
                    $content = $content -replace [regex]::Escape($lastCssLink), $newCssLink
                }
            }
            
            # Replace existing header with placeholder
            if ($content -match "<header[^>]*>.*?</header>") {
                $content = $content -replace "<header[^>]*>.*?</header>", '<div id="universal-header-placeholder"></div>'
            }
            else {
                # Add placeholder at the beginning of body
                if ($content -match "(<body[^>]*>)") {
                    $bodyTag = $Matches[1]
                    $newBody = $bodyTag + "`n`t<div id=`"universal-header-placeholder`"></div>"
                    $content = $content -replace [regex]::Escape($bodyTag), $newBody
                }
            }
            
            # Only write if content changed
            if ($content -ne $originalContent) {
                Set-Content $htmlFile.FullName -Value $content -Encoding UTF8
                Write-Host "  ✅ Updated successfully" -ForegroundColor Green
                $updatedCount++
            }
            else {
                Write-Host "  ⏭️ No changes needed" -ForegroundColor Yellow
            }
            
        }
        catch {
            Write-Error "  ❌ Failed to update: $_"
        }
    }
    
    Write-Status "Updated $updatedCount files with universal header"
}

function Revert-HeaderChanges {
    Write-Status "Reverting universal header changes..."
    
    $backupDirs = Get-ChildItem -Path $ProjectRoot -Directory -Filter "backup_*" | Sort-Object Name -Descending
    
    if ($backupDirs.Count -eq 0) {
        Write-Warning "No backup directories found to revert from"
        return
    }
    
    $latestBackup = $backupDirs[0]
    Write-Status "Reverting from backup: $($latestBackup.Name)"
    
    $backupFiles = Get-ChildItem -Path $latestBackup.FullName -Filter "*.html"
    
    foreach ($backupFile in $backupFiles) {
        $targetFile = Join-Path $WwwRoot $backupFile.Name
        if (Test-Path $targetFile) {
            Copy-Item $backupFile.FullName $targetFile -Force
            Write-Status "Reverted: $($backupFile.Name)"
        }
    }
}

function Show-Help {
    Write-Host @"
Universal Header Integration Script

This script helps integrate the universal header across all HTML pages in the project.

Usage: .\update_headers.ps1 [action] [-Verbose]

Actions:
  preview  - Show what changes would be made to each file
  apply    - Apply universal header integration to all HTML files
  revert   - Revert changes using the latest backup
  help     - Show this help message

Examples:
  .\update_headers.ps1 preview
  .\update_headers.ps1 apply
  .\update_headers.ps1 revert

What this script does:
1. Adds universal-header-loader.js to all HTML files
2. Adds visibility-fix.css for consistent styling
3. Replaces existing headers with universal header placeholder
4. Preserves page-specific configurations

Files created:
- wwwroot\universal-header.html (Universal header template)
- wwwroot\universal-header-loader.js (Header loading script)
- wwwroot\visibility-fix.css (Updated with header styles)

Manual Integration:
If you prefer to manually integrate, add these to each HTML file:

$(Get-HeaderInstructions)

"@ -ForegroundColor Cyan
}

# Main execution
switch ($Action.ToLower()) {
    "preview" { 
        Preview-HeaderChanges 
    }
    "apply" { 
        Apply-HeaderChanges 
    }
    "revert" { 
        Revert-HeaderChanges 
    }
    "help" { 
        Show-Help 
    }
    default { 
        Show-Help 
    }
}
