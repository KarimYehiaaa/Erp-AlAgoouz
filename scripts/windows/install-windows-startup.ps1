# Register ERP to start on Windows login (PM2 resurrect)
$TaskName = "BinAlAjouzERP"
$Pm2Path = (Get-Command pm2 -ErrorAction Stop).Source
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$Action = New-ScheduledTaskAction -Execute $Pm2Path -Argument "resurrect" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Bin Al-Ajouz ERP - PM2" | Out-Null

pm2 save

Write-Host "OK: Task '$TaskName' registered - ERP starts on login" -ForegroundColor Green
Write-Host "Remove: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
