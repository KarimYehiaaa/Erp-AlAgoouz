@echo off
chcp 65001 > nul
cd /d "%~dp0..\.."

echo [AlAgoouz ERP] Starting Developer Cashier Environment...

:: 1. Ensure local backend is active
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/sync/status' -TimeoutSec 1).StatusCode } catch { Start-Process powershell -ArgumentList '-NoProfile -WindowStyle Hidden -Command npm start --prefix backend' -WindowStyle Hidden }" > nul 2>&1

:: 2. Start Desktop POS in development mode
if exist "%~dp0..\..\desktop-pos\node_modules\electron\dist\electron.exe" (
    start "" "%~dp0..\..\desktop-pos\node_modules\electron\dist\electron.exe" "%~dp0..\..\desktop-pos"
) else (
    echo [Error] Development Electron runtime not found. Run "npm install" in desktop-pos first.
    pause
)

exit
