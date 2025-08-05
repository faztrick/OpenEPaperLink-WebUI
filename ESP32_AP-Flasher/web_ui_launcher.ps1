#!/usr/bin/env pwsh

# ESP32 Web UI Installer and Launcher
# This script sets up and starts the web-based development interface

param(
    [switch]$Install,
    [switch]$Start,
    [switch]$Stop,
    [switch]$Status,
    [switch]$Clean,
    [string]$Port = "3000"
)

$ErrorActionPreference = "Stop"
$webUIDir = Join-Path $PSScriptRoot "web-ui"
$serverScript = Join-Path $webUIDir "server.js"
$packageJson = Join-Path $webUIDir "package.json"

function Write-ColorOutput {
    param($Message, $Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Show-InstallComplete {
        Write-ColorOutput "✓ Installation completed successfully!" Green
        Write-ColorOutput ""
        Write-ColorOutput "🤖 AI Features Available:" Cyan
        Write-ColorOutput "  • Error diagnosis and solutions" White
        Write-ColorOutput "  • Code analysis and optimization" White
        Write-ColorOutput "  • Interactive chat assistant" White
        Write-ColorOutput "  • Build optimization suggestions" White
        Write-ColorOutput ""
        Write-ColorOutput "To enable AI features:" Yellow
        Write-ColorOutput "  1. Get API key from OpenAI or Anthropic" White
        Write-ColorOutput "  2. Start the server and configure in 'AI Config'" White
        Write-ColorOutput ""
        Write-ColorOutput "Run '.\web_ui_launcher.ps1 -Start' to start the server" Cyan
}

function Test-NodeInstalled {
    try {
        $nodeVersion = node --version 2>$null
        $npmVersion = npm --version 2>$null
        Write-ColorOutput "✓ Node.js: $nodeVersion" Green
        Write-ColorOutput "✓ npm: $npmVersion" Green
        return $true
    }
    catch {
        Write-ColorOutput "✗ Node.js not found. Please install Node.js from https://nodejs.org/" Red
        return $false
    }
}

function Install-Dependencies {
    Write-ColorOutput "Installing Node.js dependencies..." Yellow
    
    if (-not (Test-Path $webUIDir)) {
        Write-ColorOutput "✗ web-ui directory not found!" Red
        return $false
    }
    
    Set-Location $webUIDir
    
    try {
        npm install
        Write-ColorOutput "✓ Dependencies installed successfully" Green
        return $true
    }
    catch {
        Write-ColorOutput "✗ Failed to install dependencies: $_" Red
        return $false
    }
    finally {
        Set-Location $PSScriptRoot
    }
}

function Start-WebServer {
    param($Port)
    
    if (-not (Test-Path $serverScript)) {
        Write-ColorOutput "✗ Server script not found. Run with -Install first." Red
        return
    }
    
    Write-ColorOutput "Starting ESP32 Web Development UI..." Yellow
    Write-ColorOutput "Server will be available at: http://localhost:$Port" Green
    Write-ColorOutput "Press Ctrl+C to stop the server" Gray
    Write-ColorOutput "----------------------------------------" Gray
    
    Set-Location $webUIDir
    
    try {
        $env:PORT = $Port
        node server.js
    }
    catch {
        Write-ColorOutput "✗ Failed to start server: $_" Red
    }
    finally {
        Set-Location $PSScriptRoot
    }
}

function Stop-WebServer {
    Write-ColorOutput "Stopping web server..." Yellow
    
    # Find and stop Node.js processes running our server
    $processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*server.js*"
    }
    
    if ($processes) {
        $processes | ForEach-Object {
            Stop-Process -Id $_.Id -Force
            Write-ColorOutput "✓ Stopped process $($_.Id)" Green
        }
    } else {
        Write-ColorOutput "No running web server found" Yellow
    }
}

function Get-ServerStatus {
    Write-ColorOutput "ESP32 Web UI Status:" Yellow
    Write-ColorOutput "===================" Gray
    
    # Check if Node.js is installed
    if (Test-NodeInstalled) {
        Write-ColorOutput ""
    } else {
        return
    }
    
    # Check if dependencies are installed
    if (Test-Path $packageJson) {
        $nodeModules = Join-Path $webUIDir "node_modules"
        if (Test-Path $nodeModules) {
            Write-ColorOutput "✓ Dependencies installed" Green
        } else {
            Write-ColorOutput "✗ Dependencies not installed (run with -Install)" Red
        }
    } else {
        Write-ColorOutput "✗ package.json not found" Red
    }
    
    # Check if server is running
    $runningProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*server.js*"
    }
    
    if ($runningProcesses) {
        Write-ColorOutput "✓ Web server is running (PID: $($runningProcesses[0].Id))" Green
        Write-ColorOutput "  Available at: http://localhost:$Port" Cyan
    } else {
        Write-ColorOutput "✗ Web server is not running" Red
    }
    
    # Check web-ui directory structure
    Write-ColorOutput ""
    Write-ColorOutput "File Structure:" Yellow
    $files = @(
        "server.js",
        "package.json", 
        "ai_agent.js",
        "ai_config.json",
        "public/index.html",
        "public/styles.css",
        "public/app.js"
    )
    
    foreach ($file in $files) {
        $filePath = Join-Path $webUIDir $file
        if (Test-Path $filePath) {
            Write-ColorOutput "  ✓ $file" Green
        } else {
            Write-ColorOutput "  ✗ $file" Red
        }
    }
}

