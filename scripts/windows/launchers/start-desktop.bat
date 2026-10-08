@echo off
chcp 65001 > nul
title تشغيل كاشير سطح المكتب - بن العجوز ERP
color 0E

echo ===================================================
echo     بن العجوز ERP — تشغيل كاشير سطح المكتب (POS)
echo ===================================================
echo.
echo [1/2] جاري الانتقال لمجلد المشروع...
cd /d "%~dp0..\..\.." || exit /b 1

echo [2/2] جاري تشغيل شاشة الكاشير...
echo.
call npm run dev --prefix desktop-pos
set "launchExitCode=%errorlevel%"

pause
exit /b %launchExitCode%
