param([int]$MinRssi=-90,[int]$Top=0)
$body=@{minRssi=$MinRssi}
if($Top -gt 0){$body.top=$Top}
$json=$body|ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://localhost:3000/api/serial/wifi/scan' -Method Post -Body $json -ContentType 'application/json' -TimeoutSec 60 | ConvertTo-Json -Depth 6
