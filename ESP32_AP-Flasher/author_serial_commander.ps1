#!/usr/bin/env pwsh
# Author & Endpoints Serial Commander - Manage ESP32 author info and endpoint testing via serial
param(
    [string]$ComPort = "COM10",
    [int]$BaudRate = 115200,
    [string]$AuthorName = "",
    [switch]$ListEndpoints,
    [switch]$TestEndpoints,
    [switch]$Interactive,
    [string]$TestEndpoint = ""
)

Write-Host "👤 ESP32 Author & Endpoints Serial Commander" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host "Port: $ComPort | Baud: $BaudRate" -ForegroundColor Cyan
Write-Host ""

# Serial Command Functions
function Send-SerialCommand {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [string]$Command,
        [int]$WaitTime = 2000
    )

    Write-Host "📤 Sending: $Command" -ForegroundColor Yellow
    $Port.WriteLine($Command)
    Start-Sleep -Milliseconds $WaitTime

    # Read response
    $response = ""
    $timeout = (Get-Date).AddMilliseconds(5000)

    while ((Get-Date) -lt $timeout) {
        try {
            if ($Port.BytesToRead -gt 0) {
                $response += $Port.ReadExisting()
            }
            else {
                Start-Sleep -Milliseconds 100
            }
        }
        catch {
            break
        }
    }

    if ($response) {
        Write-Host "📥 Response:" -ForegroundColor Cyan
        $response.Split("`n") | ForEach-Object {
            if ($_.Trim()) {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
    }

    return $response
}

function Get-AuthorInformation {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Host "`n👤 Getting Author Information..." -ForegroundColor Cyan

    $commands = @(
        "author.get",
        "version"
    )

    $info = @{}

    foreach ($cmd in $commands) {
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 1500
        $info[$cmd] = $response
    }

    return $info
}

function Set-AuthorInformation {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [string]$AuthorName
    )

    Write-Host "`n✍️ Setting Author Information..." -ForegroundColor Cyan

    if ($AuthorName.Length -eq 0) {
        Write-Host "❌ Author name cannot be empty" -ForegroundColor Red
        return
    }

    $command = "author.set `"$AuthorName`""
    Send-SerialCommand -Port $Port -Command $command -WaitTime 2000
}

function Get-EndpointsList {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Host "`n🔗 Getting Available Endpoints..." -ForegroundColor Cyan

    $commands = @(
        "author.endpoints",
        "author.status"
    )

    $endpoints = @{}

    foreach ($cmd in $commands) {
        $response = Send-SerialCommand -Port $Port -Command $cmd -WaitTime 2000
        $endpoints[$cmd] = $response
    }

    return $endpoints
}

