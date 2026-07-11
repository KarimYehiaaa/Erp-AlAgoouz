@echo off
REM ====================================================
REM  بن العجوز ERP — تشغيل النظام صامتاً في الخلفية
REM ====================================================
wscript.exe "%~dp0start-silent.vbs"
echo.
echo === AlAgoouz ERP ===
echo [OK] Started Backend & Frontend in the background silently.
echo Open http://localhost:5173 in your browser.
echo To stop, run scripts\stop-erp.bat
echo ===================
timeout /t 5
