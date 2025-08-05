# ESP32 Visibility Problem Diagnostic Script
# This script helps diagnose and fix visibility issues in the ESP32 AP-Flasher web interface

param(
    [Parameter()]
    [ValidateSet("check", "fix", "test", "backup", "restore", "help")]
    [string]$Action = "help",
    
    [Parameter()]
    [switch]$Verbose
)

# Configuration
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

function Check-VisibilityIssues {
    Write-Status "Checking for visibility issues in web files..."
    
    $issues = @()
    
    # Check for common visibility problems in CSS files
    $cssFiles = Get-ChildItem -Path $WwwRoot -Filter "*.css" -Recurse
    
    foreach ($cssFile in $cssFiles) {
        Write-Status "Checking CSS file: $($cssFile.Name)"
        
        $content = Get-Content $cssFile.FullName -Raw
        
        # Check for problematic CSS rules
        if ($content -match "\.feature-card\s*\{[^}]*display\s*:\s*none") {
            $issues += "Feature cards hidden in $($cssFile.Name)"
        }
        
        if ($content -match "\.feature-grid\s*\{[^}]*display\s*:\s*none") {
            $issues += "Feature grid hidden in $($cssFile.Name)"
        }
        
        if ($content -match "opacity\s*:\s*0\s*!important") {
            $issues += "Force opacity zero in $($cssFile.Name)"
        }
    }
    
    # Check HTML files for inline styles
    $htmlFiles = Get-ChildItem -Path $WwwRoot -Filter "*.html" -Recurse
    
    foreach ($htmlFile in $htmlFiles) {
        Write-Status "Checking HTML file: $($htmlFile.Name)"
        
        $content = Get-Content $htmlFile.FullName -Raw
        
        # Check for problematic inline styles
        if ($content -match 'style="[^"]*display\s*:\s*none[^"]*"') {
            $matches = [regex]::Matches($content, 'style="[^"]*display\s*:\s*none[^"]*"')
            foreach ($match in $matches) {
                if ($match.Value -notmatch "config-panel|demo-section") {
                    $issues += "Inline display:none in $($htmlFile.Name)"
                }
            }
        }
    }
    
    # Report findings
    if ($issues.Count -eq 0) {
        Write-Status "✅ No obvious visibility issues found"
    }
    else {
        Write-Warning "⚠️ Found $($issues.Count) potential visibility issues:"
        foreach ($issue in $issues) {
            Write-Warning "  - $issue"
        }
    }
    
    return $issues
}

function Fix-VisibilityIssues {
    Write-Status "Applying visibility fixes..."
    
    # Ensure visibility fix files exist
    $visibilityCSS = Join-Path $WwwRoot "visibility-fix.css"
    $visibilityJS = Join-Path $WwwRoot "visibility-fix.js"
    
    if (-not (Test-Path $visibilityCSS)) {
        Write-Error "Visibility fix CSS not found: $visibilityCSS"
        Write-Status "Please ensure visibility-fix.css has been created"
        return
    }
    
    if (-not (Test-Path $visibilityJS)) {
        Write-Error "Visibility fix JS not found: $visibilityJS"
        Write-Status "Please ensure visibility-fix.js has been created"
        return
    }
    
    # Check if AI agent HTML includes the fixes
    $aiAgentFile = Join-Path $WwwRoot "ai-agent.html"
    if (Test-Path $aiAgentFile) {
        $content = Get-Content $aiAgentFile -Raw
        
        if ($content -notmatch "visibility-fix\.css") {
            Write-Warning "AI agent HTML doesn't include visibility-fix.css"
        }
        else {
            Write-Status "✅ Visibility CSS fix is included"
        }
        
        if ($content -notmatch "visibility-fix\.js") {
            Write-Warning "AI agent HTML doesn't include visibility-fix.js"
        }
        else {
            Write-Status "✅ Visibility JS fix is included"
        }
    }
    
    Write-Status "Visibility fixes check completed"
}

