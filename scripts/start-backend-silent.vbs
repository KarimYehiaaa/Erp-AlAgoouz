' AlAgoouz ERP - Silent Backend Launcher
' This script starts the ERP backend silently (no window)
Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "d:\AlAgoouz System\AlAgoouz-erp\backend"
objShell.Run "node src/index.js", 0, False
