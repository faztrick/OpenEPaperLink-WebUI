param(
  [string]$Port = 'COM10',
  [int]$Baud = 115200,
  [int]$TimeoutMs = 8000,
  [string]$ApiBase = 'http://localhost:3000'
)
$body = @{ path = $Port; baudRate = $Baud; timeoutMs = $TimeoutMs } | ConvertTo-Json -Depth 4
Write-Host "POST $ApiBase/api/serial/wifi/scan ($Port)" -ForegroundColor Cyan
$resp = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/serial/wifi/scan" -ContentType 'application/json' -Body $body -TimeoutSec ([math]::Ceiling(($TimeoutMs / 1000) + 2))
if (-not $resp.success) { Write-Error "Scan failed: $($resp.error)"; exit 1 }
Write-Host "Networks: $($resp.networks.Count)" -ForegroundColor Green
$resp.networks | Sort-Object { [int]($_.rssi) } -Descending | ForEach-Object {
  '{0,-34} RSSI={1,4} auth={2}' -f $_.ssid, $_.rssi, $_.auth
}
