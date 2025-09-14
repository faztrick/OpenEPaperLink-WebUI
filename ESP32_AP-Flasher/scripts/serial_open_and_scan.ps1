param(
    [string]$PortPath = 'COM5',
    [int]$Baud = 115200,
    [int]$MinRssi = -90,
    [int]$Top = 0
)

$ErrorActionPreference = 'Stop'

function Invoke-JsonPost($Url, $Object) {
    $json = $Object | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri $Url -Method Post -Body $json -ContentType 'application/json' -TimeoutSec 30
}

Write-Host "Serial status before:" -ForegroundColor Cyan
try {
    $status = Invoke-RestMethod -Uri 'http://localhost:3000/api/serial/status' -TimeoutSec 5
    $status | ConvertTo-Json -Compress
} catch { 'status endpoint unavailable'; return }

Write-Host "Opening serial port $PortPath @ $Baud..." -ForegroundColor Cyan
$openResp = Invoke-JsonPost 'http://localhost:3000/api/serial/open' @{ path=$PortPath; baudRate=$Baud }
$openResp | ConvertTo-Json -Compress

Start-Sleep -Seconds 2

Write-Host "Running wifi scan (minRssi=$MinRssi, top=$Top)..." -ForegroundColor Cyan
$scanBody = @{ minRssi = $MinRssi }
if ($Top -gt 0) { $scanBody.top = $Top }
$scanResp = Invoke-JsonPost 'http://localhost:3000/api/serial/wifi/scan' $scanBody
$scanResp | ConvertTo-Json -Depth 6
