# Configure WiFi settings for ESP32 OpenEPaperLink Access Point
Write-Host "🔧 Configuring WiFi Settings..." -ForegroundColor Cyan

# WiFi Configuration Parameters
$esp32IP = "192.168.4.1"  # Default AP IP, change this if connecting to existing ESP32
$wifiSSID = "Faztrick"
$wifiPassword = "faztrick123"
$staticIP = "192.168.26.201"
$gateway = "192.168.26.1"
$subnetMask = "255.255.255.0"
$dns = "8.8.8.8"  # Using Google DNS as default

Write-Host "📡 ESP32 AP IP: $esp32IP" -ForegroundColor Yellow
Write-Host "📶 Target WiFi Network: $wifiSSID" -ForegroundColor Yellow
Write-Host "🌐 Static IP: $staticIP" -ForegroundColor Yellow
Write-Host "🚪 Gateway: $gateway" -ForegroundColor Yellow
Write-Host "🔧 Subnet Mask: $subnetMask" -ForegroundColor Yellow

# Create JSON payload for WiFi configuration
$wifiConfig = @{
    ssid = $wifiSSID
    pw = $wifiPassword
    ip = $staticIP
    mask = $subnetMask
    gw = $gateway
    dns = $dns
} | ConvertTo-Json

Write-Host "`n📤 Sending WiFi configuration..." -ForegroundColor White

try {
    # First, try to get current WiFi config to verify connection
    Write-Host "🔍 Checking current WiFi configuration..." -ForegroundColor Gray
    $currentConfig = Invoke-WebRequest -Uri "http://$esp32IP/get_wifi_config" -Method GET -TimeoutSec 10
    Write-Host "   ✅ Connected to ESP32 successfully" -ForegroundColor Green
    
    # Send the new WiFi configuration
    $response = Invoke-WebRequest -Uri "http://$esp32IP/save_wifi_config" -Method POST -Body $wifiConfig -ContentType "application/json" -TimeoutSec 10
    
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ WiFi configuration saved successfully!" -ForegroundColor Green
        Write-Host "   📱 The ESP32 will now reboot and connect to '$wifiSSID'" -ForegroundColor Green
        Write-Host "   🔄 After reboot, the device should be available at: $staticIP" -ForegroundColor Yellow
        Write-Host "`n⏳ Waiting for ESP32 to reboot and connect..." -ForegroundColor Cyan
        
        # Wait a bit for reboot
        Start-Sleep -Seconds 10
        
        # Try to ping the new IP address
        Write-Host "🏓 Testing connectivity to new IP address..." -ForegroundColor Gray
        for ($i = 1; $i -le 6; $i++) {
            try {
                $testResponse = Invoke-WebRequest -Uri "http://$staticIP/" -Method GET -TimeoutSec 5
                if ($testResponse.StatusCode -eq 200) {
                    Write-Host "   ✅ ESP32 is now accessible at $staticIP!" -ForegroundColor Green
                    Write-Host "   🌐 You can access the web interface at: http://$staticIP" -ForegroundColor Green
                    break
                }
            }
            catch {
                Write-Host "   ⏳ Attempt $i/6: Still waiting for ESP32 to come online..." -ForegroundColor Yellow
                Start-Sleep -Seconds 10
            }
        }
    } else {
        Write-Host "   ❌ Failed to save WiFi configuration: $($response.StatusCode)" -ForegroundColor Red
    }
} 
catch {
    Write-Host "   ❌ Error connecting to ESP32: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "" -ForegroundColor White
    Write-Host "💡 Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "   1. Make sure your computer is connected to the ESP32's WiFi AP (usually 'OpenEPaperLink')" -ForegroundColor White
    Write-Host "   2. Verify the ESP32 IP address is correct (default is 192.168.4.1)" -ForegroundColor White
    Write-Host "   3. Check if the ESP32 web interface is accessible in your browser" -ForegroundColor White
    Write-Host "   4. If ESP32 is already configured, update the esp32IP variable to the current IP" -ForegroundColor White
}

Write-Host "`n🏁 WiFi configuration script completed." -ForegroundColor Cyan
