' بن العجوز ERP — تشغيل السيرفر بالكامل في الخلفية بشكل خفي (صامت)
' سيرفر Node.js على البورت 3000 يقدم الواجهة (Frontend) والـ API معاً على بورت موحد واحد

Dim objShell
Set objShell = CreateObject("WScript.Shell")

' تشغيل السيرفر الموحد (Backend + Frontend) في الخلفية على البورت 3000
objShell.CurrentDirectory = "d:\AlAgoouz System\AlAgoouz-erp\backend"
objShell.Run "cmd /c node src/index.ts", 0, False
