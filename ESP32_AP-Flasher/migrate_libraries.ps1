# ESP32 Library Migration and Enhancement Script
# This script helps migrate to advanced libraries and implement new features

Write-Host "🔧 ESP32 Library Migration and Enhancement" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Function to backup current source files
function Backup-SourceFiles {
    $backupDir = "backup_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    Write-Host "📦 Creating backup in $backupDir..." -ForegroundColor Yellow
    
    if (!(Test-Path $backupDir)) {
        New-Item -Path $backupDir -ItemType Directory | Out-Null
    }
    
    Copy-Item -Path "src" -Destination "$backupDir/src" -Recurse -Force
    Copy-Item -Path "platformio.ini" -Destination "$backupDir/" -Force
    
    Write-Host "✅ Backup created successfully" -ForegroundColor Green
    return $backupDir
}

# Function to clean old library cache
function Clear-LibraryCache {
    Write-Host "🧹 Cleaning library cache..." -ForegroundColor Yellow
    
    if (Test-Path ".pio") {
        Remove-Item -Path ".pio" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Library cache cleared" -ForegroundColor Green
    }
}

# Function to validate library installation
function Test-LibraryInstallation {
    Write-Host "🔍 Validating library installation..." -ForegroundColor Yellow
    
    try {
        $result = pio lib list 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ All libraries installed successfully" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Library installation failed" -ForegroundColor Red
            Write-Host $result -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Error checking libraries: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to update code for new ArduinoJson
function Update-JsonCode {
    Write-Host "🔄 Updating JSON handling code..." -ForegroundColor Yellow
    
    $files = Get-ChildItem -Path "src" -Filter "*.cpp" -Recurse
    $updatedFiles = @()
    
    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw
        $originalContent = $content
        
        # Replace DynamicJsonDocument with JsonDocument
        $content = $content -replace "DynamicJsonDocument", "JsonDocument"
        
        # Update serialization calls for ArduinoJson 7
        $content = $content -replace "doc\.measureJson\(\)", "measureJson(doc)"
        $content = $content -replace "doc\.serializeJson\(([^)]+)\)", "serializeJson(doc, `$1)"
        
        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            $updatedFiles += $file.Name
        }
    }
    
    if ($updatedFiles.Count -gt 0) {
        Write-Host "✅ Updated JSON code in: $($updatedFiles -join ', ')" -ForegroundColor Green
    } else {
        Write-Host "ℹ️ No JSON code updates needed" -ForegroundColor Blue
    }
}

# Function to create advanced feature templates
function Create-AdvancedFeatures {
    Write-Host "🚀 Creating advanced feature templates..." -ForegroundColor Yellow
    
    # Create TaskScheduler example
    $taskSchedulerCode = @"
#ifdef USE_TASK_SCHEDULER
#include <TaskScheduler.h>

// Global scheduler instance
Scheduler scheduler;

// Task definitions
Task taskHeartbeat(5000, TASK_FOREVER, &heartbeatCallback);
Task taskSensorRead(30000, TASK_FOREVER, &sensorReadCallback);
Task taskNetworkCheck(60000, TASK_FOREVER, &networkCheckCallback);

void setupTaskScheduler() {
    scheduler.init();
    scheduler.addTask(taskHeartbeat);
    scheduler.addTask(taskSensorRead);
    scheduler.addTask(taskNetworkCheck);
    
    taskHeartbeat.enable();
    taskSensorRead.enable();
    taskNetworkCheck.enable();
}

void heartbeatCallback() {
    Serial.println("💓 System heartbeat");
    // LED blink or status update
}

void sensorReadCallback() {
    // Read sensors, update database
    Serial.println("📊 Reading sensors");
}

void networkCheckCallback() {
    // Check network connectivity
    Serial.println("🌐 Network health check");
}
#endif
"@
    
    Set-Content -Path "src/advanced_scheduler.cpp" -Value $taskSchedulerCode
    
    # Create WiFiManager integration
    $wifiManagerCode = @"
#ifdef USE_WIFI_MANAGER
#include <WiFiManager.h>

WiFiManager wifiManager;

void setupAdvancedWiFi() {
    // Set custom parameters
    WiFiManagerParameter custom_device_name("device_name", "Device Name", "OpenEPaperLink-AP", 40);
    WiFiManagerParameter custom_api_key("api_key", "API Key", "", 64);
    
    wifiManager.addParameter(&custom_device_name);
    wifiManager.addParameter(&custom_api_key);
    
    // Set callbacks
    wifiManager.setAPCallback([](WiFiManager *myWiFiManager) {
        Serial.println("🔧 Entered config mode");
        Serial.println("📱 Connect to: " + myWiFiManager->getConfigPortalSSID());
    });
    
    wifiManager.setSaveConfigCallback([]() {
        Serial.println("💾 WiFi config saved");
    });
    
    // Auto connect with fallback to config portal
    if (!wifiManager.autoConnect("OpenEPaperLink-Setup")) {
        Serial.println("❌ Failed to connect and hit timeout");
        ESP.restart();
    }
    
    Serial.println("✅ WiFi connected successfully");
}
#endif
"@
    
    Set-Content -Path "src/advanced_wifi.cpp" -Value $wifiManagerCode
    
    Write-Host "✅ Advanced feature templates created" -ForegroundColor Green
}

