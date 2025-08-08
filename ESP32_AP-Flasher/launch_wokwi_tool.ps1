#!/usr/bin/env pwsh
# Wokwi Configuration Tool Launcher
# This script launches the Wokwi configuration tool in your default browser

param(
    [int]$Port = 8080,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Wokwi Configuration Tool Launcher

USAGE:
    .\launch_wokwi_tool.ps1 [-Port <port>] [-Help]

OPTIONS:
    -Port <port>    Specify the port to serve the tool (default: 8080)
    -Help           Show this help message

EXAMPLES:
    .\launch_wokwi_tool.ps1
    .\launch_wokwi_tool.ps1 -Port 3000

DESCRIPTION:
    This script launches a simple HTTP server to serve the Wokwi configuration tool.
    The tool will be accessible at http://localhost:<port>/wokwi_config_tool.html
"@
    exit 0
}

$ToolPath = $PSScriptRoot
$HtmlFile = "wokwi_config_tool.html"
$JsFile = "wokwi_config_tool.js"

# Check if files exist
if (!(Test-Path "$ToolPath\$HtmlFile")) {
    Write-Error "HTML file not found: $HtmlFile"
    Write-Host "Please make sure $HtmlFile is in the same directory as this script."
    exit 1
}

if (!(Test-Path "$ToolPath\$JsFile")) {
    Write-Error "JavaScript file not found: $JsFile"
    Write-Host "Please make sure $JsFile is in the same directory as this script."
    exit 1
}

Write-Host "🚀 Starting Wokwi Configuration Tool..." -ForegroundColor Green
Write-Host "📁 Serving from: $ToolPath" -ForegroundColor Cyan
Write-Host "🌐 Port: $Port" -ForegroundColor Cyan

# Try different methods to serve the files
$ServerStarted = $false

# Method 1: Try Python 3
try {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        Write-Host "🐍 Using Python HTTP server..." -ForegroundColor Yellow
        Set-Location $ToolPath
        Start-Process python -ArgumentList "-m", "http.server", $Port -WindowStyle Hidden
        $ServerStarted = $true
        $ServerType = "Python"
    }
}
catch {
    Write-Verbose "Python not available or failed to start"
}

# Method 2: Try Node.js if Python failed
if (!$ServerStarted) {
    try {
        if (Get-Command node -ErrorAction SilentlyContinue) {
            Write-Host "🟢 Using Node.js HTTP server..." -ForegroundColor Yellow

            # Create a simple Node.js server script
            $NodeServerScript = @"
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? '/wokwi_config_tool.html' : req.url);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }

        const ext = path.extname(filePath);
        let contentType = 'text/html';

        switch(ext) {
            case '.js': contentType = 'text/javascript'; break;
            case '.css': contentType = 'text/css'; break;
            case '.json': contentType = 'application/json'; break;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen($Port, () => {
    console.log('Server running on port $Port');
});
"@

            $NodeServerScript | Out-File -FilePath "$ToolPath\temp_server.js" -Encoding UTF8
            Set-Location $ToolPath
            Start-Process node -ArgumentList "temp_server.js" -WindowStyle Hidden
            $ServerStarted = $true
            $ServerType = "Node.js"
        }
    }
    catch {
        Write-Verbose "Node.js not available or failed to start"
    }
}

# Method 3: Try PowerShell's built-in capabilities (Windows 10+)
if (!$ServerStarted) {
    try {
        Write-Host "⚡ Using PowerShell HTTP server..." -ForegroundColor Yellow

        # Create a simple PowerShell HTTP server
        $HttpListener = New-Object System.Net.HttpListener
        $HttpListener.Prefixes.Add("http://localhost:$Port/")
        $HttpListener.Start()

        Write-Host "✅ PowerShell HTTP server started successfully!" -ForegroundColor Green
        $ServerStarted = $true
        $ServerType = "PowerShell"

        # Handle requests in background
        $Job = Start-Job -ScriptBlock {
            param($Listener, $ToolPath, $HtmlFile, $JsFile)

            while ($Listener.IsListening) {
                $Context = $Listener.GetContext()
                $Request = $Context.Request
                $Response = $Context.Response

                $RequestedFile = if ($Request.Url.AbsolutePath -eq "/") { $HtmlFile }
                elseif ($Request.Url.AbsolutePath -eq "/$JsFile") { $JsFile }
                else { $null }

                if ($RequestedFile -and (Test-Path "$ToolPath\$RequestedFile")) {
                    $Content = Get-Content "$ToolPath\$RequestedFile" -Raw -Encoding UTF8
                    $Buffer = [System.Text.Encoding]::UTF8.GetBytes($Content)

                    if ($RequestedFile.EndsWith('.html')) {
                        $Response.ContentType = 'text/html; charset=utf-8'
                    }
                    elseif ($RequestedFile.EndsWith('.js')) {
                        $Response.ContentType = 'text/javascript; charset=utf-8'
                    }

                    $Response.ContentLength64 = $Buffer.Length
                    $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
                }
                else {
                    $Response.StatusCode = 404
                    $NotFoundMessage = "File not found"
                    $Buffer = [System.Text.Encoding]::UTF8.GetBytes($NotFoundMessage)
                    $Response.ContentLength64 = $Buffer.Length
                    $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
                }

                $Response.Close()
            }
        } -ArgumentList $HttpListener, $ToolPath, $HtmlFile, $JsFile
    }
    catch {
        Write-Verbose "PowerShell HTTP server failed: $($_.Exception.Message)"
    }
}

if (!$ServerStarted) {
    Write-Error "❌ Could not start any HTTP server!"
    Write-Host "Please install Python or Node.js to run the configuration tool." -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Open $HtmlFile directly in your browser (some features may not work)" -ForegroundColor Yellow
    exit 1
}

# Wait a moment for server to start
Start-Sleep -Seconds 2

# Open in default browser
$Url = "http://localhost:$Port"
if ($ServerType -ne "PowerShell") {
    $Url += "/wokwi_config_tool.html"
}

Write-Host ""
Write-Host "🎉 Wokwi Configuration Tool is ready!" -ForegroundColor Green
Write-Host "🌐 URL: $Url" -ForegroundColor Cyan
Write-Host "📝 Server Type: $ServerType" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow

# Open browser
try {
    Start-Process $Url
    Write-Host "🖥️  Opening in default browser..." -ForegroundColor Green
}
catch {
    Write-Host "⚠️  Could not open browser automatically. Please navigate to: $Url" -ForegroundColor Yellow
}

# Keep script running for PowerShell server
if ($ServerType -eq "PowerShell") {
    try {
        Write-Host "Server is running... Press Ctrl+C to stop" -ForegroundColor Green
        while ($true) {
            Start-Sleep -Seconds 1
        }
    }
    finally {
        if ($HttpListener) {
            $HttpListener.Stop()
            $HttpListener.Close()
        }
        if ($Job) {
            Stop-Job $Job
            Remove-Job $Job
        }
        Write-Host "🛑 Server stopped." -ForegroundColor Red
    }
}
else {
    Write-Host "✅ Server started in background. Close the terminal or kill the process to stop." -ForegroundColor Green

    # Clean up temp files
    if (Test-Path "$ToolPath\temp_server.js") {
        Start-Sleep -Seconds 5
        Remove-Item "$ToolPath\temp_server.js" -Force -ErrorAction SilentlyContinue
    }
}
