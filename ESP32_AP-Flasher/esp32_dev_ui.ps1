#!/usr/bin/env pwsh
# ========================================================================
# ESP32 Development UI - WPF GUI for OutdoorAP Project
# Interactive development interface for build, flash, and monitor tasks
# ========================================================================

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

# XAML for the main window
$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="ESP32 OutdoorAP Development UI" Height="700" Width="900"
        WindowStartupLocation="CenterScreen" ResizeMode="CanResize">
    <Window.Resources>
        <Style TargetType="Button">
            <Setter Property="Margin" Value="5"/>
            <Setter Property="Padding" Value="10,5"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="Background" Value="#FF2D2D30"/>
            <Setter Property="Foreground" Value="White"/>
            <Setter Property="BorderBrush" Value="#FF3E3E42"/>
            <Setter Property="BorderThickness" Value="1"/>
        </Style>
        <Style TargetType="TextBox">
            <Setter Property="Margin" Value="5"/>
            <Setter Property="Padding" Value="5"/>
            <Setter Property="Background" Value="#FF1E1E1E"/>
            <Setter Property="Foreground" Value="White"/>
            <Setter Property="BorderBrush" Value="#FF3E3E42"/>
        </Style>
        <Style TargetType="ComboBox">
            <Setter Property="Margin" Value="5"/>
            <Setter Property="Padding" Value="5"/>
            <Setter Property="Background" Value="#FF1E1E1E"/>
            <Setter Property="Foreground" Value="White"/>
        </Style>
        <Style TargetType="CheckBox">
            <Setter Property="Margin" Value="5"/>
            <Setter Property="Foreground" Value="White"/>
        </Style>
        <Style TargetType="Label">
            <Setter Property="Foreground" Value="White"/>
            <Setter Property="Margin" Value="5,2"/>
        </Style>
        <Style TargetType="GroupBox">
            <Setter Property="Foreground" Value="White"/>
            <Setter Property="Margin" Value="5"/>
            <Setter Property="Padding" Value="5"/>
            <Setter Property="BorderBrush" Value="#FF3E3E42"/>
        </Style>
    </Window.Resources>
    
    <Grid Background="#FF252526">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="200"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        
        <!-- Header -->
        <Border Grid.Row="0" Background="#FF007ACC" Padding="10">
            <StackPanel Orientation="Horizontal">
                <TextBlock Text="🚀" FontSize="20" VerticalAlignment="Center" Margin="0,0,10,0"/>
                <TextBlock Text="ESP32 OutdoorAP Development UI" FontSize="16" FontWeight="Bold" 
                          Foreground="White" VerticalAlignment="Center"/>
                <TextBlock Name="StatusText" Text="Ready" FontSize="12" Foreground="LightGray" 
                          VerticalAlignment="Center" Margin="20,0,0,0"/>
            </StackPanel>
        </Border>
        
        <!-- Main Content -->
        <Grid Grid.Row="1" Margin="10">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="350"/>
                <ColumnDefinition Width="*"/>
            </Grid.ColumnDefinitions>
            
            <!-- Left Panel - Configuration -->
            <StackPanel Grid.Column="0">
                <GroupBox Header="Build Configuration">
                    <StackPanel>
                        <Label Content="Environment:"/>
                        <ComboBox Name="EnvironmentCombo" SelectedIndex="0">
                            <ComboBoxItem Content="OutdoorAP"/>
                            <ComboBoxItem Content="IndoorAP"/>
                            <ComboBoxItem Content="Debug"/>
                        </ComboBox>
                        
                        <Label Content="COM Port:"/>
                        <ComboBox Name="ComPortCombo" IsEditable="True" Text="COM10"/>
                        
                        <Label Content="Baud Rate:"/>
                        <ComboBox Name="BaudRateCombo" SelectedIndex="2">
                            <ComboBoxItem Content="115200"/>
                            <ComboBoxItem Content="460800"/>
                            <ComboBoxItem Content="921600"/>
                            <ComboBoxItem Content="1500000"/>
                        </ComboBox>
                        
                        <Label Content="Parallel Jobs:"/>
                        <ComboBox Name="JobsCombo" SelectedIndex="0">
                            <ComboBoxItem Content="Auto"/>
                            <ComboBoxItem Content="4"/>
                            <ComboBoxItem Content="8"/>
                            <ComboBoxItem Content="12"/>
                            <ComboBoxItem Content="16"/>
                            <ComboBoxItem Content="24"/>
                        </ComboBox>
                    </StackPanel>
                </GroupBox>
                
                <GroupBox Header="Build Options">
                    <StackPanel>
                        <CheckBox Name="FastBuildCheck" Content="Fast Build (Caching)" IsChecked="True"/>
                        <CheckBox Name="CleanBuildCheck" Content="Clean Build"/>
                        <CheckBox Name="VerboseCheck" Content="Verbose Output"/>
                        <CheckBox Name="SkipWebCheck" Content="Skip Web Compression"/>
                        <CheckBox Name="FilesystemOnlyCheck" Content="Filesystem Only"/>
                    </StackPanel>
                </GroupBox>
                
                <GroupBox Header="Upload Options">
                    <StackPanel>
                        <CheckBox Name="SkipUploadCheck" Content="Skip Upload"/>
                        <CheckBox Name="MonitorCheck" Content="Start Monitor After Upload"/>
                        <CheckBox Name="EraseFlashCheck" Content="Erase Flash Before Upload"/>
                    </StackPanel>
                </GroupBox>
            </StackPanel>
            
            <!-- Right Panel - Quick Actions -->
            <StackPanel Grid.Column="1" Margin="10,0,0,0">
                <GroupBox Header="Quick Actions">
                    <Grid>
                        <Grid.ColumnDefinitions>
                            <ColumnDefinition Width="*"/>
                            <ColumnDefinition Width="*"/>
                        </Grid.ColumnDefinitions>
                        <Grid.RowDefinitions>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                        </Grid.RowDefinitions>
                        
                        <Button Name="BuildButton" Content="🔨 Build Only" Grid.Row="0" Grid.Column="0"/>
                        <Button Name="UploadButton" Content="📤 Upload Only" Grid.Row="0" Grid.Column="1"/>
                        <Button Name="BuildUploadButton" Content="🚀 Build + Upload" Grid.Row="1" Grid.Column="0" Grid.ColumnSpan="2" Background="#FF0E7A0D"/>
                        <Button Name="FastBuildButton" Content="⚡ Turbo Build" Grid.Row="2" Grid.Column="0"/>
                        <Button Name="MonitorButton" Content="📺 Monitor" Grid.Row="2" Grid.Column="1"/>
                        <Button Name="CleanButton" Content="🧹 Clean" Grid.Row="3" Grid.Column="0"/>
                        <Button Name="RefreshPortsButton" Content="🔄 Refresh Ports" Grid.Row="3" Grid.Column="1"/>
                        <Button Name="OpenFolderButton" Content="📁 Open Build Folder" Grid.Row="4" Grid.Column="0"/>
                        <Button Name="OpenWebButton" Content="🌐 Open Web UI" Grid.Row="4" Grid.Column="1"/>
                    </Grid>
                </GroupBox>
                
                <GroupBox Header="Project Tools">
                    <Grid>
                        <Grid.ColumnDefinitions>
                            <ColumnDefinition Width="*"/>
                            <ColumnDefinition Width="*"/>
                        </Grid.ColumnDefinitions>
                        <Grid.RowDefinitions>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="Auto"/>
                        </Grid.RowDefinitions>
                        
                        <Button Name="ConfigWifiButton" Content="📶 Configure WiFi" Grid.Row="0" Grid.Column="0"/>
                        <Button Name="ConfigNewtonButton" Content="⚙️ Configure Newton M3" Grid.Row="0" Grid.Column="1"/>
                        <Button Name="ValidateConfigButton" Content="✅ Validate Config" Grid.Row="1" Grid.Column="0"/>
                        <Button Name="TestEndpointsButton" Content="🧪 Test API" Grid.Row="1" Grid.Column="1"/>
                        <Button Name="SimulatorButton" Content="🎮 Start Simulator" Grid.Row="2" Grid.Column="0"/>
                        <Button Name="DebugButton" Content="🐛 Debug Mode" Grid.Row="2" Grid.Column="1"/>
                    </Grid>
                </GroupBox>
                
                <GroupBox Header="Device Info">
                    <StackPanel>
                        <TextBlock Name="DeviceInfoText" Text="Device: Not Connected" Foreground="LightGray"/>
                        <TextBlock Name="FirmwareInfoText" Text="Firmware: Unknown" Foreground="LightGray"/>
                        <TextBlock Name="BuildInfoText" Text="Last Build: Never" Foreground="LightGray"/>
                    </StackPanel>
                </GroupBox>
            </StackPanel>
        </Grid>
        
        <!-- Output Console -->
        <GroupBox Grid.Row="2" Header="Console Output" Margin="10">
            <Grid>
                <Grid.RowDefinitions>
                    <RowDefinition Height="*"/>
                    <RowDefinition Height="Auto"/>
                </Grid.RowDefinitions>
                
                <ScrollViewer Grid.Row="0" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Auto">
                    <TextBlock Name="OutputText" Background="#FF1E1E1E" Foreground="LightGreen" 
                              FontFamily="Consolas" FontSize="10" Margin="5" Padding="5"
                              Text="ESP32 Development UI Ready...&#x0A;Select configuration and click an action to begin."/>
                </ScrollViewer>
                
                <StackPanel Grid.Row="1" Orientation="Horizontal" HorizontalAlignment="Right">
                    <Button Name="ClearOutputButton" Content="Clear" Width="60" Height="25"/>
                    <Button Name="SaveLogButton" Content="Save Log" Width="70" Height="25"/>
                </StackPanel>
            </Grid>
        </GroupBox>
        
        <!-- Status Bar -->
        <Border Grid.Row="3" Background="#FF007ACC" Padding="5">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                
                <TextBlock Name="StatusBarText" Text="Ready" Foreground="White" VerticalAlignment="Center"/>
                <TextBlock Grid.Column="1" Name="ProgressText" Text="" Foreground="White" VerticalAlignment="Center" Margin="10,0"/>
                <ProgressBar Grid.Column="2" Name="ProgressBar" Width="150" Height="15" VerticalAlignment="Center" 
                            Background="#FF1E1E1E" Foreground="#FF0E7A0D" Visibility="Hidden"/>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

