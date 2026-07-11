# AlAgoouz ERP - Register Auto-Start Task
# Must run as Administrator

$taskName = "AlAgoouz-ERP-Backend"
$vbsPath = "d:\AlAgoouz System\AlAgoouz-erp\scripts\start-backend-silent.vbs"

# Remove old task if exists
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Create new task
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "AlAgoouz ERP Backend - Auto Start at Login (Silent)" -Force

Write-Host "SUCCESS: Task '$taskName' registered!" -ForegroundColor Green
Write-Host "The ERP backend will now auto-start silently every time you log in." -ForegroundColor Green
Start-Sleep -Seconds 5
