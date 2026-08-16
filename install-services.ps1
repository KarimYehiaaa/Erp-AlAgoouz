# AlAgoouz ERP - Windows Services Installer Script
# Must be run as Administrator

$ErrorActionPreference = "Stop"

# Enable TLS 1.2 for Invoke-WebRequest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# 1. Check for Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator! Please open PowerShell as Administrator and try again."
    Exit
}

Write-Host "=== Starting AlAgoouz ERP Services Installation ===" -ForegroundColor Cyan

# Define paths
$projectRoot = $PSScriptRoot
$scriptsDir = $projectRoot + "\scripts"
$nssmExe = $scriptsDir + "\nssm.exe"

# 2. Download NSSM if not present
if (-not (Test-Path $nssmExe)) {
    Write-Host "" -ForegroundColor Yellow
    Write-Host "[1] Downloading NSSM (Service Manager)..." -ForegroundColor Yellow
    $zipPath = $env:TEMP + "\nssm.zip"
    $extractPath = $env:TEMP + "\nssm-extracted"
    
    # Download
    Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zipPath
    
    # Extract
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractPath
    
    # Copy nssm.exe (64-bit) to scripts folder
    if (-not (Test-Path $scriptsDir)) { New-Item $scriptsDir -ItemType Directory }
    $sourceNssm = $extractPath + "\nssm-2.24\win64\nssm.exe"
    Copy-Item -Path $sourceNssm -Destination $nssmExe -Force
    
    # Clean up
    Remove-Item $zipPath -Force
    Remove-Item $extractPath -Recurse -Force
    Write-Host "OK: NSSM installed successfully." -ForegroundColor Green
} else {
    Write-Host "" -ForegroundColor Green
    Write-Host "[1] NSSM is already present." -ForegroundColor Green
}

# 3. Find Node.js path
$nodeExe = (Get-Command node).Source
if (-not $nodeExe) {
    $nodeExe = "C:\Program Files\nodejs\node.exe"
}
$nodeMsg = "Node.js Path: " + $nodeExe
Write-Host $nodeMsg -ForegroundColor Gray

# 4. Install Unified ERP Service (Port 3000)
Write-Host "" -ForegroundColor Yellow
Write-Host "[2] Installing Unified ERP Service (Port 3000)..." -ForegroundColor Yellow
$unifiedService = "AlAgoouz-ERP"

# Clean up legacy separate services if any
& $nssmExe stop "AlAgoouz-ERP-Backend" 2>$null | Out-Null
& $nssmExe remove "AlAgoouz-ERP-Backend" confirm 2>$null | Out-Null
& $nssmExe stop "AlAgoouz-ERP-Frontend" 2>$null | Out-Null
& $nssmExe remove "AlAgoouz-ERP-Frontend" confirm 2>$null | Out-Null

# Remove existing unified service if reinstalling
& $nssmExe stop $unifiedService 2>$null | Out-Null
& $nssmExe remove $unifiedService confirm 2>$null | Out-Null

# Install unified service (backend serves both API and Web UI on Port 3000)
$quote = [char]34
$serverPath = $quote + $projectRoot + "\backend\src\index.ts" + $quote
$backendDir = $quote + $projectRoot + "\backend" + $quote

& $nssmExe install $unifiedService $nodeExe $serverPath
& $nssmExe set $unifiedService AppDirectory $backendDir
& $nssmExe set $unifiedService DisplayName "AlAgoouz ERP - Unified System (Port 3000)"
& $nssmExe set $unifiedService Description "Unified Full-Stack Server (API + Web) for AlAgoouz ERP on Port 3000"
& $nssmExe set $unifiedService Start SERVICE_AUTO_START

Write-Host "OK: Unified ERP service installed on port 3000." -ForegroundColor Green

# 5. Start Service
Write-Host "" -ForegroundColor Yellow
Write-Host "[3] Starting Unified Service..." -ForegroundColor Yellow
Start-Service -Name $unifiedService

Write-Host "" -ForegroundColor Green
Write-Host "=== AlAgoouz ERP Service Installed and Started Successfully! ===" -ForegroundColor Green
Write-Host "The ERP system is now running silently on unified port 3000." -ForegroundColor Green
Write-Host "Access URL: http://localhost:3000" -ForegroundColor Cyan
Write-Host "To manage the service, open Windows Services and search for AlAgoouz ERP." -ForegroundColor Gray
