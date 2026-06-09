# Stop Bin Al-Ajouz ERP servers
Write-Host "إيقاف السيرفرات..." -ForegroundColor Yellow

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    pm2 stop bin-al-ajouz-api 2>$null
    pm2 stop bin-al-ajouz-web 2>$null
    pm2 delete bin-al-ajouz-api 2>$null
    pm2 delete bin-al-ajouz-web 2>$null
    Write-Host "تم إيقاف PM2" -ForegroundColor Green
}

Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*bin-al-ajouz-erp*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "تم الإيقاف" -ForegroundColor Green
