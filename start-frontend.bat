@echo off
REM ====================================================
REM  بن العجوز ERP — تشغيل الـ Frontend (Production)
REM  يستخدم serve لتقديم الـ build بدل dev server
REM ====================================================
timeout /t 8 /nobreak >nul
cd /d "%~dp0frontend"
serve dist -l 5173 --single
