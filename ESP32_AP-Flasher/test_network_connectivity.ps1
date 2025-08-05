# ESP32 OpenEPaperLink Network Diagnostic Script
# This script helps diagnose network connectivity and test the web interface

Write-Host "🌐 ESP32 OpenEPaperLink Network Diagnostic" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$targetIP = "192.168.12.12"
$port = 80

Write-Host "`n📍 Testing connectivity to $targetIP..." -ForegroundColor Yellow

# Test 1: Basic ping
Write-Host "`n1️⃣ Ping Test:" -ForegroundColor Green
try {
    $pingResult = Test-Connection -ComputerName $targetIP -Count 3 -Quiet
    if ($pingResult) {
        Write-Host "✅ Ping successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Ping failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Ping error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Port connectivity
Write-Host "`n2️⃣ Port $port Test:" -ForegroundColor Green
try {
    $tcpTest = Test-NetConnection -ComputerName $targetIP -Port $port -WarningAction SilentlyContinue
    if ($tcpTest.TcpTestSucceeded) {
        Write-Host "✅ Port $port is open" -ForegroundColor Green
    } else {
        Write-Host "❌ Port $port is not accessible" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Port test error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: HTTP connectivity
Write-Host "`n3️⃣ HTTP Test:" -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "http://$targetIP" -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ HTTP connection successful" -ForegroundColor Green
    Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Cyan
    Write-Host "   Content Length: $($response.Content.Length) bytes" -ForegroundColor Cyan
} catch {
    Write-Host "❌ HTTP connection failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Network interface information
Write-Host "`n4️⃣ Network Interface Information:" -ForegroundColor Green
$interfaces = Get-NetIPConfiguration | Where-Object {$_.IPv4Address -ne $null}
foreach ($interface in $interfaces) {
    $ip = $interface.IPv4Address.IPAddress
    $subnet = $interface.IPv4Address.PrefixLength
    Write-Host "   Interface: $($interface.InterfaceAlias)" -ForegroundColor Cyan
    Write-Host "   IP: $ip/$subnet" -ForegroundColor Cyan
    
    # Check if target IP is in same subnet
    $networkAddress = [System.Net.IPAddress]::Parse($ip).Address -band ([System.Net.IPAddress]::Parse("255.255.255.0").Address)
    $targetNetwork = [System.Net.IPAddress]::Parse($targetIP).Address -band ([System.Net.IPAddress]::Parse("255.255.255.0").Address)
    
    if ($networkAddress -eq $targetNetwork) {
        Write-Host "   ✅ Target IP is in the same subnet" -ForegroundColor Green
    }
}

# Test 5: ARP table check
Write-Host "`n5️⃣ ARP Table Check:" -ForegroundColor Green
$arpEntry = arp -a | Select-String $targetIP
if ($arpEntry) {
    Write-Host "✅ Device found in ARP table:" -ForegroundColor Green
    Write-Host "   $arpEntry" -ForegroundColor Cyan
} else {
    Write-Host "❌ Device not found in ARP table" -ForegroundColor Red
}

# Test 6: Alternative common ESP32 IPs
Write-Host "`n6️⃣ Testing Common ESP32 IPs:" -ForegroundColor Green
$commonIPs = @("192.168.1.1", "192.168.4.1", "192.168.0.1", "10.0.0.1")
foreach ($ip in $commonIPs) {
    try {
        $quickPing = Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSec 2
        if ($quickPing) {
            Write-Host "   ✅ $ip responds" -ForegroundColor Green
            
            # Try HTTP on responding IPs
            try {
                $httpTest = Invoke-WebRequest -Uri "http://$ip" -TimeoutSec 3 -UseBasicParsing
                Write-Host "      🌐 HTTP server detected" -ForegroundColor Cyan
            } catch {
                Write-Host "      ❌ No HTTP server" -ForegroundColor Yellow
            }
        }
    } catch {
        # Silently continue for these quick tests
    }
}

# Test 7: WiFi network scan (if available)
Write-Host "`n7️⃣ Available WiFi Networks:" -ForegroundColor Green
try {
    $wifiProfiles = netsh wlan show profiles | Select-String "All User Profile"
    if ($wifiProfiles) {
        Write-Host "   Current WiFi profiles:" -ForegroundColor Cyan
        $wifiProfiles | ForEach-Object {
            $profileName = ($_ -split ":")[1].Trim()
            Write-Host "   - $profileName" -ForegroundColor White
        }
    }
} catch {
    Write-Host "   ❌ Cannot access WiFi information" -ForegroundColor Yellow
}

Write-Host "`n🔧 Troubleshooting Suggestions:" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow
Write-Host "1. Ensure ESP32 device is powered on and running" -ForegroundColor White
Write-Host "2. Check if device is in AP mode (creates its own WiFi network)" -ForegroundColor White
Write-Host "3. Look for WiFi networks named 'OpenEPL' or similar" -ForegroundColor White
Write-Host "4. If device is in station mode, ensure both devices are on same network" -ForegroundColor White
Write-Host "5. Try connecting to the device's AP network first" -ForegroundColor White
Write-Host "6. Check device documentation for default IP addresses" -ForegroundColor White

Write-Host "`n🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "==============" -ForegroundColor Cyan
Write-Host "If any alternative IPs responded, try opening them in browser:" -ForegroundColor White
$commonIPs | ForEach-Object {
    Write-Host "   http://$_" -ForegroundColor Cyan
}
Write-Host "`nTo flash or configure the device, check the serial connection." -ForegroundColor White

Read-Host "`nPress Enter to exit"
