# Simple upload script for ESP32 web files
param(
    [string]$IPAddress = "192.168.4.1"
)

$baseUrl = "http://$IPAddress"
$dataFolder = "data\www"

Write-Host "Uploading web files to ESP32 at $baseUrl..." -ForegroundColor Green

# Check if data folder exists
if (-not (Test-Path $dataFolder)) {
    Write-Host "Data folder '$dataFolder' not found. Please run 'python gzip_wwwfiles.py' first." -ForegroundColor Red
    exit 1
}

$files = Get-ChildItem -Path $dataFolder -File | Select-Object -First 5  # Start with first 5 files

Write-Host "Found $($files.Count) files to upload..." -ForegroundColor Cyan

foreach ($file in $files) {
    $filePath = "/www/" + $file.Name
    $uploadUrl = "$baseUrl/littlefs_put"
    
    Write-Host "Uploading $($file.Name)..." -ForegroundColor Yellow
    
    try {
        $result = curl.exe -X POST -F "path=$filePath" -F "file=@$($file.FullName)" $uploadUrl --connect-timeout 10 --max-time 30
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Success: $($file.Name)" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed: $($file.Name) - Exit code: $LASTEXITCODE" -ForegroundColor Red
        }
    } catch {
        Write-Host "✗ Error uploading $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nUpload attempt complete. Check $baseUrl to see if the UI is working." -ForegroundColor Cyan