function Clean-Installation {
    Write-ColorOutput "Cleaning web UI installation..." Yellow
    
    $nodeModules = Join-Path $webUIDir "node_modules"
    $packageLock = Join-Path $webUIDir "package-lock.json"
    
    if (Test-Path $nodeModules) {
        Remove-Item $nodeModules -Recurse -Force
        Write-ColorOutput "✓ Removed node_modules" Green
    }
    
    if (Test-Path $packageLock) {
        Remove-Item $packageLock -Force
        Write-ColorOutput "✓ Removed package-lock.json" Green
    }
    
    Write-ColorOutput "✓ Clean completed. Run with -Install to reinstall." Green
}

function Show-Help {
    Write-ColorOutput "ESP32 Web Development UI Manager" Cyan
    Write-ColorOutput "===============================" Gray
    Write-ColorOutput ""
    Write-ColorOutput "Usage:" Yellow
    Write-ColorOutput "  .\web_ui_launcher.ps1 [options]" White
    Write-ColorOutput ""
    Write-ColorOutput "Options:" Yellow
    Write-ColorOutput "  -Install    Install Node.js dependencies" White
    Write-ColorOutput "  -Start      Start the web development server" White
    Write-ColorOutput "  -Stop       Stop the web development server" White
    Write-ColorOutput "  -Status     Show current status" White
    Write-ColorOutput "  -Clean      Clean installation (remove node_modules)" White
    Write-ColorOutput "  -Port       Specify port number (default: 3000)" White
    Write-ColorOutput ""
    Write-ColorOutput "Examples:" Yellow
    Write-ColorOutput "  .\web_ui_launcher.ps1 -Install" Gray
    Write-ColorOutput "  .\web_ui_launcher.ps1 -Start" Gray
    Write-ColorOutput "  .\web_ui_launcher.ps1 -Start -Port 8080" Gray
    Write-ColorOutput "  .\web_ui_launcher.ps1 -Status" Gray
    Write-ColorOutput ""
    Write-ColorOutput "Features:" Yellow
    Write-ColorOutput "  • Real-time build monitoring and control" White
    Write-ColorOutput "  • AI-powered error analysis and suggestions" White
    Write-ColorOutput "  • Interactive chat with AI assistant" White
    Write-ColorOutput "  • Automated code optimization recommendations" White
    Write-ColorOutput "  • Smart project analysis and insights" White
    Write-ColorOutput ""
    Write-ColorOutput "AI Setup:" Yellow
    Write-ColorOutput "  1. Get API key from OpenAI (https://platform.openai.com/)" White
    Write-ColorOutput "  2. Or get API key from Anthropic (https://console.anthropic.com/)" White
    Write-ColorOutput "  3. Configure in web UI under 'AI Config'" White
    Write-ColorOutput ""
    Write-ColorOutput "Quick Start:" Yellow
    Write-ColorOutput "  1. .\web_ui_launcher.ps1 -Install" White
    Write-ColorOutput "  2. .\web_ui_launcher.ps1 -Start" White
    Write-ColorOutput "  3. Open http://localhost:3000 in browser" White
    Write-ColorOutput "  4. Configure AI in 'AI Config' panel" White
}

# Main execution logic
try {
    Write-ColorOutput "ESP32 Web Development UI Manager" Cyan
    Write-ColorOutput "===============================" Gray
    Write-ColorOutput ""
    
    if (-not $Install -and -not $Start -and -not $Stop -and -not $Status -and -not $Clean) {
        Show-Help
        return
    }
    
    if ($Clean) {
        Clean-Installation
        return
    }
    
    if ($Status) {
        Get-ServerStatus
        return
    }
    
    if ($Stop) {
        Stop-WebServer
        return
    }
    
    if ($Install) {
        if (-not (Test-NodeInstalled)) {
            return
        }
        
        if (Install-Dependencies) {
            Write-ColorOutput ""
            Write-ColorOutput "✓ Installation completed successfully!" Green
            Write-ColorOutput "Run '.\web_ui_launcher.ps1 -Start' to start the server" Cyan
        }
        return
    }
    
    if ($Start) {
        if (-not (Test-NodeInstalled)) {
            return
        }
        
        # Check if dependencies are installed
        $nodeModules = Join-Path $webUIDir "node_modules"
        if (-not (Test-Path $nodeModules)) {
            Write-ColorOutput "Dependencies not installed. Installing now..." Yellow
            if (-not (Install-Dependencies)) {
                return
            }
            Write-ColorOutput ""
        }
        
        Start-WebServer -Port $Port
    }
}
catch {
    Write-ColorOutput "Error: $_" Red
    exit 1
}
