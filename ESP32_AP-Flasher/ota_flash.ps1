# OTA Flash Script for OpenEPaperLink ESP32 AP
# Usage: .\ota_flash.ps1 -IPAddress "192.168.87.133" -BinaryPath ".\espbinaries\ESP32_S3_C6_NANO_AP.bin"

param(
    [Parameter(Mandatory=$true)]
    [string]$IPAddress,
    
    [Parameter(Mandatory=$false)]
    [string]$BinaryPath = ".\espbinaries\ESP32_S3_C6_NANO_AP.bin",
    
    [Parameter(Mandatory=$false)]
    [int]$TimeoutSeconds = 120,
    
    [Parameter(Mandatory=$false)]
    [bool]$EraseFlash = $false,
    
    [Parameter(Mandatory=$false)]
    [bool]$VerifyFlash = $true,
    
    [Parameter(Mandatory=$false)]
    [bool]$ResetAfterFlash = $true,
    
    [Parameter(Mandatory=$false)]
    [int]$BaudRate = 921600
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
    if (Test-Path ".\espbinaries\*.bin") {
        Get-ChildItem ".\espbinaries\*.bin" | ForEach-Object { Write-ColorOutput "  - $($_.Name)" "Info" }
    } else {
        Write-ColorOutput "  No .bin files found in espbinaries directory" "Warning"
    }
    exit 1
}

$BinaryFullPath = (Resolve-Path $BinaryPath).Path
$BinarySize = (Get-Item $BinaryFullPath).Length

Write-ColorOutput "🚀 OpenEPaperLink C6 OTA Flash Tool" "Info"
Write-ColorOutput "====================================" "Info"
Write-ColorOutput "Target IP: $IPAddress" "Info"
Write-ColorOutput "Binary: $BinaryPath" "Info"
Write-ColorOutput "Size: $([math]::Round($BinarySize / 1MB, 2)) MB" "Info"
Write-ColorOutput "Erase Flash: $EraseFlash" "Info"
Write-ColorOutput "Verify Flash: $VerifyFlash" "Info"
Write-ColorOutput "Reset After Flash: $ResetAfterFlash" "Info"
Write-ColorOutput "Baud Rate: $BaudRate" "Info"
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

# Check device information
Write-ColorOutput "🔍 Checking device capabilities..." "Info"
try {
    $sysInfoResponse = Invoke-RestMethod -Uri "http://$IPAddress/sysinfo" -TimeoutSec 10 -ErrorAction Stop
    
    if ($sysInfoResponse.hasC6 -eq 1) {
        Write-ColorOutput "✅ Device supports ESP32-C6 OTA flashing" "Success"
    } else {
        Write-ColorOutput "❌ Device does not support ESP32-C6 OTA flashing" "Error"
        Write-ColorOutput "This device may not have C6_OTA_FLASHING enabled" "Error"
        exit 1
    }
    
    Write-ColorOutput "Device info:" "Info"
    Write-ColorOutput "  - Environment: $($sysInfoResponse.env)" "Info"
    Write-ColorOutput "  - Version: $($sysInfoResponse.buildversion)" "Info"
    Write-ColorOutput "  - Flash Size: $([math]::Round($sysInfoResponse.flashsize / 1MB, 2)) MB" "Info"
    
} catch {
    Write-ColorOutput "⚠️  Could not retrieve device info, continuing anyway..." "Warning"
}

# Prepare firmware file for upload
Write-ColorOutput "� Preparing firmware file..." "Info"

# Check if we need to upload the firmware first
$firmwareFileName = Split-Path $BinaryPath -Leaf
$uploadPath = "/firmware/$firmwareFileName"

Write-ColorOutput "📤 Uploading firmware file to device..." "Info"

try {
    # Upload firmware file to device
    $uploadUri = "http://$IPAddress/upload_littlefs"
    
    # Create multipart form data
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $fileBytes = [System.IO.File]::ReadAllBytes($BinaryFullPath)
    $fileName = Split-Path $BinaryPath -Leaf
    
    # Build multipart form data for file upload
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"path`"",
        "",
        $uploadPath,
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: application/octet-stream",
        "",
        [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($fileBytes),
        "--$boundary--"
    )
    
    $body = $bodyLines -join $LF
    $bodyBytes = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetBytes($body)
    
    $headers = @{
        'Content-Type' = "multipart/form-data; boundary=$boundary"
    }
    
    $uploadResponse = Invoke-RestMethod -Uri $uploadUri -Method POST -Body $bodyBytes -Headers $headers -TimeoutSec $TimeoutSeconds
    Write-ColorOutput "✅ Firmware uploaded successfully" "Success"
    
} catch {
    Write-ColorOutput "❌ Failed to upload firmware: $($_.Exception.Message)" "Error"
    exit 1
}

