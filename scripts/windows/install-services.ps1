# Run as Administrator. Dot sourcing exposes the same installer functions for isolated tests.
[CmdletBinding()]
param([string]$NssmArchive = '')

$ErrorActionPreference = 'Stop'
$script:InstallerRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'process-ownership.ps1')
$script:NssmRelease = '2.24-101-g897c7ad'
# Upstream publishes SHA1 ca2f6782a05af85facf9b620e047b01271edd11d.
# SHA256 and both PE hashes were also verified against the distribution archive.
$script:NssmArchiveHash = '99f5045fffbffb745d67fe3a065a953c4a3d9c253b868892d9b685b0ee7d07b8'
$script:NssmBinaryHashes = @{
    win64 = 'eee9c44c29c2be011f1f1e43bb8c3fca888cb81053022ec5a0060035de16d848'
    win32 = '682f1025b4c410ae78b1c5bdc4de7ad315f2eff292c66947c13969930028c98d'
}

function Assert-InstallerPath {
    param([string]$Path, [string]$Root)
    $absolute = [IO.Path]::GetFullPath($Path)
    $boundary = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Installer path is outside its owned directory.'
    }
    $cursor = $absolute
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Installer paths must not contain junctions or symbolic links.'
            }
        }
        $cursor = Split-Path -Parent $cursor
    }
    return $absolute
}

function Invoke-InstallerNative {
    param([string]$Executable, [string[]]$Arguments, [string]$Stage)
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "Native command could not start during $Stage." }
    $global:LASTEXITCODE = 0
    $savedPreference = $ErrorActionPreference
    try {
        # Windows PowerShell turns native stderr into ErrorRecord even for ordinary CLI diagnostics.
        # Capture it without letting the raw message escape before we inspect the native exit code.
        $ErrorActionPreference = 'Continue'
        $output = @(& $Executable @Arguments 2>&1)
        $nativeExit = $LASTEXITCODE
    } catch { throw "Native command could not start during $Stage." } finally { $ErrorActionPreference = $savedPreference }
    if ($nativeExit -ne 0) { throw "Native command failed during $Stage (exit $nativeExit)." }
    if (@($output | Where-Object { $_ -is [Management.Automation.ErrorRecord] -and $_.FullyQualifiedErrorId -notlike '*NativeCommandError*' }).Count -gt 0) { throw "Native command failed during $Stage." }
    # Caller may need metadata, but it must never print raw arguments/output with secrets.
    return ($output -join "`n").TrimEnd("`r", "`n")
}

function Get-InstallerNode {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $candidates = @()
    if ($nodeCommand -and $nodeCommand.CommandType -eq 'Application') { $candidates += $nodeCommand.Source }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($base) { $candidates += Join-Path $base 'nodejs\node.exe' }
    }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe' }
    $node = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $node) { throw 'Install Node.js 24 before installing the ERP service.' }
    $version = Invoke-InstallerNative $node @('--version') 'Node version verification'
    if ($version -notmatch '^v24\.') { throw 'Node.js 24 is required. No startup configuration was changed.' }
    return $node
}

function Test-InstallerSchema {
    param([string]$ProjectRoot, [string]$Node)
    Push-Location (Join-Path $ProjectRoot 'backend')
    try {
        $null = Invoke-InstallerNative $Node @('--import', 'tsx', 'scripts/verify-schema-ready.ts') 'schema readiness'
        $schemaCheckExitCode = 0
    } catch { $schemaCheckExitCode = 1 } finally { Pop-Location }
    if ($schemaCheckExitCode -ne 0) {
        throw 'Database schema readiness could not be proven. No existing startup configuration was changed.'
    }
    # This installer owns port 3000; it must not start successfully on a different .env port.
    Push-Location (Join-Path $ProjectRoot 'backend')
    try {
        $portText = Invoke-InstallerNative $Node @('--import', 'tsx', '--input-type=module', '-e', "const {default:c}=await import('./src/config/index.ts');console.log('ERP_PORT='+c.port)") 'runtime configuration'
    } finally { Pop-Location }
    if ($portText -notmatch '(?m)^ERP_PORT=3000\s*$') { throw 'The ERP Windows service requires configured PORT=3000.' }
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'frontend\dist\index.html') -PathType Leaf)) {
        throw 'Build the local frontend before installing the unified service.'
    }
}

