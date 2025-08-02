# OTA Flash Script for OpenEPaperLink ESP32 AP
# Usage: .\ota_flash.ps1 -IPAddress "192.168.87.133" -BinaryPath ".\espbinaries\ESP32_S3_C6_NANO_AP.bin"

param(
    [Parameter(Mandatory=$true)]
    [string]$IPAddress,
    
    [Parameter(Mandatory=$false)]
    [string]$BinaryPath = ".\espbinaries\ESP32_S3_C6_NANO_AP.bin",
    
    [Parameter(Mandatory=$false)]
    [int]$TimeoutSeconds = 120
)

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    
    $colorMap = @{
        "Success" = "Green"
        "Warning" = "Yellow"
        "Error" = "Red"
        "Info" = "Cyan"
        "White" = "White"
    }
    
    $consoleColor = if ($colorMap.ContainsKey($Color)) { $colorMap[$Color] } else { "White" }
    Write-Host $Message -ForegroundColor $consoleColor
}

# Check if binary file exists
if (-not (Test-Path $BinaryPath)) {
    Write-ColorOutput "❌ Error: Binary file not found at $BinaryPath" "Error"
    Write-ColorOutput "Available binaries:" "Info"
    Get-ChildItem ".\espbinaries\*.bin" | ForEach-Object { Write-ColorOutput "  - $($_.Name)" "Info" }
    exit 1
}

$BinaryFullPath = (Resolve-Path $BinaryPath).Path
$BinarySize = (Get-Item $BinaryFullPath).Length

Write-ColorOutput "🚀 OpenEPaperLink OTA Flash Tool" "Info"
Write-ColorOutput "=================================" "Info"
Write-ColorOutput "Target IP: $IPAddress" "Info"
Write-ColorOutput "Binary: $BinaryPath" "Info"
Write-ColorOutput "Size: $([math]::Round($BinarySize / 1MB, 2)) MB" "Info"
Write-ColorOutput "" "Info"

# Test connectivity
Write-ColorOutput "🔍 Testing connectivity to $IPAddress..." "Info"
try {
    $response = Invoke-WebRequest -Uri "http://$IPAddress/" -TimeoutSec 10 -ErrorAction Stop
    Write-ColorOutput "✅ Device is reachable" "Success"
} catch {
    Write-ColorOutput "❌ Error: Cannot reach device at $IPAddress" "Error"
    Write-ColorOutput "Please check:" "Warning"
    Write-ColorOutput "  - Device is powered on and connected" "Warning"
    Write-ColorOutput "  - IP address is correct" "Warning"
    Write-ColorOutput "  - Network connectivity" "Warning"
    exit 1
}

# Check if OTA endpoint exists
Write-ColorOutput "🔍 Checking for OTA update endpoint..." "Info"
try {
    $otaResponse = Invoke-WebRequest -Uri "http://$IPAddress/update" -Method GET -TimeoutSec 10 -ErrorAction Stop
    Write-ColorOutput "✅ OTA endpoint found" "Success"
} catch {
    Write-ColorOutput "⚠️  Direct OTA endpoint not found, trying alternative methods..." "Warning"
    
    # Try to find firmware upload page
    try {
        $mainPage = Invoke-WebRequest -Uri "http://$IPAddress/" -TimeoutSec 10 -ErrorAction Stop
        if ($mainPage.Content -match "update|firmware|flash") {
            Write-ColorOutput "✅ Found firmware update interface" "Success"
        } else {
            Write-ColorOutput "❌ No OTA update interface found" "Error"
            Write-ColorOutput "This device may not support OTA updates" "Error"
            exit 1
        }
    } catch {
        Write-ColorOutput "❌ Error checking device capabilities" "Error"
        exit 1
    }
}

# Perform OTA update
Write-ColorOutput "🔄 Starting OTA update..." "Info"
Write-ColorOutput "This may take several minutes. Please do not power off the device." "Warning"

