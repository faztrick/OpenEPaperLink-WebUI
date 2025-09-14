param(
  [string]$Port = 'COM5',
  [int]$Baud = 115200,
  [int]$TimeoutSec = 25,
  [switch]$Raw,
  [switch]$Json,
  [int]$MinRssi = [int]::MinValue,
  [int]$Top = 0,
  [string]$ExportPath
)

# Simple serial WiFi scan initiator for ESP32 firmware expecting 'wifi_scan' command.
# It sends the command, then collects lines until timeout or a completion marker is detected.
# Attempts to parse networks lines of the form: index: RSSI dBm, "SSID" (optional BSSID/channel)

$ErrorActionPreference = 'Stop'

function Open-Port($portName, $baud) {
  $sp = New-Object System.IO.Ports.SerialPort $portName, $baud, 'None', 8, 'One'
  $sp.ReadTimeout = 500
  $sp.WriteTimeout = 2000
  $sp.NewLine = "`n"
  $sp.Open()
  return $sp
}

if (-not [IO.Ports.SerialPort]::GetPortNames().Contains($Port)) {
  Write-Error "Port $Port not found. Available: $([IO.Ports.SerialPort]::GetPortNames() -join ', ')"
}

$serial = Open-Port $Port $Baud
try {
  Write-Host "[*] Sending wifiscan command to $Port at $Baud..."
  $serial.DiscardInBuffer()
  $serial.WriteLine('wifiscan')
  Start-Sleep -Milliseconds 150

  $lines = @()
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  # $done removed (was unused) – relying purely on timeout/heuristic break

  while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSec) {
    try {
      $line = $serial.ReadLine()
      if ($null -ne $line) {
        $clean = $line.TrimEnd("`r", "`n")
        if ($clean.Length -gt 0) { $lines += $clean }
        # Heuristic completion markers
        if ($clean -match 'scan' -and $clean -match 'complete') { break }
        if ($clean -match 'found' -and $clean -match 'network') {
          # possible summary line
          # continue reading to pick up list
        }
      }
    }
    catch {
      # timeout of ReadLine; continue waiting
    }
  }

  $stopwatch.Stop()

  if ($lines.Count -eq 0) {
    Write-Warning 'No serial output captured.'
  }

  if ($Raw) {
    Write-Host '--- RAW OUTPUT START ---'
    $lines | ForEach-Object { Write-Host $_ }
    Write-Host '--- RAW OUTPUT END ---'
    return
  }

  # Parse potential network entries.
  # Common patterns to attempt:
  #   0: -45 dBm, "MySSID" (channel 6)
  #   SSID: MySSID RSSI:-45 CH:6
  # We'll build regex attempts.

  $results = @()
  foreach ($l in $lines) {
    # Attempt JSON parse for lines starting with {
    if ($l.StartsWith('{')) {
      try {
        $obj = $l | ConvertFrom-Json -ErrorAction Stop
        if ($obj.event -eq 'wifinet') {
          $results += [pscustomobject]@{ SSID = $obj.ssid; RSSI = [int]$obj.rssi; Channel = [int]$obj.channel; BSSID = $obj.bssid; Enc = $obj.enc }
        }
        elseif ($obj.event -eq 'wifiscan_summary') {
          $summaryExpected = [int]$obj.count
        }
      }
      catch {
        # ignore non-JSON line
      }
    }
  }

  if ($summaryExpected -and $results.Count -ne $summaryExpected) {
    Write-Host "[!] Parsed $($results.Count) of $summaryExpected networks (some lines may have been missed)" -ForegroundColor Yellow
  }

  # Apply filters
  $filtered = $results | Where-Object { $_.RSSI -ge $MinRssi }
  if ($Top -gt 0) { $filtered = $filtered | Sort-Object RSSI -Descending | Select-Object -First $Top }
  else { $filtered = $filtered | Sort-Object RSSI -Descending }

  if ($filtered.Count -eq 0) {
    Write-Host "No networks parsed after filters. Use -Raw for diagnostics." -ForegroundColor Yellow
  }
  else {
    if ($Json) {
      $payload = [pscustomobject]@{
        port      = $Port
        baud      = $Baud
        total     = $results.Count
        filtered  = $filtered.Count
        minRssi   = $MinRssi
        generated = (Get-Date).ToString('o')
        networks  = $filtered
      }
      $jsonOut = $payload | ConvertTo-Json -Depth 4
      if ($ExportPath) {
        $jsonOut | Out-File -FilePath $ExportPath -Encoding UTF8
        Write-Host "Exported JSON to $ExportPath" -ForegroundColor Green
      }
      Write-Output $jsonOut
    }
    else {
      Write-Host "Found $($results.Count) network(s) | Showing $($filtered.Count) after filters:" -ForegroundColor Cyan
      $filtered | Format-Table -AutoSize
      if ($ExportPath) {
        try {
          $filtered | ConvertTo-Json -Depth 4 | Out-File -FilePath $ExportPath -Encoding UTF8
          Write-Host "Exported filtered JSON to $ExportPath" -ForegroundColor Green
        }
        catch { Write-Warning "Failed to export JSON: $($_.Exception.Message)" }
      }
    }
  }

}
finally {
  if ($serial -and $serial.IsOpen) { $serial.Close() }
}
