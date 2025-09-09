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
  '5) Start Next Web UI (dev)',
  '6) Open Serial Monitor',
  '7) Tail Next.js Log (pm2/stdout if running)',
  '8) Start Legacy Web UI (server.js)',
  '9) Quit'
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
    '5' {
      # Start Next.js dev server (web-ui-next)
      if (-not (Test-Path .\ESP32_AP-Flasher\web-ui-next\node_modules)) {
        Write-Host 'node_modules missing. Running npm install in web-ui-next...'
        Push-Location .\ESP32_AP-Flasher\web-ui-next
        Run-Cmd 'npm install'
        Pop-Location
      }
      Run-Cmd "pwsh -NoProfile -ExecutionPolicy Bypass -Command 'Get-Date -Format o; cd ESP32_AP-Flasher/web-ui-next; npm run dev'"
    }
    '6' { Run-Cmd "pio device monitor --baud 115200 --port $Port" }
    '7' {
      # Tail Next.js/.next or pm2 logs if present, fallback to legacy node log
      $pm2Log = "$env:USERPROFILE\.pm2\logs\webui-dev-out.log"
      $legacyLog = '.\ESP32_AP-Flasher\web-ui\logs\node.log'
      if (Test-Path $pm2Log) {
        Get-Content $pm2Log -Tail 100 -Wait
      }
      elseif (Test-Path $legacyLog) {
        Get-Content $legacyLog -Tail 100 -Wait
      }
      else {
        Write-Host 'No log file found (pm2 Next.js or legacy node.log).'
      }
    }
    '8' { Run-Cmd "pwsh -NoProfile -ExecutionPolicy Bypass -Command 'Get-Date -Format o; cd ESP32_AP-Flasher/web-ui; npm start'" }
    '9' { break }
    default { Write-Host 'Invalid selection' }
  }
  if ($choice -eq '9') { break }
}
