param(
    [string]$Port = 'COM10',
    [int]$Baud = 115200,
    [int]$TimeoutMs = 10000,
    [string]$Server = 'http://localhost:3000'
)

# Timestamp per project guideline
Get-Date -Format o

$bodyObj = @{ path = $Port; baudRate = $Baud; timeoutMs = $TimeoutMs }
$bodyJson = $bodyObj | ConvertTo-Json -Compress

try {
    $resp = Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$Server/api/serial/wifi/scan" -ContentType 'application/json' -Body $bodyJson
    # Print a compact JSON for readability
    ($resp | ConvertTo-Json -Depth 6)
} catch {
    Write-Error $_
}

# End timestamp
Get-Date -Format o
