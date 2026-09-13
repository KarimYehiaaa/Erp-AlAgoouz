Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = rootDir
WshShell.Run "wscript.exe """ & rootDir & "\scripts\launchers\silent-pos.vbs""", 0, False
Set WshShell = Nothing
Set fso = Nothing
