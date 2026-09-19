# Bin Al-Ajouz ERP - start unified server (port 3000)
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host ""
Write-Host "=== Bin Al-Ajouz ERP - Starting Unified Server (Port 3000) ===" -ForegroundColor Cyan

# 1. Check if server is already running
$isRunning = $false
try {
    $check = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction Stop
    if ($check.success -eq $true) {
        $isRunning = $true
    }
} catch {
    $isRunning = $false
}

if ($isRunning) {
    Write-Host "Server is already running and connected to database!" -ForegroundColor Green
    Write-Host "Opening system in default browser: http://localhost:3000" -ForegroundColor Cyan
    Start-Process "http://localhost:3000"
    exit 0
}

# 2. Check local PostgreSQL
$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
if (-not $pg) {
    Write-Host "Note: Local PostgreSQL is not running (system may connect to remote/Supabase)." -ForegroundColor Gray
}

Write-Host "Starting Unified Server and connecting to database..." -ForegroundColor Yellow

$backendDir = Join-Path $Root "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start" -WorkingDirectory $backendDir -WindowStyle Minimized

# 3. Poll /api/health until ready
$ready = $false
for ($i = 1; $i -le 35; $i++) {
    Start-Sleep -Seconds 1
    Write-Host -NoNewline "." -ForegroundColor Yellow
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction Stop
        if ($res.success -eq $true) {
            $ready = $true
            break
        }
    } catch {
        # still starting
    }
}
Write-Host ""

if ($ready) {
    Write-Host ""
    Write-Host "OK - Unified Server is READY and connected!" -ForegroundColor Green
    Write-Host "Opening system: http://localhost:3000" -ForegroundColor Cyan
    Start-Process "http://localhost:3000"
    Write-Host "To stop server: scripts\stop-erp.ps1" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "Error: Server did not respond within 35 seconds." -ForegroundColor Red
    Write-Host "Please check the minimized PowerShell window or backend/.env" -ForegroundColor Yellow
}