# Function to create enhanced build configuration
function Create-BuildEnhancements {
    Write-Host "⚙️ Creating enhanced build configurations..." -ForegroundColor Yellow
    
    $buildScript = @"
# Enhanced build script with library validation
Write-Host "🔧 Building with advanced libraries..." -ForegroundColor Cyan

# Check for required tools
if (!(Get-Command pio -ErrorAction SilentlyContinue)) {
    Write-Host "❌ PlatformIO CLI not found. Please install PlatformIO Core." -ForegroundColor Red
    exit 1
}

# Update library dependencies
Write-Host "📦 Installing/updating libraries..." -ForegroundColor Yellow
pio lib install

# Clean previous build
Write-Host "🧹 Cleaning previous build..." -ForegroundColor Yellow
pio run --target clean

# Build with verbose output
Write-Host "🔨 Building firmware..." -ForegroundColor Yellow
pio run --environment ESP32_S3_C6_NANO_AP --verbose

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build completed successfully!" -ForegroundColor Green
    
    # Optional: Upload if device is connected
    $upload = Read-Host "Upload to device? (y/N)"
    if ($upload -eq "y" -or $upload -eq "Y") {
        pio run --target upload
    }
} else {
    Write-Host "❌ Build failed. Check the output above for errors." -ForegroundColor Red
    exit 1
}
"@
    
    Set-Content -Path "build_advanced.ps1" -Value $buildScript
    
    Write-Host "✅ Enhanced build configuration created" -ForegroundColor Green
}

# Main execution
Write-Host "Starting library migration process..." -ForegroundColor Cyan

# Create backup
$backupDir = Backup-SourceFiles

# Clear cache to ensure fresh library installation
Clear-LibraryCache

# Update JSON code for ArduinoJson 7
Update-JsonCode

# Create advanced feature templates
Create-AdvancedFeatures

# Create enhanced build configuration
Create-BuildEnhancements

Write-Host ""
Write-Host "🎉 Library migration completed!" -ForegroundColor Green
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Review the updated platformio.ini file" -ForegroundColor White
Write-Host "   2. Run: pio lib install" -ForegroundColor White
Write-Host "   3. Test build: pio run" -ForegroundColor White
Write-Host "   4. Review advanced feature templates in src/" -ForegroundColor White
Write-Host "   5. Integrate new features as needed" -ForegroundColor White
Write-Host ""
Write-Host "📁 Backup created in: $backupDir" -ForegroundColor Yellow
Write-Host "📖 Library documentation: lib_config.json" -ForegroundColor Yellow