try {
    # Create multipart form data for file upload
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    # Read binary file
    $fileBytes = [System.IO.File]::ReadAllBytes($BinaryFullPath)
    $fileName = Split-Path $BinaryPath -Leaf
    
    # Build multipart form data
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"firmware`"; filename=`"$fileName`"",
        "Content-Type: application/octet-stream",
        "",
        [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($fileBytes),
        "--$boundary--"
    )
    
    $body = $bodyLines -join $LF
    $bodyBytes = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetBytes($body)
    
    # Set headers
    $headers = @{
        'Content-Type' = "multipart/form-data; boundary=$boundary"
    }
    
    Write-ColorOutput "📤 Uploading firmware ($([math]::Round($BinarySize / 1KB, 2)) KB)..." "Info"
    
    # Try different OTA endpoints
    $otaEndpoints = @(
        "http://$IPAddress/update",
        "http://$IPAddress/firmware",
        "http://$IPAddress/upload",
        "http://$IPAddress/ota"
    )
    
    $uploadSuccess = $false
    foreach ($endpoint in $otaEndpoints) {
        try {
            Write-ColorOutput "Trying endpoint: $endpoint" "Info"
            
            $uploadResponse = Invoke-RestMethod -Uri $endpoint -Method POST -Body $bodyBytes -Headers $headers -TimeoutSec $TimeoutSeconds
            
            Write-ColorOutput "✅ Firmware uploaded successfully!" "Success"
            $uploadSuccess = $true
            break
            
        } catch {
            Write-ColorOutput "❌ Upload failed to $endpoint`: $($_.Exception.Message)" "Warning"
            continue
        }
    }
    
    if (-not $uploadSuccess) {
        # Try alternative method using simple POST
        Write-ColorOutput "Trying alternative upload method..." "Info"
        try {
            $simpleUpload = Invoke-RestMethod -Uri "http://$IPAddress/" -Method POST -InFile $BinaryFullPath -ContentType "application/octet-stream" -TimeoutSec $TimeoutSeconds
            Write-ColorOutput "✅ Firmware uploaded successfully!" "Success"
            $uploadSuccess = $true
        } catch {
            Write-ColorOutput "❌ All upload methods failed" "Error"
            Write-ColorOutput "Error: $($_.Exception.Message)" "Error"
            exit 1
        }
    }
    
    if ($uploadSuccess) {
        Write-ColorOutput "🔄 Device is now updating firmware..." "Info"
        Write-ColorOutput "⏱️  Please wait while the device restarts (this may take 30-60 seconds)" "Warning"
        
        # Wait for device to restart
        Write-ColorOutput "Waiting for device to restart..." "Info"
        Start-Sleep -Seconds 30
        
        # Check if device is back online
        $attempts = 0
        $maxAttempts = 12
        
        while ($attempts -lt $maxAttempts) {
            $attempts++
            Write-ColorOutput "Checking device status (attempt $attempts/$maxAttempts)..." "Info"
            
            try {
                $testResponse = Invoke-WebRequest -Uri "http://$IPAddress/" -TimeoutSec 5 -ErrorAction Stop
                Write-ColorOutput "✅ Device is back online!" "Success"
                Write-ColorOutput "🎉 OTA update completed successfully!" "Success"
                
                # Try to get version info if available
                try {
                    $versionResponse = Invoke-RestMethod -Uri "http://$IPAddress/api/status" -TimeoutSec 5 -ErrorAction SilentlyContinue
                    if ($versionResponse) {
                        Write-ColorOutput "Device status: $versionResponse" "Info"
                    }
                } catch {
                    # Version endpoint might not exist, that's okay
                }
                
                exit 0
            } catch {
                Write-ColorOutput "Device not ready yet, waiting..." "Info"
                Start-Sleep -Seconds 5
            }
        }
        
        Write-ColorOutput "⚠️  Device is taking longer than expected to come back online" "Warning"
        Write-ColorOutput "The update may have been successful, but the device might need more time" "Warning"
        Write-ColorOutput "Try accessing http://$IPAddress/ manually in a few minutes" "Info"
    }
    
} catch {
    Write-ColorOutput "❌ OTA update failed: $($_.Exception.Message)" "Error"
    exit 1
}