# Load XAML
try {
    $window = [Windows.Markup.XamlReader]::Parse($xaml)
} catch {
    Write-Error "Failed to load XAML: $_"
    exit 1
}

# Get controls
$controls = @{}
$window | Out-Null
$controls.EnvironmentCombo = $window.FindName("EnvironmentCombo")
$controls.ComPortCombo = $window.FindName("ComPortCombo")
$controls.BaudRateCombo = $window.FindName("BaudRateCombo")
$controls.JobsCombo = $window.FindName("JobsCombo")
$controls.FastBuildCheck = $window.FindName("FastBuildCheck")
$controls.CleanBuildCheck = $window.FindName("CleanBuildCheck")
$controls.VerboseCheck = $window.FindName("VerboseCheck")
$controls.SkipWebCheck = $window.FindName("SkipWebCheck")
$controls.FilesystemOnlyCheck = $window.FindName("FilesystemOnlyCheck")
$controls.SkipUploadCheck = $window.FindName("SkipUploadCheck")
$controls.MonitorCheck = $window.FindName("MonitorCheck")
$controls.EraseFlashCheck = $window.FindName("EraseFlashCheck")
$controls.OutputText = $window.FindName("OutputText")
$controls.StatusText = $window.FindName("StatusText")
$controls.StatusBarText = $window.FindName("StatusBarText")
$controls.ProgressText = $window.FindName("ProgressText")
$controls.ProgressBar = $window.FindName("ProgressBar")
$controls.DeviceInfoText = $window.FindName("DeviceInfoText")
$controls.FirmwareInfoText = $window.FindName("FirmwareInfoText")
$controls.BuildInfoText = $window.FindName("BuildInfoText")

