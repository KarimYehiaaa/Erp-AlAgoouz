# ================================================================================
#  Bin Al-Ajouz ERP - Unified Control and Operations Script (Port 3000)
# ================================================================================
#  Interactive Usage:
#    .\system.ps1
#  Direct CLI Usage:
#    .\system.ps1 start     - Start system and open in browser
#    .\system.ps1 stop      - Stop system and release all ports
#    .\system.ps1 restart   - Clean restart of the system
#    .\system.ps1 status    - Check server and database health
#    .\system.ps1 dev       - Start development mode (live reload)
#    .\system.ps1 backup    - Create instant database backup
#    .\system.ps1 migrate   - Run database migrations and schema check
# ================================================================================

param(
    [string]$Action
)

$Root = $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }
Set-Location $Root

function Start-SystemServer {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [START] Checking and starting Bin Al-Ajouz ERP (Port 3000)..." -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    # 1. Check if server is already running and healthy
    try {
        $check = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction Stop
        if ($check.success -eq $true -or $check.status -eq "ok") {
            Write-Host "[OK] Server is already running and connected to database!" -ForegroundColor Green
            Write-Host "[WEB] Opening browser: http://localhost:3000" -ForegroundColor Cyan
            Start-Process "http://localhost:3000"
            return
        }
    } catch {}

    # 2. Release port 3000 and 5173 if occupied by stale process
    Write-Host "[1/3] Checking and clearing ports 3000 and 5173..." -ForegroundColor Yellow
    $ports = @(3000, 5173)
    foreach ($port in $ports) {
        $pids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
        if ($pids) {
            foreach ($p in $pids) {
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                Write-Host "   - Released port $port (PID: $p)" -ForegroundColor Gray
            }
        }
    }

    # 3. Launch Unified Server in background
    Write-Host "[2/3] Launching Unified Server (npm start)..." -ForegroundColor Cyan
    $backendDir = Join-Path $Root "backend"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; Write-Host '[RUNNING] Bin Al-Ajouz ERP Server on Port 3000...' -ForegroundColor Cyan; npm start" -WorkingDirectory $backendDir -WindowStyle Minimized

    # 4. Poll /api/health until ready (up to 35 seconds)
    Write-Host "[3/3] Waiting for server health and database connection... " -NoNewline -ForegroundColor Yellow
    $ready = $false
    for ($i = 1; $i -le 35; $i++) {
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline -ForegroundColor Yellow
        try {
            $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction Stop
            if ($res.success -eq $true -or $res.status -eq "ok") {
                $ready = $true
                break
            }
        } catch {}
    }
    Write-Host ""

    if ($ready) {
        Write-Host ""
        Write-Host "================================================================================" -ForegroundColor Green
        Write-Host " [SUCCESS] System started successfully and database is connected!" -ForegroundColor Green
        Write-Host " [WEB] Opening system in browser: http://localhost:3000" -ForegroundColor Cyan
        Write-Host "================================================================================" -ForegroundColor Green
        Start-Process "http://localhost:3000"
    } else {
        Write-Host ""
        Write-Host "[WARNING] Server took longer than expected to respond." -ForegroundColor Yellow
        Write-Host "Please check the minimized PowerShell window or backend/.env configuration." -ForegroundColor Gray
    }
}

function Stop-SystemServer {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Yellow
    Write-Host " [STOP] Stopping Bin Al-Ajouz ERP system completely..." -ForegroundColor Yellow
    Write-Host "================================================================================" -ForegroundColor Yellow
    Write-Host ""

    # 1. Stop PM2 processes if present
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2) {
        pm2 stop bin-al-ajouz-erp 2>$null | Out-Null
        pm2 delete bin-al-ajouz-erp 2>$null | Out-Null
        Write-Host "   - Stopped PM2 processes." -ForegroundColor Gray
    }

    # 2. Release ports 3000 and 5173
    Write-Host "Releasing listening ports 3000 and 5173..." -ForegroundColor Yellow
    $ports = @(3000, 5173)
    foreach ($port in $ports) {
        $pids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
        if ($pids) {
            foreach ($p in $pids) {
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                Write-Host "   - Terminated PID $p on port $port" -ForegroundColor Gray
            }
        }
    }

    # 3. Clean up node processes matching project path
    Write-Host "Terminating lingering node.exe processes for ERP..." -ForegroundColor Yellow
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*AlAgoouz*" -or $_.CommandLine -like "*src/index.ts*" -or $_.CommandLine -like "*vite*" -or $_.CommandLine -like "*bin-al-ajouz*"
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 1
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] System stopped completely and all ports have been released!" -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Green
}

function Restart-SystemServer {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [RESTART] Restarting Bin Al-Ajouz ERP..." -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "[1/2] Stopping active processes..." -ForegroundColor Yellow
    Stop-SystemServer

    Start-Sleep -Seconds 2

    Write-Host ""
    Write-Host "[2/2] Booting Unified Server again..." -ForegroundColor Cyan
    Start-SystemServer
}

