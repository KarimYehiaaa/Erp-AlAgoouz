# Bin Al-Agoouz ERP - Mobile APK Builder
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Yellow
Write-Host "     Bin Al-Agoouz ERP - Mobile APK Builder (Android)               " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Yellow
Write-Host ""

$rootDir = "D:\AlAgoouz System\AlAgoouz-erp"

# Set Java 17 Home
$possibleJdk = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
if (Test-Path $possibleJdk) {
    $env:JAVA_HOME = $possibleJdk
    $env:PATH = "$possibleJdk\bin;$env:PATH"
}

# Set Android SDK Root
$sdkPath = "D:\AlAgoouz System\android-sdk"
if (Test-Path $sdkPath) {
    $env:ANDROID_HOME = $sdkPath
    $env:ANDROID_SDK_ROOT = $sdkPath
}

# Ensure local.properties
$localProp = "$rootDir\frontend\android\local.properties"
$escapedSdk = $sdkPath -replace '\\', '\\'
Set-Content -Path $localProp -Value "sdk.dir=$escapedSdk"

# 1. Build Web Assets
Write-Host "[1/3] Building frontend production bundle..." -ForegroundColor Green
Set-Location "$rootDir"
npm run build --prefix frontend

# 2. Sync Capacitor
Write-Host ""
Write-Host "[2/3] Syncing Capacitor Android assets..." -ForegroundColor Green
Set-Location "$rootDir\frontend"
npx cap sync android

# 3. Assemble APK
Write-Host ""
Write-Host "[3/3] Assembling Signed Android APK (Release)..." -ForegroundColor Green
Set-Location "$rootDir\frontend\android"
cmd.exe /c "gradlew.bat assembleRelease assembleDebug"

$apkSrc = "$rootDir\frontend\android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkSrc)) {
    $apkSrc = "$rootDir\frontend\android\app\build\outputs\apk\debug\app-debug.apk"
}
$apkDst = "$rootDir\BinAlAgoouz-Manager.apk"

if (Test-Path $apkSrc) {
    Copy-Item $apkSrc $apkDst -Force
    Write-Host ""
    Write-Host "====================================================================" -ForegroundColor Green
    Write-Host "  SUCCESS! APK generated at: $apkDst" -ForegroundColor Green
    Write-Host "====================================================================" -ForegroundColor Green
    Write-Host ""
    explorer.exe /select,"$apkDst"
} else {
    Write-Host ""
    Write-Host "[NOTE] Check gradle output above if build failed." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Done! Press Enter to close..." -ForegroundColor Gray
Read-Host