function Test-AllEndpoints {
    param([System.IO.Ports.SerialPort]$Port)

    Write-Host "`n🧪 Testing Common Endpoints..." -ForegroundColor Cyan

    # Common endpoints to test
    $testEndpoints = @(
        "/",
        "/get_wifi_config",
        "/wifi_scan",
        "/api/wifi/status",
        "/system_info",
        "/network_info"
    )

    $results = @{}

    foreach ($endpoint in $testEndpoints) {
        Write-Host "   Testing: $endpoint" -ForegroundColor Yellow
        $command = "author.test `"$endpoint`""
        $response = Send-SerialCommand -Port $Port -Command $command -WaitTime 3000
        $results[$endpoint] = $response
        Start-Sleep -Seconds 1
    }

    return $results
}

function Test-SpecificEndpoint {
    param(
        [System.IO.Ports.SerialPort]$Port,
        [string]$Endpoint
    )

    Write-Host "`n🎯 Testing Specific Endpoint: $Endpoint" -ForegroundColor Cyan

    $command = "author.test `"$Endpoint`""
    $response = Send-SerialCommand -Port $Port -Command $command -WaitTime 3000

    return $response
}

function Show-AuthorHelp {
    Write-Host "`n📚 Author & Endpoint Commands Help" -ForegroundColor Green
    Write-Host "===================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Author Commands:" -ForegroundColor Yellow
    Write-Host "   author.get              - Get current author information" -ForegroundColor Gray
    Write-Host "   author.set <name>       - Set author name" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Endpoint Commands:" -ForegroundColor Yellow
    Write-Host "   author.endpoints        - List all available endpoints" -ForegroundColor Gray
    Write-Host "   author.status           - Get endpoint access status" -ForegroundColor Gray
    Write-Host "   author.test <endpoint>  - Test specific endpoint" -ForegroundColor Gray
    Write-Host ""
    Write-Host "System Commands:" -ForegroundColor Yellow
    Write-Host "   version                 - Get firmware version" -ForegroundColor Gray
    Write-Host "   system.info             - Get system information" -ForegroundColor Gray
    Write-Host "   help                    - Show all available commands" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "   author.set `"John Developer`"" -ForegroundColor White
    Write-Host "   author.test `"/api/wifi/status`"" -ForegroundColor White
    Write-Host "   author.endpoints" -ForegroundColor White
}

# Main execution
try {
    # Setup serial connection
    Add-Type -AssemblyName System.IO.Ports

    $serialPort = New-Object System.IO.Ports.SerialPort
    $serialPort.PortName = $ComPort
    $serialPort.BaudRate = $BaudRate
    $serialPort.DataBits = 8
    $serialPort.Parity = [System.IO.Ports.Parity]::None
    $serialPort.StopBits = [System.IO.Ports.StopBits]::One
    $serialPort.ReadTimeout = 1000
    $serialPort.WriteTimeout = 1000

    Write-Host "🔌 Connecting to $ComPort..." -ForegroundColor Cyan
    $serialPort.Open()
    Write-Host "✅ Connected to ESP32 serial port" -ForegroundColor Green

    # Wait for startup messages
    Start-Sleep -Seconds 2

    # Clear any startup messages
    try {
        $serialPort.ReadExisting() | Out-Null
    }
    catch { }

    if ($Interactive) {
        Write-Host "`n🎮 Interactive Author & Endpoint Mode - Enter commands (type 'exit' to quit):" -ForegroundColor Green
        Show-AuthorHelp

        while ($true) {
            $userCommand = Read-Host "`nESP32-Author> "

            if ($userCommand -eq "exit" -or $userCommand -eq "quit") {
                break
            }

            if ($userCommand -eq "help") {
                Show-AuthorHelp
                continue
            }

            if ($userCommand.Trim()) {
                Send-SerialCommand -Port $serialPort -Command $userCommand -WaitTime 3000
            }
        }
    }
    else {
        # Get current author information
        Write-Host "📋 Current Author Information:" -ForegroundColor Green
        $authorInfo = Get-AuthorInformation -Port $serialPort

        # Set author name if provided
        if ($AuthorName -and $AuthorName.Length -gt 0) {
            Set-AuthorInformation -Port $serialPort -AuthorName $AuthorName

            # Get updated information
            Write-Host "`n📋 Updated Author Information:" -ForegroundColor Green
            $updatedInfo = Get-AuthorInformation -Port $serialPort
        }

        # List endpoints if requested
        if ($ListEndpoints) {
            Write-Host "`n📑 Available Endpoints:" -ForegroundColor Green
            $endpoints = Get-EndpointsList -Port $serialPort
        }

        # Test specific endpoint if provided
        if ($TestEndpoint -and $TestEndpoint.Length -gt 0) {
            Write-Host "`n🎯 Testing Specific Endpoint:" -ForegroundColor Green
            $testResult = Test-SpecificEndpoint -Port $serialPort -Endpoint $TestEndpoint
        }

        # Test all endpoints if requested
        if ($TestEndpoints) {
            Write-Host "`n🧪 Testing All Common Endpoints:" -ForegroundColor Green
            $allTestResults = Test-AllEndpoints -Port $serialPort

            # Summary
            Write-Host "`n📊 Endpoint Test Summary:" -ForegroundColor Green
            $allTestResults.Keys | ForEach-Object {
                $endpoint = $_
                $result = $allTestResults[$endpoint]

                if ($result -and $result.Contains("JSON:") -and $result.Contains("wifi_connected")) {
                    Write-Host "   ✅ $endpoint - Accessible" -ForegroundColor Green
                }
                elseif ($result -and $result.Length -gt 50) {
                    Write-Host "   ⚠️  $endpoint - Response received" -ForegroundColor Yellow
                }
                else {
                    Write-Host "   ❌ $endpoint - No response or error" -ForegroundColor Red
                }
            }
        }

        # Final status check
        Write-Host "`n📊 Final Status Check..." -ForegroundColor Cyan
        $finalStatus = Send-SerialCommand -Port $serialPort -Command "author.status" -WaitTime 2000
    }

}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($serialPort -and $serialPort.IsOpen) {
        Write-Host "`n🔌 Closing serial connection..." -ForegroundColor Yellow
        $serialPort.Close()
        Write-Host "✅ Serial connection closed" -ForegroundColor Green
    }
}

Write-Host "`n👤 Author & Endpoints Serial Commander Complete!" -ForegroundColor Green
Write-Host "Usage examples:" -ForegroundColor Cyan
Write-Host "   .\author_serial_commander.ps1 -Interactive" -ForegroundColor Gray
Write-Host "   .\author_serial_commander.ps1 -AuthorName 'John Doe'" -ForegroundColor Gray
Write-Host "   .\author_serial_commander.ps1 -ListEndpoints" -ForegroundColor Gray
Write-Host "   .\author_serial_commander.ps1 -TestEndpoints" -ForegroundColor Gray
Write-Host "   .\author_serial_commander.ps1 -TestEndpoint '/api/wifi/status'" -ForegroundColor Gray
