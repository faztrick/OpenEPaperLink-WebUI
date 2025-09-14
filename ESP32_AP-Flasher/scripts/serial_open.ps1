param([string]$PortPath='COM5',[int]$Baud=115200)
$body=@{path=$PortPath;baudRate=$Baud}|ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://localhost:3000/api/serial/open' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 20 | ConvertTo-Json -Compress
