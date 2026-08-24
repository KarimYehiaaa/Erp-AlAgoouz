# إعداد قاعدة بيانات بن العجوز
$ErrorActionPreference = "Stop"

Write-Host "`n=== إعداد قاعدة بيانات بن العجوز ===" -ForegroundColor Cyan

if (-not $env:POSTGRES_PASSWORD) {
    $secure = Read-Host "أدخل كلمة مرور مستخدم postgres (التي اخترتها عند التثبيت)" -AsSecureString
    $env:POSTGRES_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
}

# جذر المشروع مستويان أعلى هذا السكربت (scripts\windows\)
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location "$Root\backend"
node src/database/setup.js

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nشغّل الآن:" -ForegroundColor Green
    Write-Host "  cd backend && npm run dev"
    Write-Host "  cd frontend && npm run dev"
}
