$files = @("logs.html", "tag_control_panel.html", "flasher.html", "nrf52_swd.html", "c6_module.html", "updates.html", "navigation.html")

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        if ($content -notmatch "universal-menu\.js") {
            $content = $content -replace '(\s*<script src="main\.js[^"]*"[^>]*></script>)', '$1' + "`r`n`t<script src=`"universal-menu.js`" defer></script>"
            Set-Content $file $content -NoNewline
            Write-Host "Added universal-menu.js to $file"
        } else {
            Write-Host "$file already has universal-menu.js"
        }
    }
}
