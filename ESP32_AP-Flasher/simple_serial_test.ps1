#!/usr/bin/env pwsh
# Simple Serial Command Tester
param(
    [string]$ComPort = "COM10"
)

Write-Host "🔧 Simple Serial Command Test" -ForegroundColor Cyan

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

    # Clear any existing data
    Start-Sleep -Milliseconds 500
    if ($port.BytesToRead -gt 0) {
        $garbage = $port.ReadExisting()
        Write-Host "📱 Cleared existing data: $($garbage.Length) bytes" -ForegroundColor Yellow
    }

    # Test raw serial communication first
    Write-Host "`n📤 Sending: 'CMD:help'" -ForegroundColor Yellow
    $port.WriteLine("CMD:help")

    # Wait and collect response
    Start-Sleep -Seconds 4

    $response = ""
    $attempts = 0
    while ($attempts -lt 20) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $response += $chunk
            Write-Host "📥 Received chunk: $($chunk.Length) bytes" -ForegroundColor Green
        }
        Start-Sleep -Milliseconds 200
        $attempts++
    }

    Write-Host "`n📊 Full Response ($($response.Length) chars):" -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Write-Host $response -ForegroundColor White
    Write-Host "----------------------------------------" -ForegroundColor Gray

    # Test web command
    Write-Host "`n📤 Sending: 'CMD:web.status'" -ForegroundColor Yellow
    $port.WriteLine("CMD:web.status")
    Start-Sleep -Seconds 3

    $webResponse = ""
    $attempts = 0
    while ($attempts -lt 15) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $webResponse += $chunk
            Write-Host "📥 Web response chunk: $($chunk.Length) bytes" -ForegroundColor Green
        }
        Start-Sleep -Milliseconds 200
        $attempts++
    }

    Write-Host "`n🌐 Web Status Response ($($webResponse.Length) chars):" -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Gray
    Write-Host $webResponse -ForegroundColor White
    Write-Host "----------------------------------------" -ForegroundColor Gray

    $port.Close()
    Write-Host "`n✅ Test completed" -ForegroundColor Green

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($port -and $port.IsOpen) {
        $port.Close()
    }
}
