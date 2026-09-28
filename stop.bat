@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -Command "& '%~dp0system.ps1' stop"
exit /b
