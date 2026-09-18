@echo off
chcp 65001 > nul

:: ============================================================================
:: بن العجوز ERP — مشغل تطبيق الكاشير المكتبي للإنتاج (Production Native Launcher)
:: تشغيل مباشر للتطبيق المجمع بدون الحاجة لـ Node.js أو npm أو أية بيئة تطوير
:: ============================================================================

:: 1. فحص مسار التثبيت الافتراضي للمستخدم
if exist "%LocalAppData%\Programs\AlAgoouz-POS\AlAgoouz-POS.exe" (
    start "" "%LocalAppData%\Programs\AlAgoouz-POS\AlAgoouz-POS.exe"
    exit
)

:: 2. فحص مسار تثبيت البرامج العام (Program Files)
if exist "%ProgramFiles%\AlAgoouz-POS\AlAgoouz-POS.exe" (
    start "" "%ProgramFiles%\AlAgoouz-POS\AlAgoouz-POS.exe"
    exit
)

:: 3. فحص مجلد الإصدار المستقل داخل المستودع (Standalone Unpacked)
if exist "%~dp0..\..\desktop-pos\release\win-unpacked\AlAgoouz-POS.exe" (
    start "" "%~dp0..\..\desktop-pos\release\win-unpacked\AlAgoouz-POS.exe"
    exit
)

:: إذا لم يتم العثور على التطبيق المثبت، توجيه المستخدم لتثبيت المثبت الرسمي
echo.
echo ======================================================================
echo    تنبيه: تطبيق كاشير بن العجوز غير مثبت على هذا الجهاز
echo ======================================================================
echo.
echo يرجى تشغيل مثبت الإنتاج الرسمي:
echo desktop-pos\release\AlAgoouz-POS-Setup-1.0.0.exe
echo.
pause
exit
