# PowerShell script to update all HTML files with universal menu
$files = @(
    "tags.html",
    "settings.html", 
    "logs.html",
    "tag_control_panel.html",
    "flasher.html",
    "nrf52_swd.html",
    "c6_module.html",
    "updates.html",
    "navigation.html"
)

$rootPath = "d:\projects\esp\OpenEPaperLink\ESP32_AP-Flasher\wwwroot"

foreach ($file in $files) {
    $filePath = Join-Path $rootPath $file
    if (Test-Path $filePath) {
        Write-Host "Updating $file..."
        
        # Read the file content
        $content = Get-Content $filePath -Raw
        
        # Add universal-menu.js script if not already present
        if ($content -notmatch "universal-menu\.js") {
            $content = $content -replace '(\s*<script src="[^"]*\.js[^"]*"[^>]*></script>)(\s*<link rel="stylesheet")', '$1' + "`r`n`t<script src=`"universal-menu.js`" defer></script>$2"
        }
        
        # Replace quick-menu div with menu-container
        $oldMenuPattern = '(?s)<div class="quick-menu">.*?</div>'
        $newMenuContent = "`t`t`t<!-- Universal Menu Container -->`r`n`t`t`t<div id=`"menu-container`" class=`"menu-container`"></div>"
        
        if ($content -match $oldMenuPattern) {
            $content = $content -replace $oldMenuPattern, $newMenuContent
            Write-Host "  - Replaced menu in $file"
        }
        
        # Write back to file
        Set-Content $filePath $content -NoNewline
        Write-Host "  - Updated $file successfully"
    } else {
        Write-Host "File not found: $file" -ForegroundColor Yellow
    }
}

Write-Host "All files updated with universal menu system!" -ForegroundColor Green
