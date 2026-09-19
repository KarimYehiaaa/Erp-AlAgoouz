Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(fso.GetParentFolderName(scriptDir))
WshShell.CurrentDirectory = rootDir
WshShell.Run "cmd /c """ & scriptDir & "\start-cashier.bat""", 0, False
Set WshShell = Nothing
Set fso = Nothing
