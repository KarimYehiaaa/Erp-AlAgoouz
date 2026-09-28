@echo off
setlocal
cd /d "%~dp0"

:: في حال طلب لوحة التحكم التفاعلية
if /i "%~1"=="menu" (
    powershell -ExecutionPolicy Bypass -File "%~dp0system.ps1"
    exit /b
)

:: في حال تمرير أوامر مباشرة (stop, restart, status, dev, backup, migrate)
if not "%~1"=="" (
    powershell -ExecutionPolicy Bypass -File "%~dp0system.ps1" %*
    exit /b
)

:: التشغيل الافتراضي: صامت في الخلفية 100% وإغلاق نافذة موجه الأوامر فوراً
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-WindowStyle Hidden -ExecutionPolicy Bypass -File \"\"%~dp0system.ps1\"\" start -Silent' -WindowStyle Hidden"
exit /b
