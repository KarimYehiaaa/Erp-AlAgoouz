# Definitions only: no service, database or process operations occur on import.
. (Join-Path $PSScriptRoot 'process-ownership.ps1')

function Invoke-ErpNativeCommand {
    param([string]$Executable, [string[]]$Arguments, [string]$Stage)
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "Native command unavailable during $Stage." }
    $global:LASTEXITCODE = 0
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $Executable @Arguments 2>&1)
        $nativeExit = $LASTEXITCODE
    } catch { throw "Native command failed during $Stage." } finally { $ErrorActionPreference = $savedPreference }
    if ($nativeExit -ne 0 -or @($output | Where-Object { $_ -is [Management.Automation.ErrorRecord] -and $_.FullyQualifiedErrorId -notlike '*NativeCommandError*' }).Count -gt 0) { throw "Native command failed during $Stage (exit $nativeExit)." }
    return ($output -join "`n").TrimEnd("`r","`n")
}

function Get-ErpOwnedService {
    param([string]$ProjectRoot)
    $service = Get-CimInstance Win32_Service -Filter "Name='AlAgoouz-ERP'" -ErrorAction Stop
    if (-not $service) { return $null }
    try {
        $settings = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\AlAgoouz-ERP\Parameters' -ErrorAction Stop
        if (-not (Test-ErpOwnedCommand $ProjectRoot $settings.AppDirectory $settings.Application $settings.AppParameters)) { throw 'Foreign service.' }
        if ($service.State -notin @('Running','Stopped')) { throw 'Unstable service state.' }
    } catch { throw 'The AlAgoouz-ERP service ownership/state could not be verified; it was left untouched.' }
    return $service
}

function Get-ErpPm2Plan {
    param([string]$ProjectRoot)
    $command = Get-Command pm2 -ErrorAction SilentlyContinue
    $apps = @()
    if ($command) {
        $json = Invoke-ErpNativeCommand $command.Source @('--silent','jlist') 'PM2 inventory'
        try {
            if (-not $json.TrimStart().StartsWith('[')) { throw 'Expected array.' }
            $decoded = ConvertFrom-Json -InputObject $json
            $entries = @(); if ($null -ne $decoded) { $entries = @($decoded | ForEach-Object { $_ }) }
        } catch { throw 'PM2 inventory could not be verified; no process was changed.' }
        foreach ($entry in $entries) {
            if ($entry.name -notin @('alagoouz-backend','bin-al-ajouz-api','bin-al-ajouz-web','bin-al-ajouz-erp')) { continue }
            if (-not (Test-ErpOwnedCommand $ProjectRoot $entry.pm2_env.pm_cwd $entry.pm2_env.pm_exec_path '') -or [string]$entry.pm_id -notmatch '^\d+$' -or [string]$entry.pid -notmatch '^\d+$' -or $entry.pm2_env.status -notin @('online','stopped','errored')) { throw 'A named ERP PM2 entry ownership/state could not be verified; no process was changed.' }
            $apps += [pscustomobject]@{Id=$entry.pm_id;Pid=$entry.pid;Directory=$entry.pm2_env.pm_cwd;Entry=$entry.pm2_env.pm_exec_path;State=$entry.pm2_env.status}
        }
    }
    return [pscustomobject]@{Command=$command;Apps=$apps}
}

function Get-ErpRuntimePlan {
    param([string]$ProjectRoot)
    # Inventory is completed before any mutating call, including when PM2/service names collide.
    $service = Get-ErpOwnedService $ProjectRoot
    $pm2 = Get-ErpPm2Plan $ProjectRoot
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop | Where-Object { Test-ErpRuntimeProcess $ProjectRoot $_ })
    return [pscustomobject]@{Service=$service;Pm2=$pm2;Processes=$processes}
}

function Get-ErpRuntimeListeners {
    return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq 3000 } | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-ErpProcessAncestor {
    param([int]$ProcessId,[int[]]$Owners)
    $seen = @{}
    for ($depth=0; $depth -lt 64 -and $ProcessId -gt 0; $depth++) {
        if ($Owners -contains $ProcessId) { return $true }
        if ($seen.ContainsKey($ProcessId)) { break }; $seen[$ProcessId] = $true
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        if (-not $process) { break }; $ProcessId = $process.ParentProcessId
    }
    return $false
}