# Buttons
$buttons = @{}
$buttons.BuildButton = $window.FindName("BuildButton")
$buttons.UploadButton = $window.FindName("UploadButton")
$buttons.BuildUploadButton = $window.FindName("BuildUploadButton")
$buttons.FastBuildButton = $window.FindName("FastBuildButton")
$buttons.MonitorButton = $window.FindName("MonitorButton")
$buttons.CleanButton = $window.FindName("CleanButton")
$buttons.RefreshPortsButton = $window.FindName("RefreshPortsButton")
$buttons.OpenFolderButton = $window.FindName("OpenFolderButton")
$buttons.OpenWebButton = $window.FindName("OpenWebButton")
$buttons.ConfigWifiButton = $window.FindName("ConfigWifiButton")
$buttons.ConfigNewtonButton = $window.FindName("ConfigNewtonButton")
$buttons.ValidateConfigButton = $window.FindName("ValidateConfigButton")
$buttons.TestEndpointsButton = $window.FindName("TestEndpointsButton")
$buttons.SimulatorButton = $window.FindName("SimulatorButton")
$buttons.DebugButton = $window.FindName("DebugButton")
$buttons.ClearOutputButton = $window.FindName("ClearOutputButton")
$buttons.SaveLogButton = $window.FindName("SaveLogButton")

