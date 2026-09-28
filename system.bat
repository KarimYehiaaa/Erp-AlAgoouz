@echo off
setlocal
cd /d "%~dp0"

:: في حال طلب لوحة التحكم التفاعلية
if /i "%~1"=="menu" (
    powershell -ExecutionPolicy Bypass -Command "& '%~dp0system.ps1'"
    exit /b
)

:: في حال تمرير أوامر مباشرة (stop, restart, status, dev, backup, migrate)
if not "%~1"=="" (
    powershell -ExecutionPolicy Bypass -Command "& '%~dp0system.ps1' %*"
    exit /b
)

:: التشغيل الافتراضي: صامت في الخلفية 100% وإغلاق نافذة موجه الأوامر فوراً
if exist "%~dp0system.vbs" (
    start "" wscript.exe "%~dp0system.vbs"
) else (
    powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command "& '%~dp0system.ps1' start -Silent"
)
exit /b