function Copy-InstallerBoundedStream {
    param($InputStream, $OutputStream, [int]$MaxBytes)
    $buffer = New-Object byte[] 32768
    $total = 0
    while (($count = $InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $total += $count
        if ($total -gt $MaxBytes) { throw 'Service tool content exceeds its size limit.' }
        $OutputStream.Write($buffer, 0, $count)
    }
}

function Get-InstallerFileHash {
    param([string]$Path)
    # Use the framework directly; Get-FileHash's script-module resolution can vary
    # when Windows PowerShell is launched by Node from a PowerShell 7 environment.
    $stream = [IO.File]::OpenRead($Path)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $hasher.Dispose(); $stream.Dispose() }
}

function Get-InstallerDownload {
    param([string]$Uri, [string]$Target, [int]$MaxBytes = 8388608, [ValidateRange(100,30000)][int]$TimeoutMs = 30000)
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object Net.Http.HttpClient($handler)
    $cancellation = New-Object Threading.CancellationTokenSource
    $cancellation.CancelAfter($TimeoutMs)
    $response = $null
    $body = $null
    $file = $null
    $clock = [Diagnostics.Stopwatch]::StartNew()
    # .NET Framework body reads can ignore token cancellation. Bound the wait itself.
    function Wait-InstallerDownloadTask {
        param($Task)
        $remaining = $TimeoutMs - [int]$clock.ElapsedMilliseconds
        if ($remaining -le 0 -or -not $Task.Wait($remaining)) { throw 'Service tool download deadline exceeded.' }
        return $Task.GetAwaiter().GetResult()
    }
    try {
        $request = New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::Get, $Uri)
        try { $response = Wait-InstallerDownloadTask ($client.SendAsync($request, [Net.Http.HttpCompletionOption]::ResponseHeadersRead, $cancellation.Token)) } finally { $request.Dispose() }
        if (-not $response.IsSuccessStatusCode -or $response.Content.Headers.ContentLength -gt $MaxBytes) { throw 'Service tool download was rejected.' }
        $body = Wait-InstallerDownloadTask ($response.Content.ReadAsStreamAsync())
        $file = [IO.File]::Open($Target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $buffer = New-Object byte[] 32768
        $total = 0
        while (($count = Wait-InstallerDownloadTask ($body.ReadAsync($buffer, 0, $buffer.Length, $cancellation.Token))) -gt 0) {
            $total += $count
            if ($total -gt $MaxBytes) { throw 'Service tool download exceeds its size limit.' }
            $file.Write($buffer, 0, $count)
        }
        $file.Flush($true)
    } catch { throw 'Service tool download failed or exceeded its deadline.' } finally {
        $cancellation.Cancel(); $client.CancelPendingRequests()
        if ($body) { $body.Dispose() }
        if ($file) { $file.Dispose() }
        if ($response) { $response.Dispose() }
        $cancellation.Dispose(); $client.Dispose(); $handler.Dispose()
    }
}

function Copy-InstallerZipEntry {
    param([string]$Archive, [string]$EntryName, [string]$Target, [int]$MaxBytes)
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        $entries = @($zip.Entries | Where-Object { $_.FullName -eq $EntryName })
        if ($entries.Count -ne 1 -or $entries[0].Length -gt $MaxBytes) { throw 'Invalid service manager archive layout.' }
        $inputStream = $entries[0].Open()
        $outputStream = $null
        try {
            $outputStream = [IO.File]::Open($Target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            Copy-InstallerBoundedStream $inputStream $outputStream $MaxBytes
            $outputStream.Flush($true)
        } finally { $inputStream.Dispose(); if ($outputStream) { $outputStream.Dispose() } }
    } finally { $zip.Dispose() }
}