# Global variables
$script:isRunning = $false
$script:currentProcess = $null

# Helper functions
function Write-Output {
    param([string]$Message, [string]$Color = "LightGreen")
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    $formattedMessage = "[$timestamp] $Message"
    
    $window.Dispatcher.Invoke([Action]{
        $controls.OutputText.Text += "$formattedMessage`n"
        
        # Auto-scroll to bottom
        $scrollViewer = $controls.OutputText.Parent
        if ($scrollViewer -is [System.Windows.Controls.ScrollViewer]) {
            $scrollViewer.ScrollToEnd()
        }
    })
}

function Set-Status {
    param([string]$Status, [string]$Progress = "")
    
    $window.Dispatcher.Invoke([Action]{
        $controls.StatusText.Text = $Status
        $controls.StatusBarText.Text = $Status
        $controls.ProgressText.Text = $Progress
        
        if ($Progress) {
            $controls.ProgressBar.Visibility = "Visible"
        } else {
            $controls.ProgressBar.Visibility = "Hidden"
        }
    })
}

function Enable-UI {
    param([bool]$Enabled)
    
    $window.Dispatcher.Invoke([Action]{
        foreach ($button in $buttons.Values) {
            $button.IsEnabled = $Enabled
        }
        $script:isRunning = -not $Enabled
    })
}

