' بن العجوز ERP — تشغيل السيرفر بالكامل في الخلفية بشكل خفي (صامت)
' هذا الملف يقوم بتشغيل الـ Backend والـ Frontend بدون فتح أي نوافذ CMD أو Terminal

Dim objShell
Set objShell = CreateObject("WScript.Shell")

' 1. تشغيل الـ Backend في الخلفية
objShell.CurrentDirectory = "d:\AlAgoouz System\AlAgoouz-erp\backend"
objShell.Run "cmd /c node src/index.js", 0, False

' 2. انتظار 3 ثوانٍ للتأكد من بدء تشغيل الـ Backend
WScript.Sleep 3000

' 3. تشغيل الـ Frontend في الخلفية (Production build)
objShell.CurrentDirectory = "d:\AlAgoouz System\AlAgoouz-erp\frontend"
objShell.Run "cmd /c npx serve -l 5173 --single dist", 0, False
