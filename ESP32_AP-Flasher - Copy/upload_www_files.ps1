# Upload web files to ESP32 via API
# Usage: .\upload_www_files.ps1 -IPAddress 192.168.4.1

param(
    [Parameter(Mandatory=$false)]
    [string]$IPAddress = "192.168.4.1"  # Default AP mode IP
)

$baseUrl = "http://$IPAddress"
$dataFolder = "data\www"

Write-Host "Uploading web files to ESP32 at $baseUrl..." -ForegroundColor Green

# Test if ESP32 is reachable
try {
    $response = Invoke-WebRequest -Uri $baseUrl -TimeoutSec 5 -ErrorAction Stop
    Write-Host "ESP32 is reachable!" -ForegroundColor Green
} catch {
    Write-Host "Cannot reach ESP32 at $IPAddress. Make sure:" -ForegroundColor Red
    Write-Host "1. ESP32 is powered on and running" -ForegroundColor Yellow
    Write-Host "2. You're connected to the ESP32's WiFi network" -ForegroundColor Yellow
    Write-Host "3. The IP address is correct (try 192.168.4.1 for AP mode)" -ForegroundColor Yellow
    exit 1
}

# Get list of files to upload
$files = Get-ChildItem -Path $dataFolder -File

Write-Host "Found $($files.Count) files to upload..." -ForegroundColor Cyan

foreach ($file in $files) {
    $filePath = "/www/" + $file.Name
    $uploadUrl = "$baseUrl/littlefs_put"
    
    Write-Host "Uploading $($file.Name) to $filePath..." -ForegroundColor Yellow
    
    try {
        # Create multipart form data
        $boundary = [System.Guid]::NewGuid().ToString()
        $LF = "`r`n"
        
        $bodyLines = (
            "--$boundary",
            "Content-Disposition: form-data; name=`"path`"$LF",
            $filePath,
            "--$boundary",
            "Content-Disposition: form-data; name=`"file`"; filename=`"$($file.Name)`"",
            "Content-Type: application/octet-stream$LF",
            [System.IO.File]::ReadAllText($file.FullName),
            "--$boundary--$LF"
        ) -join $LF
        
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyLines)
        
        $response = Invoke-RestMethod -Uri $uploadUrl -Method Post -Body $bodyBytes -ContentType "multipart/form-data; boundary=$boundary" -TimeoutSec 30
        
        Write-Host "✓ Successfully uploaded $($file.Name)" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to upload $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 100  # Small delay between uploads
}

Write-Host "`nUpload complete! Try accessing the web interface at $baseUrl" -ForegroundColor Green
Write-Host "If you see 'index.html not found', try a different IP address or ensure the files uploaded correctly." -ForegroundColor Yellow
