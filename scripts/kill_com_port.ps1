param(
    [Parameter(Mandatory=$false)]
    [string]$Port = "COM10"
)

$ErrorActionPreference = "Continue"

function Timestamp { Get-Date -Format o }

Write-Host (Timestamp)
Write-Host "Scanning for processes holding $Port or serial monitors..."

# Build a candidate list: processes whose command line mentions the COM port
# AND also look like esptool/miniterm/pio device monitor. Skip current PowerShell.
$selfPid = $PID
$procs = Get-CimInstance Win32_Process |
    Where-Object {
        $_.CommandLine -and (
            (
                $_.CommandLine -like "* $Port*" -or
                $_.CommandLine -like "*--port $Port*"
            ) -and (
                $_.CommandLine -like "*device monitor*" -or
                $_.CommandLine -like "*serial.tools.miniterm*" -or
                $_.CommandLine -like "*esptool*" -or
                $_.Name -match "python|esptool|pio"
            )
        ) -and ($_.ProcessId -ne $selfPid) -and ($_.Name -notlike "pwsh*")
    }

if (-not $procs) {
    Write-Host "No matching processes found."
    exit 0
}

Write-Host "Found processes:" -ForegroundColor Yellow
$procs | ForEach-Object {
    Write-Host (" PID={0} Name={1}" -f $_.ProcessId, $_.Name)
}

Write-Host "Killing processes..." -ForegroundColor Yellow
foreach ($p in $procs) {
    try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Host (" Killed PID {0} {1}" -f $p.ProcessId, $p.Name) -ForegroundColor Green
    } catch {
        Write-Host (" Skip PID {0}: {1}" -f $p.ProcessId, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host (Timestamp)
Write-Host "Done."
