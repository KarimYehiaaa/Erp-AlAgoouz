# Bin Al-Ajouz ERP - start servers (keeps running after Cursor closes)
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host ""
Write-Host "=== Bin Al-Ajouz ERP - Starting ===" -ForegroundColor Cyan

$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
if (-not $pg) {
    Write-Host "Warning: PostgreSQL service may not be running." -ForegroundColor Yellow
}

# Bypass PM2 to launch directly in separate windows for maximum local reliability
# (PM2 has session/permissions conflicts on this system)

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
