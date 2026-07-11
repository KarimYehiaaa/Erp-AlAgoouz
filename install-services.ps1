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

# 4. Install Backend Service
Write-Host "" -ForegroundColor Yellow
Write-Host "[2] Installing Backend Service..." -ForegroundColor Yellow
$backendService = "AlAgoouz-ERP-Backend"

# Remove existing service if any
& $nssmExe stop $backendService 2>$null | Out-Null
& $nssmExe remove $backendService confirm 2>$null | Out-Null

# Install new service (using [char]34 to wrap paths with spaces in double-quotes)
$quote = [char]34
$backendPath = $quote + $projectRoot + "\backend\src\index.js" + $quote
$backendDir = $quote + $projectRoot + "\backend" + $quote

& $nssmExe install $backendService $nodeExe $backendPath
& $nssmExe set $backendService AppDirectory $backendDir
& $nssmExe set $backendService DisplayName "AlAgoouz ERP - Backend API"
& $nssmExe set $backendService Description "Backend API and database connection for AlAgoouz ERP"
& $nssmExe set $backendService Start SERVICE_AUTO_START

Write-Host "OK: Backend service installed." -ForegroundColor Green

# 5. Install Frontend Service
Write-Host "" -ForegroundColor Yellow
Write-Host "[3] Installing Frontend Service..." -ForegroundColor Yellow
$frontendService = "AlAgoouz-ERP-Frontend"

# Remove existing service if any
& $nssmExe stop $frontendService 2>$null | Out-Null
& $nssmExe remove $frontendService confirm 2>$null | Out-Null

# Install new service (runs npx serve)
$cmdExe = $env:SystemRoot + "\System32\cmd.exe"
$frontendArgs = "/c npx serve -l 5173 --single " + $quote + $projectRoot + "\frontend\dist" + $quote
$frontendDir = $quote + $projectRoot + "\frontend" + $quote

& $nssmExe install $frontendService $cmdExe $frontendArgs
& $nssmExe set $frontendService AppDirectory $frontendDir
& $nssmExe set $frontendService DisplayName "AlAgoouz ERP - Frontend Web"
& $nssmExe set $frontendService Description "Frontend web application for AlAgoouz ERP"
& $nssmExe set $frontendService Start SERVICE_AUTO_START

Write-Host "OK: Frontend service installed." -ForegroundColor Green

# 6. Start Services
Write-Host "" -ForegroundColor Yellow
Write-Host "[4] Starting Services..." -ForegroundColor Yellow
Start-Service -Name $backendService
Start-Service -Name $frontendService

Write-Host "" -ForegroundColor Green
Write-Host "=== AlAgoouz ERP Services Installed and Started Successfully! ===" -ForegroundColor Green
Write-Host "The ERP system is now running silently in the background." -ForegroundColor Green
Write-Host "Access URL: http://localhost:5173" -ForegroundColor Cyan
Write-Host "To manage the services, open Windows Services and search for AlAgoouz ERP." -ForegroundColor Gray
