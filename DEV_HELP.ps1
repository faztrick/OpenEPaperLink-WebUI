<#
 Minimal helper menu (no markdown) for frequent dev actions.
 Usage:  pwsh -NoProfile -ExecutionPolicy Bypass -File .\DEV_HELP.ps1
#>
param(
  [string]$Port = 'COM10',
  [int]$Baud = 921600
)

function Timestamp { Get-Date -Format o }

$menu = @(
  '1) PIO Build (OutdoorAP)',
  '2) PIO Upload (OutdoorAP)',
  '3) Fast Build Script',
  '4) Fast Build+Upload Script',
  '5) Start Web UI Server',
  '6) Open Serial Monitor',
  '7) Tail Node Log',
  '8) Quit'
)

function Show-Menu {
  Write-Host '==== DEV HELP MENU ===='
  $menu | ForEach-Object { Write-Host $_ }
}

function Run-Cmd($cmd) {
  Write-Host (Timestamp) '>' $cmd
  Invoke-Expression $cmd
}

while ($true) {
  Show-Menu
  $choice = Read-Host 'Select'
  switch ($choice) {
    '1' { Run-Cmd 'pio run -e OutdoorAP' }
    '2' { Run-Cmd 'pio run -e OutdoorAP -t upload' }
    '3' { Run-Cmd "pwsh -NoProfile -ExecutionPolicy Bypass -File .\ESP32_AP-Flasher\fast_compile.ps1 -Environment OutdoorAP" }
    '4' { Run-Cmd "pwsh -NoProfile -ExecutionPolicy Bypass -File .\ESP32_AP-Flasher\fast_compile.ps1 -Environment OutdoorAP -ComPort $Port -BaudRate $Baud" }
    '5' { Run-Cmd "pwsh -NoProfile -ExecutionPolicy Bypass -Command 'Get-Date -Format o; cd ESP32_AP-Flasher/web-ui; npm start'" }
    '6' { Run-Cmd "pio device monitor --baud 115200 --port $Port" }
    '7' { if (Test-Path .\ESP32_AP-Flasher\web-ui\logs\node.log) { Get-Content .\ESP32_AP-Flasher\web-ui\logs\node.log -Tail 100 -Wait } else { Write-Host 'No node.log yet'; } }
    '8' { break }
    default { Write-Host 'Invalid selection' }
  }
  if ($choice -eq '8') { break }
}
