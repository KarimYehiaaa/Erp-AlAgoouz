@echo off
:: طلب صلاحيات المسؤول تلقائياً إذا لم تكن متوفرة
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

chcp 65001 >nul
title بن العجوز ERP - تشغيل السيرفر
echo ====================================================
echo  جاري إغلاق السيرفر القديم العالق في الذاكرة...
echo ====================================================
taskkill /F /IM node.exe
timeout /t 2 /nobreak >nul
echo.
echo ====================================================
echo  جاري تشغيل السيرفر المحدث الآن بنجاح...
echo ====================================================
cd /d "%~dp0backend"
npm run dev
pause
