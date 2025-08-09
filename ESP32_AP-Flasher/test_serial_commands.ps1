#!/usr/bin/env pwsh
# Quick test script for new ESP32 serial commands
param(
    [string]$ComPort = "COM10",
    [int]$BaudRate = 115200
)

Write-Host "🧪 ESP32 Serial Commands Quick Test" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green

function Test-SerialConnection {
    param([string]$Port, [int]$Baud)

    try {
        Add-Type -AssemblyName System.IO.Ports
        $serialPort = New-Object System.IO.Ports.SerialPort
        $serialPort.PortName = $Port
        $serialPort.BaudRate = $Baud
        $serialPort.DataBits = 8
        $serialPort.Parity = [System.IO.Ports.Parity]::None
        $serialPort.StopBits = [System.IO.Ports.StopBits]::One
        $serialPort.ReadTimeout = 2000
        $serialPort.WriteTimeout = 2000

        Write-Host "🔌 Connecting to $Port at $Baud baud..." -ForegroundColor Cyan
        $serialPort.Open()

        if ($serialPort.IsOpen) {
            Write-Host "✅ Connected successfully!" -ForegroundColor Green

            # Clear buffer
            Start-Sleep -Seconds 1
            try { $serialPort.ReadExisting() | Out-Null } catch { }

            # Test basic commands
            $testCommands = @(
                "help",
                "version",
                "wifi.status",
                "author.get",
                "system.info"
            )

            foreach ($cmd in $testCommands) {
                Write-Host "`n📤 Testing command: $cmd" -ForegroundColor Yellow
                $serialPort.WriteLine($cmd)
                Start-Sleep -Milliseconds 1500

                try {
                    $response = $serialPort.ReadExisting()
                    if ($response -and $response.Length -gt 10) {
                        Write-Host "✅ Response received (${$response.Length} chars)" -ForegroundColor Green

                        # Show first line of response
                        $firstLine = $response.Split("`n")[0].Trim()
                        if ($firstLine.Length -gt 0) {
                            Write-Host "   Preview: $firstLine" -ForegroundColor Gray
                        }
                    }
                    else {
                        Write-Host "⚠️  No response or short response" -ForegroundColor Yellow
                    }
                }
                catch {
                    Write-Host "❌ Error reading response: $($_.Exception.Message)" -ForegroundColor Red
                }
            }

            Write-Host "`n🎉 Serial command test completed!" -ForegroundColor Green
            Write-Host "The new serial commands appear to be working." -ForegroundColor Cyan

        }
        else {
            Write-Host "❌ Failed to open serial port" -ForegroundColor Red
            return $false
        }

        $serialPort.Close()
        return $true

    }
    catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Run the test
$success = Test-SerialConnection -Port $ComPort -Baud $BaudRate

if ($success) {
    Write-Host "`n📋 Next Steps:" -ForegroundColor Green
    Write-Host "1. Try interactive mode: .\wifi_serial_commander.ps1 -Interactive" -ForegroundColor White
    Write-Host "2. Test author commands: .\author_serial_commander.ps1 -Interactive" -ForegroundColor White
    Write-Host "3. Configure WiFi: .\wifi_serial_commander.ps1 -SSID 'YourWiFi' -Password 'YourPassword'" -ForegroundColor White
    Write-Host "4. List endpoints: .\author_serial_commander.ps1 -ListEndpoints" -ForegroundColor White
}
else {
    Write-Host "`n❌ Test failed. Check:" -ForegroundColor Red
    Write-Host "- ESP32 is connected and powered" -ForegroundColor White
    Write-Host "- Correct COM port (try Device Manager)" -ForegroundColor White
    Write-Host "- Firmware is flashed with serial command support" -ForegroundColor White
}

Write-Host "`n📚 Documentation: docs/SERIAL_COMMANDS_GUIDE.md" -ForegroundColor Cyan
