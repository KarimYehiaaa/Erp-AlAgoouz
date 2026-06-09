# Bin Al-Ajouz ERP - start servers (keeps running after Cursor closes)
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host ""
Write-Host "=== Bin Al-Ajouz ERP - Starting ===" -ForegroundColor Cyan

$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
if (-not $pg) {
    Write-Host "Warning: PostgreSQL service may not be running." -ForegroundColor Yellow
}

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    Write-Host "Starting with PM2..." -ForegroundColor Green
    pm2 delete bin-al-ajouz-api 2>$null
    pm2 delete bin-al-ajouz-web 2>$null
    pm2 start ecosystem.config.cjs
    pm2 save 2>$null
    Write-Host ""
    Write-Host "OK - running in background:" -ForegroundColor Green
    Write-Host "  API: http://localhost:3000"
    Write-Host "  Web: http://localhost:5173"
    Write-Host ""
    Write-Host "Commands: pm2 status | pm2 logs | pm2 stop all"
    Write-Host "Auto on Windows boot (once, as Admin): pm2 startup"
    exit 0
}

Write-Host "Starting in separate windows (no PM2)..." -ForegroundColor Yellow

$backendCmd = "Set-Location '$Root\backend'; npm run dev"
$frontendCmd = "Set-Location '$Root\frontend'; npm run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Minimized
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Minimized

Write-Host ""
Write-Host "OK - minimized windows opened" -ForegroundColor Green
Write-Host "  API: http://localhost:3000"
Write-Host "  Web: http://localhost:5173"
Write-Host ""
Write-Host "Stop: scripts\stop-erp.ps1"
Write-Host "Better: npm install -g pm2 then run this script again"