function Test-Visibility {
    Write-Status "Opening visibility test page..."
    
    $testFile = Join-Path $WwwRoot "visibility-test.html"
    
    if (-not (Test-Path $testFile)) {
        Write-Error "Visibility test file not found: $testFile"
        Write-Status "Please ensure visibility-test.html has been created"
        return
    }
    
    # Try to open in default browser
    try {
        Start-Process $testFile
        Write-Status "✅ Opened visibility test page in browser"
        Write-Status "Check the test results and use the debug tools on the page"
    }
    catch {
        Write-Error "Failed to open test page: $_"
        Write-Status "Manually open: $testFile"
    }
}

function Backup-Files {
    Write-Status "Creating backup of current files..."
    
    $backupDir = Join-Path $ProjectRoot "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    
    # Backup key files
    $filesToBackup = @(
        "wwwroot\ai-agent.html",
        "wwwroot\merged-styles.css",
        "wwwroot\dashboard.html"
    )
    
    foreach ($file in $filesToBackup) {
        $sourceFile = Join-Path $ProjectRoot $file
        if (Test-Path $sourceFile) {
            $backupFile = Join-Path $backupDir (Split-Path $file -Leaf)
            Copy-Item $sourceFile $backupFile
            Write-Status "Backed up: $file"
        }
    }
    
    Write-Status "✅ Backup created: $backupDir"
}

function Restore-Files {
    Write-Status "Listing available backups..."
    
    $backupDirs = Get-ChildItem -Path $ProjectRoot -Directory -Filter "backup_*" | Sort-Object Name -Descending
    
    if ($backupDirs.Count -eq 0) {
        Write-Warning "No backup directories found"
        return
    }
    
    Write-Status "Available backups:"
    for ($i = 0; $i -lt $backupDirs.Count; $i++) {
        Write-Host "  $($i + 1). $($backupDirs[$i].Name)" -ForegroundColor Cyan
    }
    
    $selection = Read-Host "Select backup to restore (1-$($backupDirs.Count))"
    
    try {
        $selectedBackup = $backupDirs[$selection - 1]
        $backupFiles = Get-ChildItem -Path $selectedBackup.FullName -File
        
        foreach ($backupFile in $backupFiles) {
            $targetFile = Join-Path $WwwRoot $backupFile.Name
            Copy-Item $backupFile.FullName $targetFile -Force
            Write-Status "Restored: $($backupFile.Name)"
        }
        
        Write-Status "✅ Files restored from $($selectedBackup.Name)"
    }
    catch {
        Write-Error "Invalid selection or restore failed: $_"
    }
}

function Show-Help {
    Write-Host @"
ESP32 Visibility Problem Diagnostic Script

Usage: .\visibility_fix.ps1 [action] [-Verbose]

Actions:
  check    - Check for visibility issues in CSS/HTML files
  fix      - Verify and apply visibility fixes
  test     - Open visibility test page in browser
  backup   - Create backup of current files
  restore  - Restore files from backup
  help     - Show this help message

Examples:
  .\visibility_fix.ps1 check
  .\visibility_fix.ps1 fix
  .\visibility_fix.ps1 test

Visibility Fix Files:
  - wwwroot\visibility-fix.css (CSS fixes)
  - wwwroot\visibility-fix.js (JavaScript diagnostic tool)
  - wwwroot\visibility-test.html (Test page)

Browser Debug Tools:
  1. Open ai-agent.html in browser
  2. Look for "🔍 Debug Visibility" button (top-right)
  3. Click to enable debug mode
  4. Use "🔧 Force Fix" to apply fixes
  5. Check browser console for detailed logs

Manual Browser Testing:
  1. Open browser developer tools (F12)
  2. Navigate to ai-agent.html
  3. In console, run: window.visibilityFixer.diagnoseVisibilityIssues()
  4. Check for errors or hidden elements

Common Issues Fixed:
  - Feature cards with display: none
  - Opacity set to 0
  - Z-index stacking problems
  - Mobile responsive hiding
  - CSS rule conflicts

"@ -ForegroundColor Cyan
}

# Main execution
switch ($Action.ToLower()) {
    "check" { 
        Check-VisibilityIssues 
    }
    "fix" { 
        Fix-VisibilityIssues 
    }
    "test" { 
        Test-Visibility 
    }
    "backup" { 
        Backup-Files 
    }
    "restore" { 
        Restore-Files 
    }
    "help" { 
        Show-Help 
    }
    default { 
        Show-Help 
    }
}
