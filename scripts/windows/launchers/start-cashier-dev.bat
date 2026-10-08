@echo off
chcp 65001 > nul
cd /d "%~dp0..\..\.." || exit /b 1

echo [AlAgoouz ERP] Starting Developer Cashier Environment...

:: 1. Wait for the shared ownership, schema and database-readiness checks.
call powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%cd%\system.ps1" start -Silent
set "backendExitCode=%errorlevel%"
if not "%backendExitCode%"=="0" exit /b %backendExitCode%

:: 2. Start Desktop POS in development mode
call "%~dp0start-desktop.bat"

exit /b %errorlevel%
