# Manual Web File Upload via curl
# Use this if the PowerShell upload script doesn't work

Write-Host "📁 Manually uploading critical fixed files..." -ForegroundColor Green

$files = @(
    @{name = "index.html"; path = "data\www\index.html.gz" },
    @{name = "ui-components.js"; path = "data\www\ui-components.js.gz" }
)

foreach ($file in $files) {
    Write-Host "Uploading $($file.name)..." -ForegroundColor Yellow

    $curlCommand = "curl -X POST -F `"path=/www/$($file.name)`" -F `"file=@$($file.path)`" http://192.168.1.200/littlefs_put"

    try {
        Invoke-Expression $curlCommand
        Write-Host "✅ $($file.name) uploaded successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed to upload $($file.name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n🔄 Please refresh your browser (Ctrl+Shift+R) to see the fixes!" -ForegroundColor Cyan
