# Upload web files to ESP32 via API using curl
# Usage: .\upload_www_curl.ps1 -IPAddress 192.168.4.1

param(
    [Parameter(Mandatory=$false)]
    [string]$IPAddress = "192.168.4.1"  # Default AP mode IP
)

$baseUrl = "http://$IPAddress"
$dataFolder = "data\www"

Write-Host "Uploading web files to ESP32 at $baseUrl..." -ForegroundColor Green

# Test if ESP32 is reachable
Write-Host "Testing connection to ESP32..." -ForegroundColor Cyan
$pingResult = Test-NetConnection -ComputerName $IPAddress -Port 80 -WarningAction SilentlyContinue

if (-not $pingResult.TcpTestSucceeded) {
    Write-Host "Cannot reach ESP32 at $IPAddress. Make sure:" -ForegroundColor Red
    Write-Host "1. ESP32 is powered on and running" -ForegroundColor Yellow
    Write-Host "2. You're connected to the ESP32's WiFi network (try OpenEPaperLink or ESP_xxx)" -ForegroundColor Yellow
    Write-Host "3. The IP address is correct (try 192.168.4.1 for AP mode)" -ForegroundColor Yellow
    exit 1
}

Write-Host "ESP32 is reachable!" -ForegroundColor Green

# Check if curl is available
try {
    curl.exe --version | Out-Null
} catch {
    Write-Host "curl is not available. Please install curl or use Windows 10/11 which includes it." -ForegroundColor Red
    exit 1
}

# Get list of files to upload recursively
if (-not (Test-Path $dataFolder)) {
    Write-Host "Data folder '$dataFolder' not found. Please run 'python gzip_wwwfiles.py' first." -ForegroundColor Red
    exit 1
}

$files = Get-ChildItem -Path $dataFolder -File -Recurse

Write-Host "Found $($files.Count) files to upload..." -ForegroundColor Cyan

$successCount = 0
$failCount = 0

$dataFolderPath = (Get-Item $dataFolder).FullName

foreach ($file in $files) {
    # Calculate relative path from data folder to maintain directory structure
    $relativePath = $file.FullName.Substring($dataFolderPath.Length + 1).Replace('\', '/')
    $filePath = "/www/" + $relativePath
    $uploadUrl = "$baseUrl/littlefs_put"
    
    Write-Host "Uploading $relativePath to $filePath..." -ForegroundColor Yellow
    
    try {
        # Use curl to upload the file
        $result = curl.exe -X POST -F "path=$filePath" -F "file=@$($file.FullName)" $uploadUrl 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Successfully uploaded $relativePath" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "✗ Failed to upload ${relativePath}: $result" -ForegroundColor Red
            $failCount++
        }
    } catch {
        Write-Host "✗ Failed to upload ${relativePath}: $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
    }
    
    Start-Sleep -Milliseconds 200  # Small delay between uploads
}

Write-Host "`nUpload Summary:" -ForegroundColor Cyan
Write-Host "  ✓ Successful: $successCount" -ForegroundColor Green
Write-Host "  ✗ Failed: $failCount" -ForegroundColor Red

if ($successCount -gt 0) {
    Write-Host "`nTry accessing the web interface at $baseUrl" -ForegroundColor Green
    Write-Host "If you still see 'index.html not found', wait a few seconds and refresh." -ForegroundColor Yellow
} else {
    Write-Host "`nNo files were uploaded successfully. Check your connection and try again." -ForegroundColor Red
}
