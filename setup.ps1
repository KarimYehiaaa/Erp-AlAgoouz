# بن العجوز ERP - سكربت الإعداد السريع
Write-Host "=== بن العجوز ERP Setup ===" -ForegroundColor Cyan

# تشغيل PostgreSQL عبر Docker
Write-Host "`n[1] تشغيل قاعدة البيانات..." -ForegroundColor Yellow
docker compose up -d

Start-Sleep -Seconds 5

# تثبيت الحزم
Write-Host "`n[2] تثبيت Backend..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\backend"
npm install

Write-Host "`n[3] تثبيت Frontend..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\frontend"
npm install

Set-Location $PSScriptRoot

Write-Host "`n=== تم الإعداد ===" -ForegroundColor Green
Write-Host "Backend:  cd backend && npm run dev"
Write-Host "Frontend: cd frontend && npm run dev"
Write-Host "الدخول: admin / Admin@123"
Write-Host "`nضع الشعار في: assets\logo.png"
