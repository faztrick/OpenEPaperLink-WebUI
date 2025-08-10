#!/usr/bin/env pwsh
# Force AP Mode and Test Commands
param(
    [string]$ComPort = "COM10"
)

Write-Host "🚀 Force AP Mode Test" -ForegroundColor Cyan

try {
    Add-Type -AssemblyName System.IO.Ports
    $port = New-Object System.IO.Ports.SerialPort
    $port.PortName = $ComPort
    $port.BaudRate = 115200
    $port.Parity = "None"
    $port.DataBits = 8
    $port.StopBits = "One"
    $port.ReadTimeout = 5000
    $port.WriteTimeout = 5000

    $port.Open()
    Write-Host "✅ Port opened successfully" -ForegroundColor Green

    function Send-Command($cmd, $waitTime = 3) {
        Write-Host "`n📤 Sending: '$cmd'" -ForegroundColor Yellow
        $port.WriteLine($cmd)
        Start-Sleep -Seconds $waitTime

        $response = ""
        $attempts = 0
        while ($attempts -lt 20) {
            if ($port.BytesToRead -gt 0) {
                $chunk = $port.ReadExisting()
                $response += $chunk
            }
            Start-Sleep -Milliseconds 100
            $attempts++
        }

        if ($response.Length -gt 0) {
            Write-Host "📥 Response: $($response.Length) chars" -ForegroundColor Green
            Write-Host $response -ForegroundColor White
        } else {
            Write-Host "❌ No response" -ForegroundColor Red
        }
        return $response
    }

    # Clear any existing data
    Start-Sleep -Milliseconds 500
    if ($port.BytesToRead -gt 0) {
        $garbage = $port.ReadExisting()
        Write-Host "📱 Cleared $($garbage.Length) bytes" -ForegroundColor Yellow
    }

    # Test entering command mode
    Write-Host "`n🔧 Testing Command Mode Entry..." -ForegroundColor Cyan
    $response = Send-Command "CMD:" 2

    if ($response -match "Command Mode Activated") {
        Write-Host "✅ Command mode activated!" -ForegroundColor Green

        # Test help command
        $helpResponse = Send-Command "help" 3

        # Test web status
        $webResponse = Send-Command "web.status" 3

        # Test web info
        $infoResponse = Send-Command "web.info" 3

        # Try to start web server
        Write-Host "`n🌐 Attempting to start web server..." -ForegroundColor Cyan
        $startResponse = Send-Command "web.start" 5

        # Check status after start attempt
        $statusResponse = Send-Command "web.status" 3

    } else {
        Write-Host "❌ Failed to enter command mode" -ForegroundColor Red
        Write-Host "Response: $response" -ForegroundColor Yellow
    }

    $port.Close()
    Write-Host "`n✅ Test completed" -ForegroundColor Green

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($port -and $port.IsOpen) {
        $port.Close()
    }
}