function Get-ComPorts {
    try {
        $ports = Get-WmiObject -Class Win32_PnPEntity | Where-Object { $_.Caption -match "COM\d+" } | 
            ForEach-Object { 
                if ($_.Caption -match "(COM\d+)") { $Matches[1] }
            } | Sort-Object
        return $ports
    } catch {
        return @("COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "COM10")
    }
}

function Refresh-ComPorts {
    $ports = Get-ComPorts
    $controls.ComPortCombo.Items.Clear()
    foreach ($port in $ports) {
        $controls.ComPortCombo.Items.Add($port) | Out-Null
    }
    if ($ports.Count -gt 0) {
        $controls.ComPortCombo.SelectedIndex = 0
    }
}

function Build-CommandArgs {
    $args = @()
    
    $environment = $controls.EnvironmentCombo.SelectedItem.Content
    $comPort = $controls.ComPortCombo.Text
    $baudRate = $controls.BaudRateCombo.SelectedItem.Content
    $jobs = $controls.JobsCombo.SelectedItem.Content
    
    $args += "-Environment", $environment
    $args += "-ComPort", $comPort
    $args += "-BaudRate", $baudRate
    
    if ($jobs -ne "Auto") {
        $args += "-Jobs", $jobs
    }
    
    if ($controls.FastBuildCheck.IsChecked) { $args += "-FastBuild" }
    if ($controls.CleanBuildCheck.IsChecked) { $args += "-Clean" }
    if ($controls.VerboseCheck.IsChecked) { $args += "-Verbose" }
    if ($controls.FilesystemOnlyCheck.IsChecked) { $args += "-FilesystemOnly" }
    if ($controls.SkipUploadCheck.IsChecked) { $args += "-SkipUpload" }
    if ($controls.MonitorCheck.IsChecked) { $args += "-Monitor" }
    
    return $args
}

function Start-Process {
    param([string]$ScriptPath, [array]$Arguments = @())
    
    if ($script:isRunning) {
        Write-Output "Process already running!" "Yellow"
        return
    }
    
    Enable-UI $false
    Set-Status "Running..." "Processing"
    
    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = "pwsh.exe"
        $startInfo.Arguments = "-File `"$ScriptPath`" " + ($Arguments -join " ")
        $startInfo.WorkingDirectory = (Get-Location).Path
        $startInfo.UseShellExecute = $false
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.CreateNoWindow = $true
        
        $script:currentProcess = [System.Diagnostics.Process]::Start($startInfo)
        
        # Create background job to read output
        $job = Start-Job -ScriptBlock {
            param($process)
            
            while (-not $process.HasExited) {
                $output = $process.StandardOutput.ReadLine()
                if ($output) {
                    return @{ Type = "Output"; Message = $output }
                }
                
                $error = $process.StandardError.ReadLine()
                if ($error) {
                    return @{ Type = "Error"; Message = $error }
                }
                
                Start-Sleep -Milliseconds 100
            }
        } -ArgumentList $script:currentProcess
        
        # Monitor the job
        while ($job.State -eq "Running" -and -not $script:currentProcess.HasExited) {
            $result = Receive-Job $job -ErrorAction SilentlyContinue
            if ($result) {
                if ($result.Type -eq "Error") {
                    Write-Output $result.Message "Red"
                } else {
                    Write-Output $result.Message
                }
            }
            Start-Sleep -Milliseconds 200
        }
        
        $job | Remove-Job -Force -ErrorAction SilentlyContinue
        
        $exitCode = $script:currentProcess.ExitCode
        if ($exitCode -eq 0) {
            Write-Output "Process completed successfully!" "LightGreen"
            Set-Status "Ready" ""
        } else {
            Write-Output "Process failed with exit code: $exitCode" "Red"
            Set-Status "Error" ""
        }
        
    } catch {
        Write-Output "Error starting process: $_" "Red"
        Set-Status "Error" ""
    } finally {
        Enable-UI $true
        $script:currentProcess = $null
    }
}

# Event handlers
$buttons.BuildButton.Add_Click({
    $args = Build-CommandArgs
    $args += "-SkipUpload"
    Start-Process ".\compile.ps1" $args
})

$buttons.UploadButton.Add_Click({
    $args = Build-CommandArgs
    $args += "-SkipBuild"
    Start-Process ".\compile.ps1" $args
})

$buttons.BuildUploadButton.Add_Click({
    $args = Build-CommandArgs
    Start-Process ".\compile.ps1" $args
})

$buttons.FastBuildButton.Add_Click({
    $args = Build-CommandArgs
    Start-Process ".\fast_compile.ps1" $args
})

$buttons.MonitorButton.Add_Click({
    $comPort = $controls.ComPortCombo.Text
    Write-Output "Starting monitor on $comPort..."
    Start-Process "pwsh.exe" @("-Command", "pio device monitor --port $comPort --baud 115200")
})

$buttons.CleanButton.Add_Click({
    Set-Status "Cleaning..." "Removing build files"
    Write-Output "Cleaning build directories..."
    
    try {
        Remove-Item -Recurse -Force ".pio" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force "OutdoorAP" -ErrorAction SilentlyContinue
        Write-Output "Clean completed successfully!"
        Set-Status "Ready" ""
    } catch {
        Write-Output "Clean failed: $_" "Red"
        Set-Status "Error" ""
    }
})

$buttons.RefreshPortsButton.Add_Click({
    Write-Output "Refreshing COM ports..."
    Refresh-ComPorts
    Write-Output "COM ports refreshed."
})

$buttons.OpenFolderButton.Add_Click({
    $environment = $controls.EnvironmentCombo.SelectedItem.Content
    if (Test-Path $environment) {
        Start-Process "explorer.exe" $environment
    } else {
        Write-Output "Build folder not found. Build the project first." "Yellow"
    }
})

$buttons.OpenWebButton.Add_Click({
    Write-Output "Opening ESP32 Web UI..."
    Start-Process "http://192.168.4.1"
})

$buttons.ConfigWifiButton.Add_Click({
    if (Test-Path ".\configure_wifi.ps1") {
        Start-Process ".\configure_wifi.ps1" @()
    } else {
        Write-Output "configure_wifi.ps1 not found!" "Red"
    }
})

$buttons.ConfigNewtonButton.Add_Click({
    if (Test-Path ".\configure_newton_m3.ps1") {
        Start-Process ".\configure_newton_m3.ps1" @()
    } else {
        Write-Output "configure_newton_m3.ps1 not found!" "Red"
    }
})

$buttons.ValidateConfigButton.Add_Click({
    if (Test-Path ".\validate_config.py") {
        Start-Process "python" @(".\validate_config.py")
    } else {
        Write-Output "validate_config.py not found!" "Red"
    }
})

$buttons.TestEndpointsButton.Add_Click({
    if (Test-Path ".\test_api_endpoints.ps1") {
        Start-Process ".\test_api_endpoints.ps1" @()
    } else {
        Write-Output "test_api_endpoints.ps1 not found!" "Red"
    }
})

$buttons.SimulatorButton.Add_Click({
    Write-Output "Starting Wokwi Simulator..."
    Start-Process "pio" @("run", "--target", "exec", "--environment", "simulation")
})

$buttons.DebugButton.Add_Click({
    Write-Output "Starting debug session..."
    $args = Build-CommandArgs
    $args += "-Verbose", "-Monitor"
    Start-Process ".\compile.ps1" $args
})

$buttons.ClearOutputButton.Add_Click({
    $controls.OutputText.Text = "Console cleared.`n"
})

$buttons.SaveLogButton.Add_Click({
    $saveDialog = New-Object System.Windows.Forms.SaveFileDialog
    $saveDialog.Filter = "Log files (*.log)|*.log|Text files (*.txt)|*.txt"
    $saveDialog.FileName = "esp32_build_log_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
    
    if ($saveDialog.ShowDialog() -eq "OK") {
        $controls.OutputText.Text | Out-File -FilePath $saveDialog.FileName -Encoding UTF8
        Write-Output "Log saved to: $($saveDialog.FileName)"
    }
})

# Initialize UI
Refresh-ComPorts
Write-Output "ESP32 Development UI Initialized"
Write-Output "Project: OutdoorAP ESP32-S3 Development Environment"
Write-Output "Ready for build and flash operations."

# Update device info
$controls.DeviceInfoText.Text = "Device: ESP32-S3 DevKit C-1"
$controls.FirmwareInfoText.Text = "Firmware: OutdoorAP v2.0+"
$controls.BuildInfoText.Text = "Last Build: $(if (Test-Path '.pio') { (Get-Item '.pio').LastWriteTime.ToString('yyyy-MM-dd HH:mm') } else { 'Never' })"

# Show window
Set-Status "Ready" ""
$window.ShowDialog() | Out-Null
