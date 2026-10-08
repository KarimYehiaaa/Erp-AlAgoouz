# Bin Al-Ajouz ERP - unified Windows controls for the project on port 3000.
param([string]$Action, [switch]$Silent)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }
Set-Location -LiteralPath $Root
. (Join-Path $Root 'scripts\windows\runtime-control.ps1')

function Start-SystemServer {
    param([switch]$Silent)
    if (-not $Silent) { Write-Host '[START] Checking the owned ERP runtime and database...' -ForegroundColor Cyan }
    Start-ErpRuntime $Root
    if (-not $Silent) { Write-Host '[SUCCESS] ERP is ready with its database: http://localhost:3000' -ForegroundColor Green }
    if (-not $Silent) { Start-Process 'http://localhost:3000' }
}

function Stop-SystemServer {
    Stop-ErpRuntime $Root
    Write-Host '[SUCCESS] Verified ERP processes were stopped; unrelated applications were left running.' -ForegroundColor Green
}

function Restart-SystemServer {
    param([switch]$Silent)
    Start-ErpRuntime $Root -Restart
    if (-not $Silent) { Write-Host '[SUCCESS] ERP restarted and established database/HTTP readiness.' -ForegroundColor Green }
    if (-not $Silent) { Start-Process 'http://localhost:3000' }
}

function Check-SystemStatus {
    $plan = Get-ErpRuntimePlan $Root
    Assert-ErpRuntimeListenerOwnership $Root $plan
    if (@(Get-ErpRuntimeListeners).Count -eq 0) { Write-Host '[OFFLINE] No owned ERP listener on port 3000.' -ForegroundColor Yellow; return }
    if (Test-ErpRuntimeHealth) { Write-Host '[ONLINE] Owned ERP HTTP and database are healthy.' -ForegroundColor Green }
    else { Write-Host '[UNHEALTHY] The owned ERP runtime has not established HTTP/database readiness.' -ForegroundColor Yellow }
}

function Start-DevMode {
    foreach ($port in @(3000,5173)) {
        if (Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $port }) { throw "Port $port is occupied; development servers were not started." }
    }
    $node = Test-ErpRuntimePrerequisites $Root -SkipFrontendBuild
    $backend = Join-Path $Root 'backend'
    $frontend = Join-Path $Root 'frontend'
    $backendArguments = ConvertTo-ErpNativeArguments @('--watch','--import','tsx','--import',(Join-Path $backend 'src\services\sentryInstrumentation.ts'),(Join-Path $backend 'src\index.ts'))
    $vite = Join-Path $Root 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) { $vite = Join-Path $frontend 'node_modules\vite\bin\vite.js' }
    if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) { throw 'Install frontend dependencies before starting development mode.' }
    # The user explicitly selected interactive development windows.
    Start-Process -FilePath $node -ArgumentList $backendArguments -WorkingDirectory $backend
    Start-Process -FilePath $node -ArgumentList (ConvertTo-ErpNativeArguments @($vite)) -WorkingDirectory $frontend
    Write-Host '[DEV] Backend watch and frontend Vite were launched.' -ForegroundColor Green
}

function Backup-Database {
    $node = (Get-Command node -ErrorAction Stop).Source
    $null = Invoke-ErpNativeCommand $node @((Join-Path $Root 'scripts\database\backup-system.ts')) 'database backup'
    Write-Host '[SUCCESS] Database backup completed.' -ForegroundColor Green
}

function Run-Migrations {
    $node = (Get-Command node -ErrorAction Stop).Source
    Push-Location (Join-Path $Root 'backend')
    try { $null = Invoke-ErpNativeCommand $node @('scripts/migrate.ts') 'database migrations' } finally { Pop-Location }
    Write-Host '[SUCCESS] Database migrations completed.' -ForegroundColor Green
}

# CLI Argument Dispatcher. Dot sourcing exposes definitions for isolated verification.
if ($MyInvocation.InvocationName -eq '.') { return }
if ($Action) {
    try {
        switch ($Action.ToLower().Trim()) {
            'start' { Start-SystemServer -Silent:$Silent }
            'stop' { Stop-SystemServer }
            'restart' { Restart-SystemServer -Silent:$Silent }
            'status' { Check-SystemStatus }
            'dev' { Start-DevMode }
            'backup' { Backup-Database }
            'migrate' { Run-Migrations }
            default { throw 'Unknown action. Use start, stop, restart, status, dev, backup or migrate.' }
        }
        exit 0
    } catch { Write-Error $_.Exception.Message -ErrorAction Continue; exit 1 }
}

while ($true) {
    Clear-Host
    Write-Host 'Bin Al-Ajouz ERP - Unified Control Panel (Port 3000)' -ForegroundColor Cyan
    Write-Host '[1] Start  [2] Stop  [3] Restart  [4] Status  [5] Dev  [6] Backup  [7] Migrate  [0] Exit'
    $choice = Read-Host 'Select an option [0-7]'
    try {
        switch ($choice.Trim()) {
            '1' { Start-SystemServer }
            '2' { Stop-SystemServer }
            '3' { Restart-SystemServer }
            '4' { Check-SystemStatus }
            '5' { Start-DevMode }
            '6' { Backup-Database }
            '7' { Run-Migrations }
            '0' { exit 0 }
            default { throw 'Invalid choice.' }
        }
    } catch { Write-Error $_.Exception.Message -ErrorAction Continue }
    Read-Host 'Press Enter to return to the menu'
}
