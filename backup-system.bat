@echo off
:: AlAgoouz ERP - Full System Backup Executable
chcp 65001 > nul
title AlAgoouz ERP Full Backup
echo Initializing full system backup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-system.ps1"
echo.
echo Press any key to close this window...
pause > nul
