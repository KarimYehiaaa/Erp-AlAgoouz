# Stop Bin Al-Ajouz ERP servers
Write-Host "Stopping servers..." -ForegroundColor Yellow

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    pm2 stop bin-al-ajouz-api 2>$null
    pm2 stop bin-al-ajouz-web 2>$null
    pm2 delete bin-al-ajouz-api 2>$null
    pm2 delete bin-al-ajouz-web 2>$null
    Write-Host "PM2 stopped" -ForegroundColor Green
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -like "*src/index.ts*" -or $_.CommandLine -like "*src/index.js*" -or $_.CommandLine -like "*vite*" -or $_.CommandLine -like "*AlAgoouz*"
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host "ERP Stopped Successfully" -ForegroundColor Green
