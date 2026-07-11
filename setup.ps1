# Bin Al-Ajouz ERP - quick local setup
Write-Host "=== Bin Al-Ajouz ERP Setup ===" -ForegroundColor Cyan

$envFile = Join-Path $PSScriptRoot ".env"
$envExample = Join-Path $PSScriptRoot ".env.example"

if (-not (Test-Path $envFile)) {
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Write-Host "`nCreated .env from .env.example." -ForegroundColor Yellow
    Write-Host "Edit .env and set DB_PASSWORD and JWT_SECRET before starting Docker." -ForegroundColor Yellow
  } else {
    Write-Host "`nMissing .env.example. Create .env with DB_PASSWORD and JWT_SECRET before Docker startup." -ForegroundColor Red
  }
}

Write-Host "`n[1] Starting database and services with Docker..." -ForegroundColor Yellow
docker compose up -d

Start-Sleep -Seconds 5

Write-Host "`n[2] Installing Backend dependencies..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\backend"
npm install

Write-Host "`n[3] Installing Frontend dependencies..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\frontend"
npm install

Set-Location $PSScriptRoot

Write-Host "`n=== Setup complete ===" -ForegroundColor Green
Write-Host "Backend:  cd backend && npm run dev"
Write-Host "Frontend: cd frontend && npm run dev"
Write-Host "Reset admin password: cd backend && node src/database/reset-admin.js admin `"NewStrongPasswordHere`""
Write-Host "`nLogo path: assets\logo.png"
