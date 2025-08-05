# Quick WiFi Configuration for ESP32 OpenEPaperLink
# Usage: Update the $esp32IP variable if your ESP32 is already configured with a different IP

param(
    [string]$ESP32IP = "192.168.4.1",  # Change this to your ESP32's current IP if already configured
    [string]$SSID = "Faztrick",
    [string]$Password = "faztrick123",
    [string]$StaticIP = "192.168.26.201",
    [string]$Gateway = "192.168.26.1",
    [string]$SubnetMask = "255.255.255.0",
    [string]$DNS = "8.8.8.8"
)

Write-Host "🔧 Configuring WiFi: $SSID -> $StaticIP" -ForegroundColor Cyan

$config = @{
    ssid = $SSID
    pw = $Password
    ip = $StaticIP
    mask = $SubnetMask
    gw = $Gateway
    dns = $DNS
} | ConvertTo-Json

try {
    Invoke-WebRequest -Uri "http://$ESP32IP/save_wifi_config" -Method POST -Body $config -ContentType "application/json" -TimeoutSec 10
    Write-Host "✅ WiFi configured! ESP32 will reboot and connect to $SSID at $StaticIP" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Make sure you're connected to the ESP32's AP or update the -ESP32IP parameter" -ForegroundColor Yellow
}
