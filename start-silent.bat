@echo off
REM ====================================================
REM  بن العجوز ERP — تشغيل النظام صامتاً على البورت الموحد 3000
REM ====================================================
wscript.exe "%~dp0start-silent.vbs"
echo.
echo === AlAgoouz ERP ===
echo [OK] System started silently on unified port 3000.
echo Open http://localhost:3000 in your browser.
echo To stop, run scripts\stop-erp.bat
echo ===================
timeout /t 5
