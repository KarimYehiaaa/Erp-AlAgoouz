' AlAgoouz ERP - Silent Backend Launcher
' This script starts the ERP backend silently (no window)
' يشتق مجلد المشروع من موقع هذا الملف (scripts\ ← المستوى الأعلى)
Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)
backendDir = fso.BuildPath(projectRoot, "backend")

objShell.CurrentDirectory = backendDir
objShell.Run "node src/index.ts", 0, False