function Check-SystemStatus {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [STATUS] Bin Al-Ajouz ERP Status and Database Health Report" -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "1. Port 3000 Check:" -ForegroundColor White
    $p3000 = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
    if ($p3000) {
        Write-Host "   [ONLINE] Port 3000 is ACTIVE and LISTENING (PID: $($p3000[0].OwningProcess))" -ForegroundColor Green
    } else {
        Write-Host "   [OFFLINE] Port 3000 is CLOSED (Server is not running)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "2. API Health Check (http://localhost:3000/api/health):" -ForegroundColor White
    try {
        $h = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "   [ONLINE] Server Status: ONLINE and HEALTHY (OK)" -ForegroundColor Green
        if ($h.database) {
            Write-Host "   [DB] Database Status: $($h.database.status)" -ForegroundColor Green
            if ($h.database.latencyMs) {
                Write-Host "   [PING] Response Latency: $($h.database.latencyMs) ms" -ForegroundColor Gray
            }
        }
        if ($h.uptime) {
            Write-Host "   [UPTIME] Server Uptime: $([math]::Round($h.uptime / 60, 1)) minutes" -ForegroundColor Gray
        }
    } catch {
        Write-Host "   [OFFLINE] No response from http://localhost:3000/api/health" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "3. Local PostgreSQL Service Check:" -ForegroundColor White
    $pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
    if ($pg) {
        Write-Host "   [RUNNING] Local PostgreSQL Service: $($pg.DisplayName)" -ForegroundColor Green
    } else {
        Write-Host "   [INFO] No local PostgreSQL service active (system connects to cloud Supabase or remote DB)" -ForegroundColor Gray
    }
}

function Start-DevMode {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [DEV] Starting Bin Al-Ajouz ERP in Development Mode (Live Reload)..." -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    $backendDir = Join-Path $Root "backend"
    $frontendDir = Join-Path $Root "frontend"

    Write-Host "Launching Backend Dev window (Watch Mode)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; Write-Host '[DEV] Backend Watch Mode...' -ForegroundColor Cyan; npm run dev" -WorkingDirectory $backendDir

    Write-Host "Launching Frontend Dev window (Vite Server)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; Write-Host '[DEV] Frontend Vite Server...' -ForegroundColor Green; npm run dev" -WorkingDirectory $frontendDir

    Write-Host ""
    Write-Host "[OK] Development servers launched in separate windows!" -ForegroundColor Green
}

function Backup-Database {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [BACKUP] Creating Instant Database Backup..." -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    Set-Location $Root
    node scripts/database/backup-system.ts
}

function Run-Migrations {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [MIGRATE] Running Database Migrations and Schema Check..." -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    $backendDir = Join-Path $Root "backend"
    Set-Location $backendDir
    node scripts/migrate.ts
    Set-Location $Root
}

# --------------------------------------------------------------------------------
# CLI Argument Dispatcher
# --------------------------------------------------------------------------------
if ($Action) {
    switch ($Action.ToLower().Trim()) {
        "start"   { Start-SystemServer; exit 0 }
        "stop"    { Stop-SystemServer; exit 0 }
        "restart" { Restart-SystemServer; exit 0 }
        "status"  { Check-SystemStatus; exit 0 }
        "dev"     { Start-DevMode; exit 0 }
        "backup"  { Backup-Database; exit 0 }
        "migrate" { Run-Migrations; exit 0 }
        default {
            Write-Host "[ERROR] Unknown action: $Action" -ForegroundColor Red
            Write-Host "Available actions: start, stop, restart, status, dev, backup, migrate" -ForegroundColor Yellow
            exit 1
        }
    }
}

# --------------------------------------------------------------------------------
# Interactive Menu Loop
# --------------------------------------------------------------------------------
while ($true) {
    Clear-Host
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "          Bin Al-Ajouz ERP - Unified Control Panel (Port 3000)          " -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   [1]  Start System (Launch Unified Server and Open Browser)" -ForegroundColor White
    Write-Host "   [2]  Stop System (Release Ports 3000/5173 and Terminate Processes)" -ForegroundColor White
    Write-Host "   [3]  Restart System (Clean Stop -> Wait -> Boot)" -ForegroundColor White
    Write-Host "   [4]  Check System Status and Database Health" -ForegroundColor White
    Write-Host "   [5]  Start Development Mode (Backend and Frontend Watch)" -ForegroundColor White
    Write-Host "   [6]  Create Instant Database Backup" -ForegroundColor White
    Write-Host "   [7]  Run Database Migrations and Schema Check" -ForegroundColor White
    Write-Host ""
    Write-Host "   [0]  Exit Control Panel" -ForegroundColor Gray
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan

    $choice = Read-Host "   >> Select an option [0-7] and press Enter"

    switch ($choice.Trim()) {
        "1" { Start-SystemServer }
        "2" { Stop-SystemServer }
        "3" { Restart-SystemServer }
        "4" { Check-SystemStatus }
        "5" { Start-DevMode }
        "6" { Backup-Database }
        "7" { Run-Migrations }
        "0" {
            Write-Host ""
            Write-Host "Thank you for using Bin Al-Ajouz ERP. Goodbye!" -ForegroundColor Green
            Write-Host ""
            exit 0
        }
        default {
            Write-Host ""
            Write-Host "[ERROR] Invalid choice. Please enter a number between 0 and 7." -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Gray
    Read-Host "Press Enter to return to main menu..."
}