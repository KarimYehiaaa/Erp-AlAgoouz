' AlAgoouz ERP - Compatibility launcher for the verified unified backend.
Dim objShell, fso, scriptDir, projectRoot, controlScript
Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
controlScript = fso.BuildPath(projectRoot, "system.ps1")
objShell.CurrentDirectory = projectRoot
' The shared controller refuses foreign listeners and checks schema/HTTP/database readiness.
WScript.Quit objShell.Run("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & controlScript & """ start -Silent", 0, True)