function Get-InstallerNssm {
    param([string]$ProjectRoot, [string]$Archive = '')
    $architecture = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
    $cacheRoot = Join-Path $ProjectRoot "scripts\runtime-tools\nssm-$script:NssmRelease\$architecture"
    $target = Assert-InstallerPath (Join-Path $cacheRoot 'nssm.exe') $ProjectRoot
    $expectedBinaryHash = $script:NssmBinaryHashes[$architecture]
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        if ((Get-InstallerFileHash $target) -ne $expectedBinaryHash) {
            throw 'Cached service manager integrity check failed. Existing startup configuration was not changed.'
        }
        return $target
    }
    $ownedRoot = Join-Path $ProjectRoot 'scripts\runtime-tools'
    $null = Assert-InstallerPath (Join-Path $ownedRoot 'boundary') $ProjectRoot
    $null = New-Item -ItemType Directory -Path $ownedRoot -Force
    $owner = [guid]::NewGuid().ToString('N')
    $stage = Assert-InstallerPath (Join-Path $ownedRoot "erp-nssm-$owner") $ownedRoot
    $null = New-Item -ItemType Directory -Path $stage
    $marker = Join-Path $stage '.installer-owner'
    [IO.File]::WriteAllText($marker, $owner)
    try {
        $zipPath = Join-Path $stage 'package.zip'
        if ($Archive) {
            $source = Get-Item -LiteralPath $Archive -Force
            if ($source.PSIsContainer -or ($source.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid service manager archive.' }
            Copy-Item -LiteralPath $source.FullName -Destination $zipPath
        } else {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            try {
                Get-InstallerDownload "https://nssm.cc/ci/nssm-$script:NssmRelease.zip" $zipPath
            } catch {
                # A distribution fallback supplies the very same inner archive, never its scripts.
                # Its contents still have to match the upstream release and PE hashes below.
                if (Test-Path -LiteralPath $zipPath -PathType Leaf) { Remove-Item -LiteralPath $zipPath -Force }
                $distribution = Join-Path $stage 'distribution.nupkg'
                Get-InstallerDownload 'https://community.chocolatey.org/api/v2/package/nssm/2.24.101' $distribution
                Copy-InstallerZipEntry $distribution "tools/nssm-$script:NssmRelease.zip" $zipPath 2097152
            }
        }
        if ((Get-InstallerFileHash $zipPath) -ne $script:NssmArchiveHash) { throw 'Service manager archive integrity check failed.' }
        $pending = Join-Path $stage 'verified.exe'
        Copy-InstallerZipEntry $zipPath "nssm-$script:NssmRelease/$architecture/nssm.exe" $pending 2097152
        if ((Get-InstallerFileHash $pending) -ne $expectedBinaryHash) { throw 'Service manager executable integrity check failed.' }
        $null = Assert-InstallerPath $target $ProjectRoot
        $null = New-Item -ItemType Directory -Path $cacheRoot -Force
        Move-Item -LiteralPath $pending -Destination $target
        return $target
    } finally {
        $checkedStage = Assert-InstallerPath $stage $ownedRoot
        if ([IO.File]::ReadAllText($marker) -ne $owner) { throw 'Installer staging ownership changed; cleanup refused.' }
        Remove-Item -LiteralPath $checkedStage -Recurse -Force
    }
}

function Get-InstallerService {
    param([string]$Name)
    return Get-CimInstance Win32_Service -Filter "Name='$Name'" -ErrorAction Stop
}

function Test-InstallerNewRegistration {
    param([string]$Name, [string]$ProjectRoot, [string]$Nssm, [string]$Node)
    try {
        $service = Get-InstallerService $Name
        if (-not $service) { return $true }
        $image = [IO.Path]::GetFullPath(([string]$service.PathName).Trim('"'))
        if (-not $image.Equals([IO.Path]::GetFullPath($Nssm), [StringComparison]::OrdinalIgnoreCase)) { return $false }
        $application = Invoke-InstallerNative $Nssm @('get', $Name, 'Application') 'new service ownership'
        if (-not ([IO.Path]::GetFullPath($application)).Equals([IO.Path]::GetFullPath($Node), [StringComparison]::OrdinalIgnoreCase)) { return $false }
        $directory = Invoke-InstallerNative $Nssm @('get', $Name, 'AppDirectory') 'new service ownership'
        $parameters = Invoke-InstallerNative $Nssm @('get', $Name, 'AppParameters') 'new service ownership'
        return Test-InstallerOwnedCommand $ProjectRoot $directory $application $parameters
    } catch { return $false }
}

function Set-InstallerServiceImagePath {
    param([string]$Name, [string]$ImagePath)
    # Avoid legacy PowerShell native-argument quoting changing an ImagePath with spaces.
    if (-not ('ErpInstaller.ServiceConfig' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace ErpInstaller {
  public static class ServiceConfig {
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr OpenSCManager(string machine, string database, uint access);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr OpenService(IntPtr manager, string name, uint access);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool ChangeServiceConfig(IntPtr service, uint type, uint start, uint error,
      string binary, string group, IntPtr tag, string dependencies, string account, string password, string display);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool CloseServiceHandle(IntPtr handle);
    public static void SetImagePath(string name, string path) {
      IntPtr manager = OpenSCManager(null, null, 1);
      if (manager == IntPtr.Zero) throw new InvalidOperationException("Service manager access failed.");
      try {
        IntPtr service = OpenService(manager, name, 2);
        if (service == IntPtr.Zero) throw new InvalidOperationException("Service configuration access failed.");
        try {
          if (!ChangeServiceConfig(service, UInt32.MaxValue, UInt32.MaxValue, UInt32.MaxValue,
            path, null, IntPtr.Zero, null, null, null, null))
            throw new InvalidOperationException("Service image configuration failed.");
        } finally { CloseServiceHandle(service); }
      } finally { CloseServiceHandle(manager); }
    }
  }
}
'@
    }
    [ErpInstaller.ServiceConfig]::SetImagePath($Name, $ImagePath)
}

function Test-InstallerOwnedCommand {
    param([string]$ProjectRoot, [string]$Directory, [string]$Command, [string]$Arguments)
    return Test-ErpOwnedCommand $ProjectRoot $Directory $Command $Arguments
}

function Get-InstallerPlan {
    param([string]$ProjectRoot, [string]$Nssm)
    $services = @()
    foreach ($name in @('AlAgoouz-ERP', 'AlAgoouz-ERP-Backend', 'AlAgoouz-ERP-Frontend')) {
        $service = Get-InstallerService $name
        if (-not $service) { continue }
        if ($service.State -notin @('Running','Stopped')) { throw "Service $name is in a transition or paused state." }
        $directory = Invoke-InstallerNative $Nssm @('get', $name, 'AppDirectory') 'service ownership'
        $application = Invoke-InstallerNative $Nssm @('get', $name, 'Application') 'service ownership'
        $arguments = Invoke-InstallerNative $Nssm @('get', $name, 'AppParameters') 'service ownership'
        if (-not (Test-InstallerOwnedCommand $ProjectRoot $directory $application $arguments)) { throw "Service $name is not owned by this checkout." }
        $settings = [ordered]@{}
        foreach ($parameter in @('Application','AppDirectory','AppParameters','AppStopMethodConsole','AppNoConsole','AppStopMethodSkip','AppKillProcessTree','DisplayName','Description','Start')) {
            $settings[$parameter] = Invoke-InstallerNative $Nssm @('get', $name, $parameter) 'service snapshot'
        }
        $services += [pscustomobject]@{Name=$name;Running=($service.State -eq 'Running');ProcessId=$service.ProcessId;ImagePath=$service.PathName;Settings=$settings}
    }
    $tasks = @()
    foreach ($taskName in @("AlAgoouz-ERP-Backend", "BinAlAjouzERP")) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if (-not $task) { continue }
        if (@($task.Actions).Count -ne 1 -or -not (Test-InstallerOwnedCommand $ProjectRoot $task.Actions[0].WorkingDirectory $task.Actions[0].Execute $task.Actions[0].Arguments)) { throw "Task $taskName is not owned by this checkout." }
        $pm2Task = [IO.Path]::GetFileName($task.Actions[0].Execute) -match '^pm2\.(ps1|cmd)$'
        $globalPm2Task = $pm2Task -and $task.Actions[0].Arguments -match '^\s*resurrect(?:\s|$)'
        $tasks += [pscustomobject]@{Name=$taskName;Path=$task.TaskPath;Enabled=$task.Settings.Enabled;Pm2=$pm2Task;GlobalPm2=$globalPm2Task;Retain=$false}
    }
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    $apps = @()
    if (-not $pm2 -and @($tasks | Where-Object { $_.Pm2 }).Count -gt 0) { throw 'The existing PM2 startup inventory is unavailable.' }
    if ($pm2) {
        $inventory = Invoke-InstallerNative $pm2.Source @('--silent', 'jlist') 'PM2 inventory'
        try {
            if (-not $inventory.TrimStart().StartsWith('[')) { throw 'Expected a JSON inventory array.' }
            $decoded = ConvertFrom-Json -InputObject $inventory
            # Windows PowerShell emits the JSON array as one pipeline object; enumerate explicitly.
            $entries = @()
            if ($null -ne $decoded) { $entries = @($decoded | ForEach-Object { $_ }) }
        } catch { throw 'PM2 inventory could not be verified.' }
        foreach ($entry in $entries) {
            if ($entry.name -notin @('alagoouz-backend','bin-al-ajouz-api','bin-al-ajouz-web','bin-al-ajouz-erp')) { continue }
            if (-not (Test-InstallerOwnedCommand $ProjectRoot $entry.pm2_env.pm_cwd $entry.pm2_env.pm_exec_path '')) { throw "PM2 entry $($entry.name) is not owned by this checkout." }
            if ($entry.pm2_env.status -notin @('online','stopped','errored') -or [string]$entry.pm_id -notmatch '^\d+$' -or [string]$entry.pid -notmatch '^\d+$') { throw 'PM2 process state could not be verified.' }
            $apps += [pscustomobject]@{Id=$entry.pm_id;Pid=$entry.pid;Running=($entry.pm2_env.status -eq 'online')}
        }
        if ($entries.Count -gt $apps.Count) {
            foreach ($task in $tasks) { if ($task.GlobalPm2) { $task.Retain = $true } }
        }
    }
    return [pscustomobject]@{Services=$services;Tasks=$tasks;Apps=$apps;Pm2=$pm2}
}

function Get-InstallerListeners {
    param([int]$Port = 3000)
    if (-not ([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $Port })) { return @() }
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-InstallerProcessAncestor {
    param([int]$ProcessId, [int[]]$Owners)
    $seen = @{}
    for ($depth=0; $depth -lt 64 -and $ProcessId -gt 0; $depth++) {
        if ($Owners -contains $ProcessId) { return $true }
        if ($seen.ContainsKey($ProcessId)) { break }
        $seen[$ProcessId] = $true
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        if (-not $process) { break }
        $ProcessId = $process.ParentProcessId
    }
    return $false
}

function Stop-InstallerService {
    param([string]$Name)
    $service = Get-Service -Name $Name -ErrorAction Stop
    if ($service.Status -ne 'Stopped') {
        Stop-Service -Name $Name -ErrorAction Stop
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
    }
}

function Wait-InstallerHealthy {
    param([string]$Name, [ValidateRange(1,120)][int]$TimeoutSeconds = 60, [ValidateRange(1,65535)][int]$Port = 3000)
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $service = Get-InstallerService $Name
        if (-not $service -or $service.State -eq 'Stopped') { throw 'New ERP service stopped before becoming ready.' }
        try {
            $owners = @(Get-InstallerListeners $Port)
            if ($owners.Count -gt 0 -and @($owners | Where-Object { -not (Test-InstallerProcessAncestor $_ @([int]$service.ProcessId)) }).Count -eq 0) {
                $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3 -MaximumRedirection 0
                $health = ConvertFrom-Json -InputObject $response.Content
                if ($response.StatusCode -eq 200 -and $health.success -eq $true -and $health.db.connected -eq $true) { return }
            }
        } catch { }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'New ERP service did not establish owned HTTP/database readiness.'
}

function Invoke-ErpServiceInstallation {
    param([string]$ProjectRoot, [string]$Archive = '')
    $nodeExe = Get-InstallerNode
    Test-InstallerSchema $ProjectRoot $nodeExe
    $nssmExe = Get-InstallerNssm $ProjectRoot $Archive
    $plan = Get-InstallerPlan $ProjectRoot $nssmExe
    $owners = @($plan.Services | Where-Object { $_.Running } | ForEach-Object { [int]$_.ProcessId }) + @($plan.Apps | Where-Object { $_.Running } | ForEach-Object { [int]$_.Pid })
    foreach ($listener in @(Get-InstallerListeners)) {
        if (-not (Test-InstallerProcessAncestor $listener $owners)) { throw 'Port 3000 is owned by a process outside the verified startup plan.' }
    }
    $unifiedService = 'AlAgoouz-ERP'
    $existing = $plan.Services | Where-Object { $_.Name -eq $unifiedService } | Select-Object -First 1
    $created = $false
    $serviceTouched = $false
    $committed = $false
    $changedTasks = @()
    $stoppedApps = @()
    $stoppedServices = @()
    try {
        foreach ($task in $plan.Tasks) {
            if ($task.Enabled) {
                $changedTasks += $task
                $null = Disable-ScheduledTask -TaskName $task.Name -TaskPath $task.Path -ErrorAction Stop
            }
        }
        foreach ($app in $plan.Apps) {
            if ($app.Running) {
                $stoppedApps += $app
                $null = Invoke-InstallerNative $plan.Pm2.Source @('stop', [string]$app.Id) 'PM2 stop'
            }
        }
        foreach ($service in $plan.Services) {
            if ($service.Running) { $stoppedServices += $service; Stop-InstallerService $service.Name }
        }
        if (@(Get-InstallerListeners).Count -ne 0) { throw 'Port 3000 did not drain after stopping verified processes.' }
        if (-not $existing) {
            # Mark creation intent before the native call, which may partially create a service.
            $created = $true
            $serviceTouched = $true
            # Initial absolute entry points allow a partial registration to prove ownership
            # before rollback. A racing foreign registration must never be removed.
            $null = Invoke-InstallerNative $nssmExe @('install', $unifiedService, $nodeExe, '--import', 'tsx', '--import', (Join-Path $ProjectRoot 'backend\src\services\sentryInstrumentation.ts'), (Join-Path $ProjectRoot 'backend\src\index.ts')) 'service install'
        } else {
            $serviceTouched = $true
            Set-InstallerServiceImagePath $unifiedService ('"' + $nssmExe + '"')
        }
        $configuration = [ordered]@{
            Application = $nodeExe
            AppDirectory = (Join-Path $ProjectRoot 'backend')
            AppParameters = '--import tsx --import ./src/services/sentryInstrumentation.ts src/index.ts'
            AppStopMethodConsole = 35000
            AppNoConsole = 0
            AppStopMethodSkip = 6
            AppKillProcessTree = 1
            DisplayName = 'AlAgoouz ERP - Unified System (Port 3000)'
            Description = 'Unified Full-Stack Server (API + Web) for AlAgoouz ERP on Port 3000'
            Start = 'SERVICE_AUTO_START'
        }
        foreach ($parameter in $configuration.Keys) {
            $null = Invoke-InstallerNative $nssmExe @('set', $unifiedService, $parameter, [string]$configuration[$parameter]) 'service configuration'
        }
        Start-Service -Name $unifiedService -ErrorAction Stop
        Wait-InstallerHealthy $unifiedService
        $committed = $true
        # Destructive legacy cleanup is permitted only after the verified service owns a healthy endpoint.
        foreach ($app in $plan.Apps) { $null = Invoke-InstallerNative $plan.Pm2.Source @('delete', [string]$app.Id) 'legacy PM2 cleanup' }
        if ($plan.Apps.Count -gt 0 -or @($plan.Tasks | Where-Object { $_.Pm2 }).Count -gt 0) { $null = Invoke-InstallerNative $plan.Pm2.Source @('save', '--force') 'PM2 persistence' }
        foreach ($task in $plan.Tasks) {
            $taskName = $task.Name
            if ($task.Retain) {
                if ($task.Enabled) { $null = Enable-ScheduledTask -TaskName $taskName -TaskPath $task.Path -ErrorAction Stop }
            } else { Unregister-ScheduledTask -TaskName $taskName -TaskPath $task.Path -Confirm:$false -ErrorAction Stop }
        }
        foreach ($service in $plan.Services) {
            if ($service.Name -ne $unifiedService) { $null = Invoke-InstallerNative $nssmExe @('remove', $service.Name, 'confirm') 'legacy service cleanup' }
        }
        return [pscustomobject]@{Success=$true;Service=$unifiedService;Url='http://localhost:3000'}
    } catch {
        if ($committed) { throw 'ERP service is healthy, but legacy startup cleanup failed. The new service was retained; installation is incomplete.' }
        $rollbackFailed = $false
        $replacementStopped = $true
        $unifiedRestored = $true
        if ($created -and -not (Test-InstallerNewRegistration $unifiedService $ProjectRoot $nssmExe $nodeExe)) {
            $rollbackFailed = $true
            $replacementStopped = $false
        }
        if ($serviceTouched -and $replacementStopped) {
            try { if (Get-InstallerService $unifiedService) { Stop-InstallerService $unifiedService } } catch { $rollbackFailed = $true; $replacementStopped = $false }
        }
        if ($created -and $replacementStopped) {
            try { if (Get-InstallerService $unifiedService) { $null = Invoke-InstallerNative $nssmExe @('remove', $unifiedService, 'confirm') 'new service rollback' } } catch { $rollbackFailed = $true }
        } elseif ($existing -and $serviceTouched -and $replacementStopped) {
            foreach ($parameter in $existing.Settings.Keys) {
                try { $null = Invoke-InstallerNative $nssmExe @('set', $unifiedService, $parameter, [string]$existing.Settings[$parameter]) 'service configuration rollback' } catch { $rollbackFailed = $true; $unifiedRestored = $false }
            }
            try { Set-InstallerServiceImagePath $unifiedService ([string]$existing.ImagePath) } catch { $rollbackFailed = $true; $unifiedRestored = $false }
        }
        if ($replacementStopped) {
            foreach ($service in $stoppedServices) {
                if ($service.Name -eq $unifiedService -and -not $unifiedRestored) { continue }
                try { Start-Service -Name $service.Name -ErrorAction Stop } catch { $rollbackFailed = $true }
            }
            foreach ($app in $stoppedApps) { try { $null = Invoke-InstallerNative $plan.Pm2.Source @('restart', [string]$app.Id) 'PM2 rollback' } catch { $rollbackFailed = $true } }
            foreach ($task in $changedTasks) { try { $null = Enable-ScheduledTask -TaskName $task.Name -TaskPath $task.Path -ErrorAction Stop } catch { $rollbackFailed = $true } }
        }
        if ($rollbackFailed) { throw 'Service installation failed and rollback could not be completed. Manual recovery is required.' }
        throw 'Service installation failed. Previous startup configuration was restored.'
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if (-not $isAdmin) { throw 'Run the ERP service installer as Administrator.' }
        $null = Invoke-ErpServiceInstallation $script:InstallerRoot $NssmArchive
        Write-Host 'AlAgoouz ERP service installed, verified, and started successfully.' -ForegroundColor Green
        exit 0
    } catch {
        Write-Error $_.Exception.Message -ErrorAction Continue
        exit 1
    }
}
