param($Port = 'COM5', $Baud = 115200, $Lines = 120)
$sp = New-Object System.IO.Ports.SerialPort $Port, $Baud, 'None', 8, 'One'
$sp.ReadTimeout = 400
try { $sp.Open() } catch { Write-Host ("Failed to open {0}: {1}" -f $Port, $_) ; exit 1 }
for ($i = 0; $i -lt $Lines; $i++) {
  try { $l = $sp.ReadLine(); if ($l) { Write-Host $l } } catch {}
}
$sp.Close()
