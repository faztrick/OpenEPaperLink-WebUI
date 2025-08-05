# Solum M3 7.5" BWRY NewTone Configuration Script
# This script helps configure your Newton M3 display

Write-Host "=== Solum M3 7.5' BWRY NewTone Setup Script ===" -ForegroundColor Green
Write-Host ""

# Check if the ESP32 AP-Flasher is running
Write-Host "Step 1: Checking ESP32 AP-Flasher Connection..." -ForegroundColor Yellow

# Try to find the ESP32 device IP
$possibleIPs = @("192.168.4.1", "192.168.1.100", "192.168.0.100", "10.0.0.1")
$espIP = $null

foreach ($ip in $possibleIPs) {
    try {
        $response = Invoke-WebRequest -Uri "http://$ip/get_ap_config" -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $espIP = $ip
            Write-Host "✓ Found ESP32 AP-Flasher at: $ip" -ForegroundColor Green
            break
        }
    }
    catch {
        # Continue checking other IPs
    }
}

if (-not $espIP) {
    Write-Host "❌ Could not find ESP32 AP-Flasher automatically." -ForegroundColor Red
    $espIP = Read-Host "Please enter your ESP32 IP address"
}

Write-Host ""
Write-Host "Step 2: Display Configuration Information" -ForegroundColor Yellow
Write-Host "Newton M3 7.5' BWRY Specifications:" -ForegroundColor Cyan
Write-Host "  • Resolution: 800x480 pixels"
Write-Host "  • Colors: 4-color (Black, White, Red, Yellow)"
Write-Host "  • Hardware Type: 14 (0x0E)"
Write-Host "  • Bit Depth: 2bpp"
Write-Host "  • Compression: ZLib (0x27)"
Write-Host ""

Write-Host "Step 3: Checking Tag Database..." -ForegroundColor Yellow
try {
    $tagDB = Invoke-RestMethod -Uri "http://$espIP/get_db" -Method GET
    $newton_tags = $tagDB | Where-Object { $_.hwType -eq 14 -or $_.alias -like "*Newton*" -or $_.alias -like "*M3*" }
    
    if ($newton_tags) {
        Write-Host "✓ Found Newton M3 displays:" -ForegroundColor Green
        foreach ($tag in $newton_tags) {
            $mac = $tag.mac
            $alias = if ($tag.alias) { $tag.alias } else { "Unnamed" }
            $lastSeen = if ($tag.lastseen -gt 0) { 
                (Get-Date "1970-01-01").AddSeconds($tag.lastseen).ToString("yyyy-MM-dd HH:mm:ss") 
            }
            else { 
                "Never" 
            }
            Write-Host "    MAC: $mac | Alias: $alias | Last Seen: $lastSeen"
        }
    }
    else {
        Write-Host "⚠️ No Newton M3 displays found in database." -ForegroundColor Yellow
        Write-Host "   Make sure your display is powered on and has connected to the AP."
    }
}
catch {
    Write-Host "❌ Could not retrieve tag database: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Step 4: Content Template Information" -ForegroundColor Yellow
Write-Host "Available content templates for Newton M3 7.5' BWRY:" -ForegroundColor Cyan
Write-Host "  • Template 1: Date/Time display with large fonts"
Write-Host "  • Template 2: Custom text with multiple font sizes"
Write-Host "  • Template 3: Header with status lines (red header bar)"
Write-Host "  • Template 4: Weather display with icons"
Write-Host "  • Template 8: Weekly weather forecast"
Write-Host "  • Template 9: List display (10 items max)"
Write-Host "  • Template 10: Simple title and position"
Write-Host "  • Template 11: 7-day calendar grid"
Write-Host "  • Template 21: Access Point information display"
Write-Host "  • Template 27: Bar chart display"
Write-Host ""

Write-Host "Step 5: Image Upload Instructions" -ForegroundColor Yellow
Write-Host "To upload custom images:" -ForegroundColor Cyan
Write-Host "  1. Create images with resolution 800x480 pixels"
Write-Host "  2. Use only these colors:"
Write-Host "     - Black: RGB(0,0,0)"
Write-Host "     - White: RGB(255,255,255)"
Write-Host "     - Red: RGB(255,0,0)"
Write-Host "     - Yellow: RGB(255,255,0)"
Write-Host "  3. Save as PNG or BMP format"
Write-Host "  4. Upload via web interface at http://$espIP"
Write-Host ""

Write-Host "Step 6: Testing Your Display" -ForegroundColor Yellow
Write-Host "Manual test commands:" -ForegroundColor Cyan
if ($newton_tags -and $newton_tags.Count -gt 0) {
    $testMAC = $newton_tags[0].mac
    Write-Host "  • LED Flash Test:"
    Write-Host "    Invoke-WebRequest -Uri 'http://$espIP/tag_cmd' -Method POST -Body 'mac=$testMAC&cmd=ledflash'"
    Write-Host "  • Refresh Display:"
    Write-Host "    Invoke-WebRequest -Uri 'http://$espIP/tag_cmd' -Method POST -Body 'mac=$testMAC&cmd=refresh'"
    Write-Host "  • Reboot Tag:"
    Write-Host "    Invoke-WebRequest -Uri 'http://$espIP/tag_cmd' -Method POST -Body 'mac=$testMAC&cmd=reboot'"
}
else {
    Write-Host "  (Commands will be available once your display is detected)"
}

Write-Host ""
Write-Host "Step 7: Troubleshooting" -ForegroundColor Yellow
Write-Host "If your display is not connecting:" -ForegroundColor Cyan
Write-Host "  1. Press the button on the display to wake it up"
Write-Host "  2. Make sure the AP is on the correct channel (check with 'scan' command)"
Write-Host "  3. Verify the display is in range (good signal strength)"
Write-Host "  4. Check that the display battery has sufficient charge"
Write-Host "  5. Try factory reset if necessary"
Write-Host ""

# Offer to open web interface
$openBrowser = Read-Host "Would you like to open the web interface? (y/n)"
if ($openBrowser -eq 'y' -or $openBrowser -eq 'Y') {
    Start-Process "http://$espIP"
}

Write-Host ""
Write-Host "=== Configuration Complete ===" -ForegroundColor Green
Write-Host "Your Newton M3 7.5' BWRY display should now be ready to use!" -ForegroundColor Green
Write-Host "Web Interface: http://$espIP" -ForegroundColor Cyan
Write-Host "Test Image Generator: file:///$PWD/test_bwry_image.html" -ForegroundColor Cyan
