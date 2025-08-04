# Test the new API endpoints
Write-Host "🧪 Testing new API endpoints..." -ForegroundColor Cyan

$esp32IP = "192.168.26.201"

$endpoints = @(
    @{url="/api/features"; method="GET"; description="Feature detection API"},
    @{url="/api/error_report"; method="POST"; description="Error reporting API"},
    @{url="/sysinfo"; method="GET"; description="System info API"},
    @{url="/tft_status"; method="HEAD"; description="TFT feature detection"},
    @{url="/led_control"; method="HEAD"; description="LED control detection"},
    @{url="/ble_status"; method="HEAD"; description="BLE feature detection"},
    @{url="/subghz_status"; method="HEAD"; description="SubGHz detection"},
    @{url="/c6_status"; method="HEAD"; description="C6 OTA detection"},
    @{url="/rfid/status"; method="HEAD"; description="RFID detection"},
    @{url="/flasher_status"; method="HEAD"; description="External flasher detection"}
)

Write-Host "📡 ESP32 IP: $esp32IP" -ForegroundColor Yellow

foreach ($endpoint in $endpoints) {
    Write-Host "`nTesting $($endpoint.method) $($endpoint.url)..." -ForegroundColor White
    
    try {
        if ($endpoint.method -eq "GET") {
            $response = Invoke-WebRequest -Uri "http://$esp32IP$($endpoint.url)" -Method GET -TimeoutSec 5
        } elseif ($endpoint.method -eq "HEAD") {
            $response = Invoke-WebRequest -Uri "http://$esp32IP$($endpoint.url)" -Method HEAD -TimeoutSec 5
        } elseif ($endpoint.method -eq "POST") {
            $body = @{error="test error"; url="test.js"} | ConvertTo-Json
            $response = Invoke-WebRequest -Uri "http://$esp32IP$($endpoint.url)" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
        }
        
        $status = $response.StatusCode
        if ($status -eq 200) {
            Write-Host "   ✅ $($endpoint.description): $status OK" -ForegroundColor Green
        } elseif ($status -eq 404) {
            Write-Host "   ❌ $($endpoint.description): $status Not Found" -ForegroundColor Red
        } else {
            Write-Host "   ⚠️  $($endpoint.description): $status $($response.StatusDescription)" -ForegroundColor Yellow
        }
        
        # Show response content for GET requests
        if ($endpoint.method -eq "GET" -and $response.Content) {
            $content = $response.Content
            if ($content.Length -gt 200) {
                $content = $content.Substring(0, 200) + "..."
            }
            Write-Host "      Response: $content" -ForegroundColor Gray
        }
        
    } catch {
        $errorMsg = $_.Exception.Message
        if ($errorMsg -like "*404*") {
            Write-Host "   ❌ $($endpoint.description): 404 Not Found" -ForegroundColor Red
        } elseif ($errorMsg -like "*timeout*") {
            Write-Host "   ⏱️  $($endpoint.description): Timeout" -ForegroundColor Yellow
        } else {
            Write-Host "   ❌ $($endpoint.description): Error - $errorMsg" -ForegroundColor Red
        }
    }
}

Write-Host "`n🎯 Summary:" -ForegroundColor Cyan
Write-Host "If you see ✅ OK responses, the API endpoints are working!" -ForegroundColor Green
Write-Host "If you see ❌ 404 errors, the ESP32 may need to be reflashed with the new firmware." -ForegroundColor Yellow
