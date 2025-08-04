# Quick ESP32 JavaScript Fix Verification
Write-Host "🔍 Verifying JavaScript fixes on ESP32..." -ForegroundColor Cyan

$esp32IP = "192.168.26.201"
$testUrl = "http://$esp32IP"

try {
    # Test 1: Basic connectivity
    Write-Host "`n1. Testing connectivity..." -ForegroundColor Yellow
    $response = Invoke-WebRequest -Uri $testUrl -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ ESP32 is responding" -ForegroundColor Green
    }
    
    # Test 2: Check for duplicate script includes
    Write-Host "`n2. Checking for duplicate script includes..." -ForegroundColor Yellow
    $content = $response.Content
    $apiManagerCount = ($content | Select-String -Pattern 'api-manager\.js' -AllMatches).Matches.Count
    $apiManagerEnhancedCount = ($content | Select-String -Pattern 'api-manager-enhanced\.js' -AllMatches).Matches.Count
    
    if ($apiManagerCount -eq 0 -and $apiManagerEnhancedCount -gt 0) {
        Write-Host "   ✅ Duplicate api-manager.js removed successfully" -ForegroundColor Green
        Write-Host "   ✅ api-manager-enhanced.js is present" -ForegroundColor Green
    } elseif ($apiManagerCount -gt 0) {
        Write-Host "   ❌ Duplicate api-manager.js still present" -ForegroundColor Red
    } else {
        Write-Host "   ⚠️  No API manager scripts found" -ForegroundColor Yellow
    }
    
    # Test 3: Check script loading order
    Write-Host "`n3. Checking script loading order..." -ForegroundColor Yellow
    if ($content -match "constants\.js.*utils\.js.*app-core\.js") {
        Write-Host "   ✅ Core scripts in correct order" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Script loading order may need attention" -ForegroundColor Yellow
    }
    
    # Test 4: Version check
    Write-Host "`n4. Checking script versions..." -ForegroundColor Yellow
    if ($content -match '\?3\.2') {
        Write-Host "   ✅ Scripts have version cache busting (3.2)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No version cache busting detected" -ForegroundColor Yellow
    }
    
    Write-Host "`n🎯 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Open: http://$esp32IP" -ForegroundColor White
    Write-Host "2. Press F12 to open Developer Tools" -ForegroundColor White
    Write-Host "3. Go to Console tab" -ForegroundColor White
    Write-Host "4. Look for JavaScript errors:" -ForegroundColor White
    Write-Host "   ✅ Should NOT see: 'Identifier already declared'" -ForegroundColor Green
    Write-Host "   ✅ Should NOT see: 'Cannot read properties of undefined (reading bind)'" -ForegroundColor Green
    Write-Host "   ⚠️  May still see: 404 errors for missing API endpoints (normal)" -ForegroundColor Yellow
    
} catch {
    Write-Host "❌ Cannot connect to ESP32 at $esp32IP" -ForegroundColor Red
    Write-Host "   Please check ESP32 is powered on and network connection" -ForegroundColor Yellow
}