function Assert-ErpRuntimeListenerOwnership {
    param([string]$ProjectRoot,$Plan,[int]$StartedProcessId=0)
    $owners = @($Plan.Pm2.Apps | ForEach-Object { [int]$_.Pid })
    if ($Plan.Service -and $Plan.Service.State -eq 'Running') { $owners += [int]$Plan.Service.ProcessId }
    if ($StartedProcessId -gt 0) { $owners += $StartedProcessId }
    foreach ($owner in @(Get-ErpRuntimeListeners)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction Stop
        if (-not (Test-ErpRuntimeProcess $ProjectRoot $process -BackendOnly) -and -not (Test-ErpProcessAncestor $owner $owners)) { throw "Port 3000 is owned by an unrecognized process (PID $owner); refusing to stop it." }
    }
}

function Test-ErpRuntimeHealth {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2 -MaximumRedirection 0 -ErrorAction Stop
        return $health.success -is [bool] -and $health.success -and $health.db.connected -is [bool] -and $health.db.connected
    } catch { return $false }
}

function Wait-ErpRuntimeHealthy {
    param([string]$ProjectRoot,[int]$StartedProcessId=0,[ValidateRange(1,120)][int]$TimeoutSeconds=45)
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $plan = Get-ErpRuntimePlan $ProjectRoot
        Assert-ErpRuntimeListenerOwnership $ProjectRoot $plan $StartedProcessId
        if (@(Get-ErpRuntimeListeners).Count -gt 0 -and (Test-ErpRuntimeHealth)) { return }
        if ($StartedProcessId -gt 0 -and -not (Get-CimInstance Win32_Process -Filter "ProcessId=$StartedProcessId" -ErrorAction Stop)) { throw 'The ERP process exited before establishing database/HTTP readiness.' }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'The ERP backend did not become healthy with its database after startup.'
}

function Test-ErpRuntimePrerequisites {
    param([string]$ProjectRoot,[switch]$SkipFrontendBuild)
    $command = Get-Command node -ErrorAction Stop
    $node = $command.Source
    if ((Invoke-ErpNativeCommand $node @('--version') 'Node version') -notmatch '^v24\.') { throw 'Node.js 24 is required.' }
    Push-Location (Join-Path $ProjectRoot 'backend')
    try {
        $null = Invoke-ErpNativeCommand $node @('--import','tsx','scripts/verify-schema-ready.ts') 'schema readiness'
        $port = Invoke-ErpNativeCommand $node @('--import','tsx','--input-type=module','-e',"const {default:c}=await import('./src/config/index.ts');console.log('ERP_PORT='+c.port)") 'runtime port'
    } finally { Pop-Location }
    if ($port -notmatch '(?m)^ERP_PORT=3000\s*$') { throw 'The Windows ERP runtime requires PORT=3000.' }
    if (-not $SkipFrontendBuild -and -not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'frontend\dist\index.html') -PathType Leaf)) { throw 'Build the local frontend before starting the ERP runtime.' }
    return $node
}

function Stop-ErpRuntimeProcesses {
    param([string]$ProjectRoot,$Plan)
    foreach ($process in $Plan.Processes) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)" -ErrorAction Stop
        if (-not $current) { continue }
        if ($current.CreationDate -ne $process.CreationDate -or -not (Test-ErpRuntimeProcess $ProjectRoot $current)) { throw 'A process identity changed during stop; it was left untouched.' }
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
}

function Stop-ErpRuntime {
    param([string]$ProjectRoot)
    $plan = Get-ErpRuntimePlan $ProjectRoot
    Assert-ErpRuntimeListenerOwnership $ProjectRoot $plan
    # Validate all managers again before the first change, then each PM2 entry immediately before deletion.
    $currentService = Get-ErpOwnedService $ProjectRoot
    if (($null -eq $plan.Service) -ne ($null -eq $currentService) -or ($plan.Service -and ($plan.Service.PathName -ne $currentService.PathName -or $plan.Service.ProcessId -ne $currentService.ProcessId -or $plan.Service.State -ne $currentService.State))) { throw 'The ERP service identity changed during stop; it was left untouched.' }
    $currentPm2 = Get-ErpPm2Plan $ProjectRoot
    Assert-ErpPm2PlanUnchanged $plan.Pm2 $currentPm2
    if ($plan.Service -and $plan.Service.State -eq 'Running') {
        Stop-Service -Name 'AlAgoouz-ERP' -ErrorAction Stop
        (Get-Service -Name 'AlAgoouz-ERP' -ErrorAction Stop).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(45))
    }
    foreach ($app in $plan.Pm2.Apps) {
        $currentPm2 = Get-ErpPm2Plan $ProjectRoot
        Assert-ErpPm2PlanUnchanged ([pscustomobject]@{Command=$plan.Pm2.Command;Apps=@($app)}) $currentPm2 -AllowOtherEntries
        $null = Invoke-ErpNativeCommand $plan.Pm2.Command.Source @('delete',[string]$app.Id) 'PM2 stop'
    }
    if ($plan.Pm2.Apps.Count -gt 0) { $null = Invoke-ErpNativeCommand $plan.Pm2.Command.Source @('save','--force') 'PM2 persistence' }
    Stop-ErpRuntimeProcesses $ProjectRoot $plan
}

