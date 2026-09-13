@echo off
chcp 65001 > nul
cd /d "%~dp0..\.."

:: 1. التحقق من السيرفر وتشغيله في الخلفية بدون أي شاشة
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/sync/status' -TimeoutSec 1).StatusCode } catch { Start-Process powershell -ArgumentList '-NoProfile -WindowStyle Hidden -Command npm start --prefix backend' -WindowStyle Hidden }" > nul 2>&1

:: 2. تشغيل تطبيق الكاشير المكتبي كبرنامج ويندوز أصيل مباشرة
start "" "%~dp0..\..\desktop-pos\node_modules\electron\dist\electron.exe" "%~dp0..\..\desktop-pos"

:: 3. إغلاق شاشة الدوس فوراً
exit
