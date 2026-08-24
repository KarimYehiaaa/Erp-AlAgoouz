' بن العجوز ERP — مشغل صامت للسيرفر الموحد على المنفذ 3000 (Frontend + API)
' يعمل من scripts/windows/ — يشتق مسار المشروع من موقع هذا الملف تلقائياً

Dim objShell, fso, scriptDir, projectRoot, backendDir
Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' scripts\windows\ ← مجلد هذا الملف؛ المشروع هو مستويان للأعلى
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
backendDir = fso.BuildPath(projectRoot, "backend")

objShell.CurrentDirectory = backendDir
objShell.Run "cmd /c node src/index.ts", 0, False