# Start the C6 OTA flash process
Write-ColorOutput "🔄 Starting C6 OTA flash process..." "Info"
Write-ColorOutput "This may take several minutes. Please do not power off the device." "Warning"

try {
    $otaParams = @{
        'firmware_file' = $uploadPath
        'com_port' = 'internal'
        'erase_flash' = $EraseFlash.ToString().ToLower()
        'verify_flash' = $VerifyFlash.ToString().ToLower()
        'reset_after_flash' = $ResetAfterFlash.ToString().ToLower()
        'baud_rate' = $BaudRate.ToString()
    }
    
    $otaResponse = Invoke-RestMethod -Uri "http://$IPAddress/flash_c6_ota" -Method POST -Body $otaParams -TimeoutSec $TimeoutSeconds
    
    if ($otaResponse.success) {
        Write-ColorOutput "✅ C6 OTA flash started successfully!" "Success"
        Write-ColorOutput $otaResponse.message "Info"
        
        # Monitor progress via WebSocket would be ideal, but for now we'll poll
        Write-ColorOutput "⏱️  Monitoring flash progress..." "Info"
        
        $maxWaitTime = $TimeoutSeconds
        $waitInterval = 5
        $elapsedTime = 0
        
        while ($elapsedTime -lt $maxWaitTime) {
            Start-Sleep -Seconds $waitInterval
            $elapsedTime += $waitInterval
            
            Write-ColorOutput "Elapsed time: $elapsedTime seconds" "Info"
            
            # Try to check if device is still responsive
            try {
                $pingResponse = Invoke-WebRequest -Uri "http://$IPAddress/" -TimeoutSec 5 -ErrorAction SilentlyContinue
                if ($elapsedTime -gt 30) {
                    # After 30 seconds, if device is responsive, flash might be complete
                    Write-ColorOutput "✅ Device is responsive, flash likely completed" "Success"
                    break
                }
            } catch {
                # Device not responsive during flash is normal
                Write-ColorOutput "Device is flashing (not responsive)..." "Info"
            }
        }
        
        if ($elapsedTime -ge $maxWaitTime) {
            Write-ColorOutput "⚠️  Flash process took longer than expected" "Warning"
            Write-ColorOutput "The device may still be flashing. Please wait a few more minutes." "Warning"
        }
        
    } else {
        Write-ColorOutput "❌ Failed to start C6 OTA flash: $($otaResponse.error)" "Error"
        exit 1
    }
    
} catch {
    Write-ColorOutput "❌ C6 OTA flash request failed: $($_.Exception.Message)" "Error"
    exit 1
}

# Final device check
Write-ColorOutput "🔍 Performing final device check..." "Info"
$finalCheckAttempts = 0
$maxFinalCheckAttempts = 12

while ($finalCheckAttempts -lt $maxFinalCheckAttempts) {
    $finalCheckAttempts++
    Write-ColorOutput "Final check attempt $finalCheckAttempts/$maxFinalCheckAttempts..." "Info"
    
    try {
        $testResponse = Invoke-WebRequest -Uri "http://$IPAddress/" -TimeoutSec 10 -ErrorAction Stop
        Write-ColorOutput "✅ Device is back online!" "Success"
        
        # Try to get updated system info
        try {
            $finalSysInfo = Invoke-RestMethod -Uri "http://$IPAddress/sysinfo" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($finalSysInfo) {
                Write-ColorOutput "Updated device info:" "Success"
                Write-ColorOutput "  - AP Version: $($finalSysInfo.ap_version)" "Info"
                Write-ColorOutput "  - Build Version: $($finalSysInfo.buildversion)" "Info"
            }
        } catch {
            # System info not critical
        }
        
        Write-ColorOutput "🎉 C6 OTA flash completed successfully!" "Success"
        exit 0
        
    } catch {
        Write-ColorOutput "Device not ready yet, waiting..." "Info"
        Start-Sleep -Seconds 10
    }
}

Write-ColorOutput "⚠️  Device is taking longer than expected to come back online" "Warning"
Write-ColorOutput "The flash may have been successful, but the device needs more time" "Warning"
Write-ColorOutput "Try accessing http://$IPAddress/ manually in a few minutes" "Info"
