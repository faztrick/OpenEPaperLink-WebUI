param(
    [string]$Port = 'COM10',
    [string]$Ssid = '',
    [string]$Password = '',
    [int]$Baud = 115200,
    [string]$Server = 'http://localhost:3000'
)

if (-not $Ssid) { Write-Error 'Please provide -Ssid'; exit 1 }

# Timestamp per project guideline
Get-Date -Format o

$bodyObj = @{ path = $Port; ssid = $Ssid; password = $Password; baudRate = $Baud }
$bodyJson = $bodyObj | ConvertTo-Json -Compress

try {
    $resp = Invoke-RestMethod -UseBasicParsing -Method Post -Uri "$Server/api/serial/wifi/connect" -ContentType 'application/json' -Body $bodyJson
    ($resp | ConvertTo-Json -Depth 6)
} catch {
    Write-Error $_
}

# End timestamp
Get-Date -Format o
