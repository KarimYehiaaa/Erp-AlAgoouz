@echo off
REM Legacy production entry: the unified backend serves the built frontend on port 3000.
cd /d "%~dp0..\.."
if errorlevel 1 exit /b %errorlevel%
call powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%cd%\system.ps1" start -Silent
exit /b %errorlevel%
