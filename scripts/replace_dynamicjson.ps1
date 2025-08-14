# Replace DynamicJsonDocument with JsonDocument across the repo (word-boundary match)
Get-ChildItem -Path ".." -Recurse -Include *.cpp,*.h | ForEach-Object {
    $file = $_.FullName
    (Get-Content $file) -replace '\bDynamicJsonDocument\b', 'JsonDocument' | Set-Content $file
    Write-Host "Updated: $file"
}
Write-Host "Done."
