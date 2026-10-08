' بن العجوز ERP — مشغل صامت للسيرفر الموحد على المنفذ 3000 (Frontend + API)
' يعمل من scripts/windows/ — يشتق مسار المشروع من موقع هذا الملف تلقائياً

Dim objShell, fso, scriptDir, projectRoot, controlScript
Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' scripts\windows\ ← مجلد هذا الملف؛ المشروع هو مستويان للأعلى
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
controlScript = fso.BuildPath(projectRoot, "system.ps1")
objShell.CurrentDirectory = projectRoot
' Keep ownership, schema and readiness checks identical to the normal launcher.
WScript.Quit objShell.Run("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & controlScript & """ start -Silent", 0, True)
