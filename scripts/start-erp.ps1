# Bin Al-Ajouz ERP - start unified server (port 3000)
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host ""
Write-Host "=== Bin Al-Ajouz ERP - Starting Unified Server ===" -ForegroundColor Cyan

$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
if (-not $pg) {
    Write-Host "Warning: PostgreSQL service may not be running." -ForegroundColor Yellow
}

Write-Host "Starting Unified Node Server (Port 3000)..." -ForegroundColor Yellow

$backendCmd = "Set-Location '$Root\backend'; node src/index.js"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Minimized

Write-Host ""
Write-Host "OK - Unified Server Started!" -ForegroundColor Green
Write-Host "  System URL: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Stop: scripts\stop-erp.ps1"
