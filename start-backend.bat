@echo off
REM ====================================================
REM  بن العجوز ERP — تشغيل الـ Backend تلقائياً
REM  بيشتغل عند بدء Windows عبر Task Scheduler
REM ====================================================

REM انتظر 5 ثواني عشان Windows يكمل
timeout /t 5 /nobreak >nul

REM تشغيل pm2 من مجلد الـ backend مباشرة
cd /d "%~dp0backend"

REM لو الـ process موجود → restart
REM لو مش موجود → start جديد مع --cwd
pm2 describe alagoouz-backend >nul 2>&1
if %errorlevel% == 0 (
    pm2 restart alagoouz-backend
) else (
    pm2 start src/index.ts --name "alagoouz-backend" --cwd "%~dp0backend"
)

pm2 save --force
