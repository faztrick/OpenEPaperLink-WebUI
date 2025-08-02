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

if (0 -eq 0) {
    Write-Host "✅ Build completed successfully!" -ForegroundColor Green
    
    # Optional: Upload if device is connected
     = Read-Host "Upload to device? (y/N)"
    if ( -eq "y" -or  -eq "Y") {
        pio run --target upload
    }
} else {
    Write-Host "❌ Build failed. Check the output above for errors." -ForegroundColor Red
    exit 1
}
