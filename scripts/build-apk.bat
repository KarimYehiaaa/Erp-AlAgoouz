@echo off
chcp 65001 >nul
title بُـن العـجـوز ERP - مُولّد تطبيق الموبايل (APK Builder)
color 0E

echo.
echo ====================================================================
echo      ☕ بُـن العـجـوز ERP - مُولّد تطبيق الأندرويد الأصلي (APK)
echo ====================================================================
echo.
echo [1/4] جاري بناء وتجهيز واجهات الموبايل الفاخرة للإنتاج...
cd /d "%~dp0"
call npm run build --prefix frontend
if %ERRORLEVEL% neq 0 (
    echo [خطأ] فشل في بناء واجهات الفرونت إند.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/4] جاري مزامنة ملفات الويب مع محرك الأندرويد الأصلي (Capacitor Sync)...
cd /d "%~dp0\frontend"
call npx cap sync android
if %ERRORLEVEL% neq 0 (
    echo [خطأ] فشل في مزامنة الأندرويد.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/4] جاري تجميع وترجمة تطبيق الأندرويد واستخراج ملف الـ APK...
cd /d "%~dp0\frontend\android"
call gradlew.bat assembleDebug
if %ERRORLEVEL% neq 0 (
    echo.
    echo ℹ️ تنبيه: لبناء الـ APK مباشرة بدون Android Studio، يلزم توفر Java JDK 17 أو أعلى.
    echo يمكنك فتح المشروع بضغطة زر في Android Studio من المسار:
    echo %~dp0frontend\android
    echo.
    pause
    exit /b 0
)

echo.
echo [4/4] جاري نسخ ملف التثبيت المباشر إلى المجلد الرئيسي...
cd /d "%~dp0"
if exist "%~dp0frontend\android\app\build\outputs\apk\debug\app-debug.apk" (
    copy /y "%~dp0frontend\android\app\build\outputs\apk\debug\app-debug.apk" "%~dp0BinAlAgoouz-Manager.apk" >nul
    echo.
    echo ====================================================================
    echo   ✅ تم استخراج وتجهيز ملف التثبيت بنجاح تام!
    echo   📁 مسار الملف: %~dp0BinAlAgoouz-Manager.apk
    echo ====================================================================
    echo.
    explorer.exe /select,"%~dp0BinAlAgoouz-Manager.apk"
) else (
    echo [تنبيه] لم يتم العثور على ملف APK المترجم.
)

echo.
echo اضغط أي مفتاح للإغلاق...
pause >nul