function Assert-ErpPm2PlanUnchanged {
    param($Before,$After,[switch]$AllowOtherEntries)
    if (($null -eq $Before.Command) -ne ($null -eq $After.Command) -or ($Before.Command -and $Before.Command.Source -ne $After.Command.Source) -or (-not $AllowOtherEntries -and $Before.Apps.Count -ne $After.Apps.Count)) { throw 'PM2 ownership changed during stop; no further process was changed.' }
    foreach ($app in $Before.Apps) {
        $matching = @($After.Apps | Where-Object { $_.Id -eq $app.Id })
        if ($matching.Count -ne 1 -or $matching[0].Pid -ne $app.Pid -or $matching[0].Directory -ne $app.Directory -or $matching[0].Entry -ne $app.Entry -or $matching[0].State -ne $app.State) { throw 'An ERP PM2 identity changed during stop; no further process was changed.' }
    }
}

function Start-ErpRuntime {
    param([string]$ProjectRoot,[switch]$Restart)
    $node = Test-ErpRuntimePrerequisites $ProjectRoot
    $plan = Get-ErpRuntimePlan $ProjectRoot
    Assert-ErpRuntimeListenerOwnership $ProjectRoot $plan
    if ($Restart) { Stop-ErpRuntime $ProjectRoot }
    elseif (@(Get-ErpRuntimeListeners).Count -gt 0 -and (Test-ErpRuntimeHealth)) { return }
    elseif ($plan.Service -and $plan.Service.State -eq 'Running') { throw 'The owned ERP service is running but unhealthy; use restart after inspecting its logs.' }
    elseif ($plan.Pm2.Apps.Count -gt 0) { throw 'The owned PM2 runtime is not ready; use restart to replace it without competing process managers.' }
    else { Stop-ErpRuntimeProcesses $ProjectRoot ([pscustomobject]@{Processes=@($plan.Processes | Where-Object { Test-ErpRuntimeProcess $ProjectRoot $_ -BackendOnly })}) }
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (@(Get-ErpRuntimeListeners).Count -gt 0) {
        if ([DateTime]::UtcNow -ge $deadline) { throw 'The ERP backend did not release port 3000; no replacement was started.' }
        Start-Sleep -Milliseconds 250
    }
    $currentService = Get-ErpOwnedService $ProjectRoot
    if (($null -eq $plan.Service) -ne ($null -eq $currentService) -or ($plan.Service -and $plan.Service.PathName -ne $currentService.PathName)) { throw 'The ERP service identity changed before startup; no replacement was started.' }
    if ($currentService) { Start-Service -Name 'AlAgoouz-ERP' -ErrorAction Stop; Wait-ErpRuntimeHealthy $ProjectRoot; return }
    $backend = Join-Path $ProjectRoot 'backend'
    $logs = Join-Path $backend 'logs'; $null = New-Item -ItemType Directory -Path $logs -Force
    $run = 'startup-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $arguments = ConvertTo-ErpNativeArguments @('--import','tsx','--import',(Join-Path $backend 'src\services\sentryInstrumentation.ts'),(Join-Path $backend 'src\index.ts'))
    $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$run.log") -RedirectStandardError (Join-Path $logs "$run-error.log") -PassThru
    $started = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction Stop
    try { Wait-ErpRuntimeHealthy $ProjectRoot $process.Id }
    catch {
        $startupFailure = $_
        # Revalidate creation time and canonical entry before cleanup: the PID may have been reused.
        if ($started -and (Test-ErpRuntimeProcess $ProjectRoot $started -BackendOnly)) {
            try { Stop-ErpRuntimeProcesses $ProjectRoot ([pscustomobject]@{Processes=@($started)}) }
            catch { throw 'ERP readiness failed and the newly started process could not be safely cleaned up; inspect its startup logs.' }
        }
        throw $startupFailure
    }
}
