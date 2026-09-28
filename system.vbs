' ================================================================================
'  Bin Al-Ajouz ERP - 100% Silent Background Launcher (Zero Console Window Flash)
' ================================================================================
Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptDir & "\system.ps1"" start -Silent", 0, False
