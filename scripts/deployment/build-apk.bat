@echo off
setlocal
for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"
set "BUILD_SCRIPT=%~dp0build-apk.ps1"
set "DEBUG_APK=%ROOT_DIR%\BinAlAgoouz-Manager-Debug.apk"

echo Building Android Debug APK with the guarded build script...
rem This bypass applies to this PowerShell process only; it does not change system policy.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%BUILD_SCRIPT%" -BuildType Debug
if errorlevel 1 goto build_failure

if not exist "%DEBUG_APK%" goto missing_apk

echo Debug APK generated: %DEBUG_APK%
echo This debug build cannot update the installed release app.
explorer.exe /select,"%DEBUG_APK%"
pause >nul
exit /b 0

:build_failure
echo [ERROR] Android SDK setup or APK build failed.
pause
exit /b 1

:missing_apk
echo [ERROR] Build succeeded without producing the expected APK.
pause
exit /b 1
