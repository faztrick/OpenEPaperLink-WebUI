# ESP32 IP Discovery and Upload Script
# This script helps find your ESP32 and upload the fixed web files

param(
    [Parameter(Mandatory = $false)]
    [string[]]$TestIPs = @("192.168.4.1", "192.168.1.200", "192.168.1.100", "192.168.1.101", "192.168.0.100")
)

Write-Host "🔍 Searching for ESP32 device..." -ForegroundColor Cyan

$foundESP32 = $null

foreach ($ip in $TestIPs) {
    Write-Host "Testing $ip..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://$ip" -TimeoutSec 3 -ErrorAction Stop
        if ($response.Content -match "OpenEPL|ESP32" -or $response.StatusCode -eq 200) {
            Write-Host "✅ Found ESP32 at $ip" -ForegroundColor Green
            $foundESP32 = $ip
            break
        }
    }
    catch {
        # Silently continue to next IP
    }
}

if ($foundESP32) {
    Write-Host "🚀 Uploading fixed web files to ESP32 at $foundESP32..." -ForegroundColor Green
    & ".\upload_www_files.ps1" -IPAddress $foundESP32

    Write-Host "`n✨ Upload complete! Try accessing the web interface:" -ForegroundColor Green
    Write-Host "   http://$foundESP32" -ForegroundColor Cyan
    Write-Host "`n🔧 Fixes applied:" -ForegroundColor Yellow
    Write-Host "   ✅ Removed duplicate APIManager class declaration" -ForegroundColor White
    Write-Host "   ✅ Fixed UIComponents binding errors" -ForegroundColor White
    Write-Host "   ✅ Improved error handling" -ForegroundColor White
    Write-Host "`n📝 Check browser console for remaining errors (should be much fewer now!)" -ForegroundColor Blue
}
else {
    Write-Host "❌ Could not find ESP32. Please try:" -ForegroundColor Red
    Write-Host "1. Check ESP32 is powered on and WiFi is working" -ForegroundColor Yellow
    Write-Host "2. Find the correct IP address from your router" -ForegroundColor Yellow
    Write-Host "3. Run manually: .\upload_www_files.ps1 -IPAddress [YOUR_ESP32_IP]" -ForegroundColor Yellow

    # Try to discover on local network
    Write-Host "`n🔍 Scanning local network for HTTP servers..." -ForegroundColor Cyan
    $subnet = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Where-Object { $_.InterfaceMetric -lt 25 } | Select-Object -First 1).NextHop
    if ($subnet) {
        $baseIP = $subnet.Substring(0, $subnet.LastIndexOf('.'))
        Write-Host "Scanning $baseIP.1-254..." -ForegroundColor Yellow

        1..254 | ForEach-Object -Parallel {
            $ip = "$using:baseIP.$_"
            try {
                $response = Invoke-WebRequest -Uri "http://$ip" -TimeoutSec 1 -ErrorAction Stop
                if ($response.Content -match "OpenEPL|ESP32|esp32") {
                    "$ip - Possible ESP32 device found"
                }
            }
            catch {
                # Silent
            }
        } -ThrottleLimit 20
    }
}
