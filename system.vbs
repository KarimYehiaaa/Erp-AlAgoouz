' ================================================================================
'  Bin Al-Ajouz ERP - 100% Silent Background Launcher (Zero Console Window Flash)
' ================================================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

command = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -Command ""& '" & scriptDir & "\system.ps1' start -Silent"""
WshShell.Run command, 0, False
