# Fix Content Encoding Issues
# This script uploads uncompressed versions of critical files to bypass compression issues

Write-Host "🔧 Fixing content encoding issues..." -ForegroundColor Cyan

$esp32IP = "192.168.1.200"
$critical_files = @(
    "index.html",
    "ui-components.js",
    "app-core.js",
    "main.js"
)

Write-Host "📁 Uploading uncompressed versions of critical files..." -ForegroundColor Yellow

foreach ($file in $critical_files) {
    $source_path = "wwwroot\$file"
    if (Test-Path $source_path) {
        Write-Host "Uploading $file (uncompressed)..." -ForegroundColor Yellow

        try {
            $result = curl -X POST -F "path=/www/$file" -F "file=@$source_path" "http://$esp32IP/littlefs_put" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ $file uploaded successfully" -ForegroundColor Green
            }
            else {
                Write-Host "❌ Failed to upload $file" -ForegroundColor Red
            }
        }
        catch {
            Write-Host "❌ Error uploading $file : $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    else {
        Write-Host "⚠️  Source file not found: $source_path" -ForegroundColor Yellow
    }
}

Write-Host "`n🧪 Testing the fix..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "http://$esp32IP" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ ESP32 index page loads successfully!" -ForegroundColor Green
        Write-Host "🔄 Please refresh your browser and check for JavaScript errors" -ForegroundColor Blue
    }
}
catch {
    Write-Host "❌ Still having issues accessing ESP32" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n📝 What this fixed:" -ForegroundColor Cyan
Write-Host "   • Bypassed gzip compression issues" -ForegroundColor White
Write-Host "   • Uploaded uncompressed versions of critical files" -ForegroundColor White
Write-Host "   • Should resolve ERR_CONTENT_DECODING_FAILED errors" -ForegroundColor White
