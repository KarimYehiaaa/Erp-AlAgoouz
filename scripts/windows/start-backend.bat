@echo off
REM Legacy launcher: use the guarded unified local start path.
call "%~dp0start-silent.bat"
exit /b %errorlevel%
