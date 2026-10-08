@echo off
REM Legacy restart delegates ownership, schema and readiness checks to the unified controller.
cd /d "%~dp0..\.."
if errorlevel 1 exit /b %errorlevel%
call powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%cd%\system.ps1" restart -Silent
exit /b %errorlevel%
