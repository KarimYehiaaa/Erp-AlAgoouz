import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourcePath = fileURLToPath(new URL('./install-services.ps1', import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const windowsOnly = { skip: process.platform !== 'win32' };
const withFixture = (callback) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'erp-service-install-fixture-'));
  const scripts = path.join(directory, 'scripts', 'windows');
  const scratch = path.join(directory, 'owned-temp');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(scratch);
  mkdirSync(path.join(directory, 'backend', 'scripts'), { recursive: true });
  mkdirSync(path.join(directory, 'frontend', 'dist'), { recursive: true });
  writeFileSync(path.join(directory, 'frontend', 'dist', 'index.html'), '<!doctype html>Fixture');
  const fakeNode = path.join(directory, 'fake-node.cmd');
  writeFileSync(
    fakeNode,
    '@echo off\r\nif "%1"=="--version" echo v24.18.0\r\nif "%1"=="--import" echo ERP_PORT=3000\r\nexit /b 0\r\n',
  );
  const installer = path.join(scripts, 'install-services.ps1');
  copyFileSync(
    fileURLToPath(new URL('./process-ownership.ps1', import.meta.url)),
    path.join(scripts, 'process-ownership.ps1'),
  );
  // Only the elevation boundary is replaced; native tasks/services are mocked below.
  const source = readFileSync(sourcePath, 'utf8')
    .replace(/^\s*\$isAdmin = .+$/m, '$isAdmin = $true')
    .replace(
      /^if \(\$MyInvocation.InvocationName -ne '\.'\) \{/m,
      `function Get-InstallerDownload { param($Uri,$Target,$MaxBytes) [IO.File]::WriteAllText($Target, 'invalid fixture archive') }\n$&`,
    );
  writeFileSync(installer, source);
  const cleanup = () => {
    const resolved = realpathSync(directory);
    assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
    assert.match(path.basename(resolved), /^erp-service-install-fixture-/);
    rmSync(resolved, { recursive: true, force: true });
  };
  let asynchronous = false;
  try {
    const result = callback({ directory, scripts, scratch, fakeNode, installer });
    if (result && typeof result.then === 'function') {
      asynchronous = true;
      return result.finally(cleanup);
    }
    return result;
  } finally {
    if (!asynchronous) cleanup();
  }
};
const runFixture = (fixture, setup = '') => {
  const actions = path.join(fixture.directory, 'actions.log');
  const command = `
    $ErrorActionPreference = 'Stop'
    $env:TEMP = ${quote(fixture.scratch)}
    $env:INSTALL_FIXTURE_ACTIONS = ${quote(actions)}
    function global:Get-Command { param($Name, $ErrorAction)
      if ($Name -eq 'node') { return [pscustomobject]@{CommandType='Application';Source=${quote(fixture.fakeNode)}} }
      return $null
    }
    function global:Unregister-ScheduledTask { param($TaskName,$Confirm,$ErrorAction) Add-Content -LiteralPath $env:INSTALL_FIXTURE_ACTIONS -Value ('unregister:' + $TaskName) }
    function global:Start-Service { param($Name) Add-Content -LiteralPath $env:INSTALL_FIXTURE_ACTIONS -Value ('start:' + $Name) }
    function global:Stop-Service { param($Name,$ErrorAction) Add-Content -LiteralPath $env:INSTALL_FIXTURE_ACTIONS -Value ('stop:' + $Name) }
    function global:Get-Service { param($Name,$ErrorAction) return $null }
    function global:Get-ScheduledTask { param($TaskName,$ErrorAction) return $null }
    function global:Get-CimInstance { param($ClassName,$Filter,$ErrorAction) return $null }
    function global:Invoke-WebRequest { param($Uri,$OutFile,$TimeoutSec,$MaximumRedirection,[switch]$UseBasicParsing)
      [IO.File]::WriteAllText($OutFile, 'invalid fixture archive')
    }
    function global:Expand-Archive { param($Path,$LiteralPath,$DestinationPath)
      $target = Join-Path $DestinationPath 'nssm-2.24\\win64'
      New-Item -ItemType Directory -Path $target -Force | Out-Null
      [IO.File]::WriteAllText((Join-Path $target 'nssm.exe'), 'invalid fixture executable')
    }
    ${setup}
    try { & ${quote(fixture.installer)}; exit $LASTEXITCODE } catch { Write-Output 'FIXTURE_FAILED'; exit 1 }
  `;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
    },
  );
  assert.ifError(result.error);
  return { ...result, actions: existsSync(actions) ? readFileSync(actions, 'utf8') : '' };
};

test('a rejected service tool preserves existing startup tasks', windowsOnly, () =>
  withFixture((fixture) => {
    writeFileSync(
      path.join(fixture.directory, 'scripts', 'nssm.exe'),
      'invalid fixture executable',
    );
    const result = runFixture(fixture);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      result.actions,
      '',
      'Existing tasks were removed before a usable replacement was established',
    );
  }),
);

test('failed acquisition cannot delete a neighbour-owned temporary directory', windowsOnly, () =>
  withFixture((fixture) => {
    const neighbour = path.join(fixture.scratch, 'nssm-extracted');
    mkdirSync(neighbour);
    const marker = path.join(neighbour, 'other-process-data.txt');
    writeFileSync(marker, 'keep neighbour data');
    const result = runFixture(fixture);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      existsSync(marker),
      true,
      'The installer deleted another operation temporary directory',
    );
    assert.equal(result.actions, '');
  }),
);

test('failed native service commands cannot announce successful installation', windowsOnly, () =>
  withFixture((fixture) => {
    const fakeExecutable = path.join(fixture.directory, 'scripts', 'nssm.exe');
    const setup = `
    Add-Type -OutputAssembly ${quote(fakeExecutable)} -OutputType ConsoleApplication -TypeDefinition @'
using System;
public class FixtureNative {
  public static int Main(string[] args) {
    if (args.Length > 2 && args[0] == "set" && args[2] == "AppStopMethodConsole") return 0;
    return 17;
  }
}
'@
  `;
    const result = runFixture(fixture, setup);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.ok(!result.stdout.includes('Installed and Started Successfully'), result.stdout);
    assert.equal(result.actions, '');
  }),
);

const runController = (fixture, scenario) => {
  const program = `
    . ${quote(sourcePath)}
    $script:scenario = ${quote(scenario)}
    $script:events = New-Object 'System.Collections.Generic.List[string]'
    $old = [ordered]@{Application='old-node';AppDirectory='old-directory';AppParameters='old-parameters';AppStopMethodConsole='1500';AppNoConsole='1';AppStopMethodSkip='7';AppKillProcessTree='0';DisplayName='old-display';Description='old-description';Start='SERVICE_DEMAND_START'}
    $script:settings = [ordered]@{}
    foreach ($key in $old.Keys) { $script:settings[$key] = $old[$key] }
    $script:present = $script:scenario -notin @('fresh-install-failure','foreign-registration-race')
    $script:imagePath = 'old-image-path'
    $script:running = @{'AlAgoouz-ERP'=$script:present;'AlAgoouz-ERP-Backend'=$true}
    $script:taskEnabled = $script:scenario -notin @('retain-disabled-global-pm2','disabled-health-failure')
    $script:appRunning = $true
    $script:changed = $false
    $script:failedOnce = $false
    function Get-InstallerNode { $script:events.Add('node'); return 'fake-node' }
    function Test-InstallerSchema { param($ProjectRoot,$Node) $script:events.Add('schema') }
    function Get-InstallerNssm { param($ProjectRoot,$Archive) $script:events.Add('tool'); return 'fake-tool' }
    function Get-InstallerPlan { param($ProjectRoot,$Nssm)
      $script:events.Add('plan')
      $services = @([pscustomobject]@{Name='AlAgoouz-ERP-Backend';Running=$true;ProcessId=66;ImagePath='legacy-image';Settings=[ordered]@{}})
      if ($script:present) { $services += [pscustomobject]@{Name='AlAgoouz-ERP';Running=$true;ProcessId=55;ImagePath='old-image-path';Settings=$old} }
      return [pscustomobject]@{Services=$services;Tasks=@([pscustomobject]@{Name='OwnedTask';Path='\\';Enabled=$script:taskEnabled;Pm2=$true;Retain=($script:scenario -in @('retain-global-pm2','retain-disabled-global-pm2'))});Apps=@([pscustomobject]@{Id=7;Pid=77;Running=$true});Pm2=[pscustomobject]@{Source='fake-pm2'}}
    }
    function Get-InstallerListeners {
      if ($script:scenario -eq 'foreign-listener') { return 99 }
      if ($script:appRunning) { return 77 }
      return @()
    }
    function Test-InstallerProcessAncestor { param($ProcessId,$Owners) return $ProcessId -in $Owners }
    function Disable-ScheduledTask { param($TaskName,$TaskPath,$ErrorAction)
      $script:events.Add('disable-task'); $script:taskEnabled=$false
      if ($script:scenario -eq 'task-disable-failure') { throw 'fixture failed disable' }
    }
    function Enable-ScheduledTask { param($TaskName,$TaskPath,$ErrorAction) $script:events.Add('enable-task');$script:taskEnabled=$true }
    function Unregister-ScheduledTask { param($TaskName,$TaskPath,$Confirm,$ErrorAction)
      $script:events.Add('remove-task')
      if ($script:scenario -eq 'cleanup-failure') { throw 'fixture failed cleanup' }
    }
    function Stop-InstallerService { param($Name)
      $script:events.Add('stop:'+ $Name)
      if ($script:scenario -eq 'rollback-stop-failure' -and $Name -eq 'AlAgoouz-ERP' -and @($script:events | Where-Object { $_ -eq 'stop:AlAgoouz-ERP' }).Count -gt 1) { $script:running[$Name]=$true;throw 'fixture cannot stop replacement' }
      $script:running[$Name]=$false
    }
    function Get-InstallerService { param($Name)
      if ($Name -eq 'AlAgoouz-ERP' -and -not $script:present) { return $null }
      return [pscustomobject]@{State=$(if ($script:running[$Name]) {'Running'} else {'Stopped'});ProcessId=55}
    }
    function Test-InstallerNewRegistration { param($Name,$ProjectRoot,$Nssm,$Node) return $script:scenario -ne 'foreign-registration-race' }
    function Set-InstallerServiceImagePath { param($Name,$ImagePath)
      $script:events.Add('image:'+ $ImagePath);$script:imagePath=$ImagePath
      if ($script:scenario -eq 'upgrade-failure' -and $ImagePath -ne 'old-image-path') { throw 'fixture image failure' }
    }
    function Invoke-InstallerNative { param($Executable,$Arguments,$Stage)
      $script:events.Add('native:'+ $Stage + ':' + ($Arguments -join '|'))
      if ($Stage -eq 'PM2 stop') { $script:appRunning=$false; if ($script:scenario -eq 'pm2-stop-failure') { throw 'fixture PM2 stop failure' } }
      if ($Stage -eq 'PM2 rollback') { $script:appRunning=$true }
      if ($Stage -eq 'service install') { $script:present=$true; if ($script:scenario -in @('fresh-install-failure','foreign-registration-race')) { throw 'fixture partial install failure' } }
      if ($Stage -eq 'new service rollback') { $script:present=$false }
      if ($Stage -eq 'service configuration') {
        $script:changed=$true; $script:settings[$Arguments[2]]=$Arguments[3]
        if ($script:scenario -in @('configuration-failure','rollback-failure') -and $Arguments[2] -eq 'AppDirectory') { throw 'fixture private raw failure' }
      }
      if ($Stage -eq 'service configuration rollback') {
        if ($script:scenario -eq 'rollback-failure' -and $Arguments[2] -eq 'Application') { throw 'fixture rollback failure' }
        $script:settings[$Arguments[2]]=$Arguments[3]
      }
      if ($Stage -eq 'legacy PM2 cleanup' -and $script:scenario -eq 'pm2-cleanup-failure') { throw 'fixture PM2 cleanup failure' }
      return ''
    }
    function Start-Service { param($Name,$ErrorAction)
      $script:events.Add('start:'+ $Name)
      if ($script:scenario -eq 'start-failure' -and $Name -eq 'AlAgoouz-ERP' -and -not $script:failedOnce) { $script:failedOnce=$true;throw 'fixture start failure' }
      $script:running[$Name]=$true
    }
    function Wait-InstallerHealthy { param($Name)
      $script:events.Add('health')
      if ($script:scenario -in @('health-failure','rollback-stop-failure','disabled-health-failure')) { throw 'fixture health failure' }
    }
    $errorText = ''
    try { $result=Invoke-ErpServiceInstallation ${quote(fixture.directory)} } catch { $errorText=$_.Exception.Message }
    [pscustomobject]@{Error=$errorText;Events=@($script:events);Settings=$script:settings;ImagePath=$script:imagePath;Present=$script:present;Running=$script:running;TaskEnabled=$script:taskEnabled;AppRunning=$script:appRunning;Success=($null -ne $result -and $result.Success)} | ConvertTo-Json -Depth 6 -Compress
  `;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', program],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
};

for (const scenario of [
  'configuration-failure',
  'start-failure',
  'health-failure',
  'upgrade-failure',
]) {
  test(`existing service and startup states roll back after ${scenario}`, windowsOnly, () =>
    withFixture((fixture) => {
      const result = runController(fixture, scenario);
      assert.match(result.Error, /Previous startup configuration was restored/);
      assert.equal(result.ImagePath, 'old-image-path');
      assert.equal(result.Settings.Application, 'old-node');
      assert.equal(result.Settings.AppDirectory, 'old-directory');
      assert.equal(result.Settings.Start, 'SERVICE_DEMAND_START');
      assert.equal(result.Settings.AppNoConsole, '1');
      assert.equal(result.Settings.AppStopMethodSkip, '7');
      assert.equal(result.Settings.AppKillProcessTree, '0');
      assert.equal(result.Present, true);
      assert.equal(result.Running['AlAgoouz-ERP'], true);
      assert.equal(result.Running['AlAgoouz-ERP-Backend'], true);
      assert.equal(result.TaskEnabled, true);
      assert.equal(result.AppRunning, true);
      assert.ok(!result.Events.includes('remove-task'));
      assert.ok(
        !result.Events.some(
          (event) =>
            event.includes('legacy PM2 cleanup') || event.includes('legacy service cleanup'),
        ),
      );
      assert.ok(!result.Error.includes('private raw'));
    }),
  );
}
for (const scenario of ['task-disable-failure', 'pm2-stop-failure']) {
  test(
    `an early ${scenario} cannot stop or reconfigure the untouched unified service`,
    windowsOnly,
    () =>
      withFixture((fixture) => {
        const result = runController(fixture, scenario);
        assert.match(result.Error, /Previous startup configuration was restored/);
        assert.ok(!result.Events.includes('stop:AlAgoouz-ERP'));
        assert.ok(!result.Events.some((event) => event.includes('service configuration')));
        assert.equal(result.Running['AlAgoouz-ERP'], true);
        assert.equal(result.TaskEnabled, true);
        assert.equal(result.AppRunning, true);
      }),
  );
}
test(
  'a partial new-service installation removes only its new registration and resumes legacy startup',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runController(fixture, 'fresh-install-failure');
      assert.match(result.Error, /Previous startup configuration was restored/);
      assert.equal(result.Present, false);
      assert.equal(result.Running['AlAgoouz-ERP-Backend'], true);
      assert.equal(result.TaskEnabled, true);
      assert.equal(result.AppRunning, true);
      assert.ok(result.Events.some((event) => event.includes('new service rollback')));
    }),
);
for (const scenario of ['cleanup-failure', 'pm2-cleanup-failure']) {
  test(
    `a post-readiness ${scenario} reports an incomplete install and retains the healthy service`,
    windowsOnly,
    () =>
      withFixture((fixture) => {
        const result = runController(fixture, scenario);
        assert.match(result.Error, /healthy.*cleanup failed.*incomplete/);
        assert.equal(result.Running['AlAgoouz-ERP'], true);
        assert.equal(result.Settings.Application, 'fake-node');
        assert.equal(result.Events.filter((event) => event === 'stop:AlAgoouz-ERP').length, 1);
        assert.ok(!result.Events.includes('enable-task'));
      }),
  );
}
test(
  'cleanup follows owned service readiness and preserves a shared PM2 resurrection task',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runController(fixture, 'retain-global-pm2');
      assert.equal(result.Success, true);
      assert.equal(result.Error, '');
      assert.equal(result.TaskEnabled, true);
      assert.ok(!result.Events.includes('remove-task'));
      const health = result.Events.indexOf('health');
      const save = result.Events.findIndex((event) => event.includes('PM2 persistence'));
      assert.ok(health < save);
      assert.ok(save < result.Events.indexOf('enable-task'));
      assert.ok(
        result.Events.filter((event) => /legacy .*cleanup/.test(event)).every(
          (event) => result.Events.indexOf(event) > health,
        ),
      );
    }),
);
test('a foreign listener prevents any startup mutation', windowsOnly, () =>
  withFixture((fixture) => {
    const result = runController(fixture, 'foreign-listener');
    assert.match(result.Error, /process outside/);
    assert.deepEqual(result.Events, ['node', 'schema', 'tool', 'plan']);
    assert.equal(result.Running['AlAgoouz-ERP'], true);
    assert.equal(result.TaskEnabled, true);
  }),
);
test(
  'rollback failures remain failures while recovery attempts continue for other startup mechanisms',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runController(fixture, 'rollback-failure');
      assert.match(result.Error, /rollback could not be completed/);
      assert.equal(result.TaskEnabled, true);
      assert.equal(result.AppRunning, true);
      assert.equal(result.Running['AlAgoouz-ERP-Backend'], true);
      assert.equal(
        result.Running['AlAgoouz-ERP'],
        false,
        'Do not restart a service with incompletely restored settings',
      );
    }),
);

test(
  'an unstoppable replacement cannot be followed by restarting competing legacy backends',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runController(fixture, 'rollback-stop-failure');
      assert.match(result.Error, /rollback could not be completed/);
      assert.equal(result.Running['AlAgoouz-ERP'], true);
      assert.equal(result.Running['AlAgoouz-ERP-Backend'], false);
      assert.equal(result.AppRunning, false);
      assert.equal(result.TaskEnabled, false);
      assert.ok(!result.Events.some((event) => event.includes('configuration rollback')));
    }),
);

test(
  'a foreign same-name registration racing a failed install is neither stopped nor removed',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runController(fixture, 'foreign-registration-race');
      assert.match(result.Error, /Manual recovery is required/);
      assert.equal(result.Present, true);
      assert.ok(!result.Events.includes('stop:AlAgoouz-ERP'));
      assert.ok(!result.Events.some((event) => event.includes('new service rollback')));
    }),
);

for (const scenario of ['retain-disabled-global-pm2', 'disabled-health-failure']) {
  test(`an originally disabled startup task stays disabled after ${scenario}`, windowsOnly, () =>
    withFixture((fixture) => {
      const result = runController(fixture, scenario);
      assert.equal(result.TaskEnabled, false);
      assert.ok(!result.Events.includes('enable-task'));
      assert.ok(!result.Events.includes('disable-task'));
      assert.equal(result.Success, scenario === 'retain-disabled-global-pm2');
    }),
  );
}

const runLibrary = (fixture, body, asynchronous = false) => {
  const program = path.join(fixture.directory, 'library-test.ps1');
  writeFileSync(program, `. ${quote(sourcePath)}\n${body}\n`);
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', program];
  const options = { encoding: 'utf8', windowsHide: true, timeout: asynchronous ? 45000 : 25000 };
  const decode = (result) => {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout.trim());
  };
  if (!asynchronous) return decode(spawnSync('powershell.exe', args, options));
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      try {
        resolve(decode({ status, stdout, stderr }));
      } catch (error) {
        reject(error);
      }
    });
  });
};

test(
  'ownership follows the executed entry point rather than incidental project arguments',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
    $root = ${quote(fixture.directory)}
    $foreign = Join-Path (Split-Path -Parent $root) 'foreign-checkout'
    $cases = @(
      @((Join-Path $root 'backend'),'C:\\node.exe','--import tsx src/index.ts'),
      @($foreign,'C:\\node.exe',('"' + (Join-Path $root 'backend\\src\\index.ts') + '"')),
      @((Join-Path $root 'backend'),'C:\\node.exe',('"' + (Join-Path $foreign 'server.js') + '" "' + $root + '"')),
      @((Join-Path $root 'backend'),(Join-Path $root 'tools\\node.exe'),('-e "foreignCode()" "' + $root + '"')),
      @((Join-Path $root 'backend'),'C:\\node.exe',('"' + (Join-Path $root '..\\foreign-checkout\\server.js') + '"')),
      @($foreign,'C:\\Windows\\System32\\wscript.exe',('"' + (Join-Path $root 'scripts\\windows\\start-silent.vbs') + '"')),
      @($foreign,'C:\\Windows\\System32\\wscript.exe',('"' + (Join-Path $foreign 'worker.vbs') + '" "' + $root + '"')),
      @($foreign,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',('-Command "foreignCode()" "' + $root + '"')),
      @((Join-Path $root 'backend'),'C:\\pm2.ps1','resurrect'),
      @($foreign,'C:\\pm2.ps1',('start "' + (Join-Path $foreign 'server.js') + '" --name "' + $root + '"'))
    )
    $results = foreach ($case in $cases) { Test-InstallerOwnedCommand $root $case[0] $case[1] $case[2] }
    ConvertTo-Json -InputObject @($results) -Compress
  `,
      );
      assert.deepEqual(result, [true, true, false, false, false, true, false, false, true, false]);
    }),
);

test('installer consumes Node option values before deciding command ownership', windowsOnly, () =>
  withFixture((fixture) => {
    const result = runLibrary(
      fixture,
      `
      $root = ${quote(fixture.directory)}
      $owned = Join-Path $root 'backend\\src\\index.ts'
      $foreign = Join-Path (Split-Path -Parent $root) 'foreign-checkout\\server.js'
      $arguments = @(
        ('--title "' + $owned + '" "' + $foreign + '"'),
        ('--env-file "' + $owned + '" "' + $foreign + '"'),
        ('--unknown-mode "' + $owned + '" "' + $foreign + '"'),
        ('--title fixture --import tsx "' + $owned + '"'),
        ('--import tsx "' + $owned + '" --eval'),
        ('--eval=foreignCode() "' + $owned + '"')
      )
      $results = foreach ($value in $arguments) {
        Test-InstallerOwnedCommand $root (Join-Path $root 'backend') 'C:\\node.exe' $value
      }
      ConvertTo-Json -InputObject @($results) -Compress
      `,
    );
    assert.deepEqual(result, [false, false, false, true, true, false]);
  }),
);

test(
  'installer rejects a foreign service with an owned-looking Node title before mutations',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
      $script:installationFixtureRoot = ${quote(fixture.directory)}
      $script:mutations = 0
      $script:nativeCalls = 0
      function Get-InstallerNode { return 'C:\\node.exe' }
      function Test-InstallerSchema { param($ProjectRoot,$Node) }
      function Get-InstallerNssm { param($ProjectRoot,$Archive) return 'fixture-tool' }
      function Get-InstallerService { param($Name)
        if ($Name -eq 'AlAgoouz-ERP') {
          return [pscustomobject]@{Name=$Name;State='Running';ProcessId=42;PathName='fixture-image'}
        }
        return $null
      }
      function Invoke-InstallerNative { param($Executable,$Arguments,$Stage)
        $script:nativeCalls++
        if ($Arguments[0] -ne 'get') { $script:mutations++; throw 'Unexpected native mutation.' }
        switch ($Arguments[2]) {
          'AppDirectory' { return (Join-Path $script:installationFixtureRoot 'backend') }
          'Application' { return 'C:\\node.exe' }
          'AppParameters' {
            $owned = Join-Path $script:installationFixtureRoot 'backend\\src\\index.ts'
            $foreign = Join-Path (Split-Path -Parent $script:installationFixtureRoot) 'foreign-checkout\\server.js'
            return ('--title "' + $owned + '" "' + $foreign + '"')
          }
          default { throw 'Unexpected snapshot after foreign-service verification.' }
        }
      }
      function Stop-InstallerService { param($Name) $script:mutations++ }
      function Get-InstallerListeners { throw 'Unexpected listener probe after rejected ownership.' }
      $message = ''
      try { $null = Invoke-ErpServiceInstallation $script:installationFixtureRoot } catch { $message = $_.Exception.Message }
      [pscustomobject]@{Message=$message;NativeCalls=$script:nativeCalls;Mutations=$script:mutations} | ConvertTo-Json -Compress
      `,
      );
      assert.match(result.Message, /Service AlAgoouz-ERP is not owned by this checkout/);
      assert.equal(result.NativeCalls, 3);
      assert.equal(result.Mutations, 0);
    }),
);

const inertArchiveSetup = (fixture) => `
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $archive = ${quote(path.join(fixture.directory, 'inert.zip'))}
  $bytes = [Text.Encoding]::UTF8.GetBytes('INERT TEST DATA - NEVER EXECUTE')
  $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($arch in @('win64','win32')) {
      $entry = $zip.CreateEntry("nssm-$script:NssmRelease/$arch/nssm.exe")
      $stream = $entry.Open(); try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    }
    $slip = $zip.CreateEntry('../do-not-extract.txt')
    $stream = $slip.Open(); try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
  } finally { $zip.Dispose() }
  # Inert content is trusted only within this child test session, never in production.
  $script:NssmArchiveHash = Get-InstallerFileHash $archive
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $hash = ([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-','') } finally { $hasher.Dispose() }
  $script:NssmBinaryHashes = @{win64=$hash;win32=$hash}
`;

test(
  'verified acquisition uses exact archive entries, rejects tampering, reuses cache and preserves neighbours',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
    ${inertArchiveSetup(fixture)}
    $root = ${quote(fixture.directory)}
    $neighbour = Join-Path $root 'scripts\\runtime-tools\\other-operation'
    $null = New-Item -ItemType Directory -Path $neighbour -Force
    [IO.File]::WriteAllText((Join-Path $neighbour 'keep.txt'),'keep')
    $installed = Get-InstallerNssm $root $archive
    $cached = Get-InstallerNssm $root (Join-Path $root 'missing.zip')
    $other = Join-Path $root 'second-project'; $null = New-Item -ItemType Directory -Path $other
    [IO.File]::AppendAllText($archive,'tampered')
    $rejected = $false
    try { $null = Get-InstallerNssm $other $archive } catch { $rejected = $_.Exception.Message -match 'integrity' }
    [IO.File]::WriteAllText($installed,'corrupt cached content')
    $cacheRejected = $false
    try { $null = Get-InstallerNssm $root } catch { $cacheRejected = $_.Exception.Message -match 'integrity' }
    [pscustomobject]@{Cached=($installed -eq $cached);Rejected=$rejected;CacheRejected=$cacheRejected;Neighbour=(Test-Path -LiteralPath (Join-Path $neighbour 'keep.txt'));Slip=(Test-Path -LiteralPath (Join-Path $root 'scripts\\runtime-tools\\do-not-extract.txt'));Stages=@(Get-ChildItem -LiteralPath (Join-Path $root 'scripts\\runtime-tools') -Filter 'erp-nssm-*').Count} | ConvertTo-Json -Compress
  `,
      );
      assert.deepEqual(result, {
        Cached: true,
        Rejected: true,
        CacheRejected: true,
        Neighbour: true,
        Slip: false,
        Stages: 0,
      });
    }),
);

test(
  'transport fallback extracts only the verified inner release without executing package scripts',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
    ${inertArchiveSetup(fixture)}
    $script:fixtureDistribution = ${quote(path.join(fixture.directory, 'inert.nupkg'))}
    $zip = [IO.Compression.ZipFile]::Open($script:fixtureDistribution,[IO.Compression.ZipArchiveMode]::Create)
    try {
      $entry = $zip.CreateEntry("tools/nssm-$script:NssmRelease.zip")
      $inputStream = [IO.File]::OpenRead($archive); $stream = $entry.Open()
      try { $inputStream.CopyTo($stream) } finally { $inputStream.Dispose();$stream.Dispose() }
      $scriptEntry = $zip.CreateEntry('tools/chocolateyinstall.ps1')
      $writer = New-Object IO.StreamWriter($scriptEntry.Open()); try { $writer.Write('throw "PACKAGE SCRIPT MUST NEVER EXECUTE"') } finally { $writer.Dispose() }
    } finally { $zip.Dispose() }
    $script:requests = @()
    function Get-InstallerDownload { param($Uri,$Target)
      $script:requests += $Uri
      if ($Uri.StartsWith('https://nssm.cc/')) { [IO.File]::WriteAllText($Target,'partial transport');throw 'fixture transport failure' }
      Copy-Item -LiteralPath $script:fixtureDistribution -Destination $Target
    }
    $installed = Get-InstallerNssm ${quote(fixture.directory)}
    [pscustomobject]@{Hash=(Get-InstallerFileHash $installed).ToUpperInvariant();Expected=$hash;Requests=$script:requests;Scripts=@(Get-ChildItem -LiteralPath ${quote(path.join(fixture.directory, 'scripts'))} -Recurse -Filter 'chocolateyinstall.ps1').Count} | ConvertTo-Json -Compress
  `,
      );
      assert.equal(result.Hash, result.Expected);
      assert.equal(result.Requests.length, 2);
      assert.equal(result.Scripts, 0);
    }),
);

test(
  'archive layout and byte limits reject missing, oversized and duplicate entries without overwriting files',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
    ${inertArchiveSetup(fixture)}
    $target = ${quote(path.join(fixture.directory, 'copy-target.bin'))}
    $entryName = "nssm-$script:NssmRelease/win64/nssm.exe"
    $result = [ordered]@{}
    foreach ($case in @('missing','oversized','duplicate','existing')) {
      if ($case -eq 'duplicate') {
        $zip = [IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Update)
        try { $null = $zip.CreateEntry($entryName) } finally { $zip.Dispose() }
      }
      if ($case -eq 'existing') {
        $zip = [IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Update)
        try {
          foreach ($entry in @($zip.Entries | Where-Object { $_.FullName -eq $entryName })) { $entry.Delete() }
          $entry = $zip.CreateEntry($entryName); $stream = $entry.Open()
          try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
        } finally { $zip.Dispose() }
        [IO.File]::WriteAllText($target,'neighbour data')
      }
      $name = if ($case -eq 'missing') { 'missing-entry' } else { $entryName }
      $limit = if ($case -eq 'oversized') { 4 } else { 1000 }
      $rejected = $false
      try { Copy-InstallerZipEntry $archive $name $target $limit } catch { $rejected = $true }
      $result[$case] = $rejected
    }
    $result['Preserved'] = [IO.File]::ReadAllText($target) -eq 'neighbour data'
    $result | ConvertTo-Json -Compress
  `,
      );
      assert.deepEqual(result, {
        missing: true,
        oversized: true,
        duplicate: true,
        existing: true,
        Preserved: true,
      });
    }),
);

const withHttpFixture = async (callback) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/payload' });
      res.end();
    } else if (req.url === '/large') {
      res.end('x'.repeat(4096));
    } else if (req.url === '/chunked-large') {
      res.write('x'.repeat(2048));
      res.end('y'.repeat(2048));
    } else if (req.url === '/stall-headers') {
      /* client deadline must abort */
    } else if (req.url === '/stall-body') {
      res.writeHead(200);
      res.write('begin');
    } else if (req.url === '/api/health') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, db: { connected: true } }));
    } else {
      res.end('verified fixture payload');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await callback(server.address().port, requests);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

test(
  'native HTTP download enforces size, redirect and header/body deadlines and closes file handles',
  windowsOnly,
  () =>
    withFixture((fixture) =>
      withHttpFixture(async (port, requests) => {
        const result = await runLibrary(
          fixture,
          `
    $result = [ordered]@{}
    foreach ($name in @('payload','large','chunked-large','redirect','stall-headers','stall-body')) {
      $target = Join-Path ${quote(fixture.directory)} ($name + '.download')
      $clock = [Diagnostics.Stopwatch]::StartNew()
      try {
        if ($name -eq 'payload') { Get-InstallerDownload "http://127.0.0.1:${port}/$name" $target 1024 }
        else { Get-InstallerDownload "http://127.0.0.1:${port}/$name" $target 1024 700 }
        $ok = $true
      } catch { $ok = $false }
      $clock.Stop()
      $closed = $true
      if (Test-Path -LiteralPath $target) { try { $stream = [IO.File]::Open($target,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$stream.Dispose() } catch { $closed = $false } }
      $bytes = if (Test-Path -LiteralPath $target) { (Get-Item -LiteralPath $target).Length } else { -1 }
      $result[$name] = @{Ok=$ok;Elapsed=$clock.ElapsedMilliseconds;Closed=$closed;Bytes=$bytes}
    }
    $result | ConvertTo-Json -Depth 4 -Compress
  `,
          true,
        );
        assert.equal(result.payload.Ok, true, JSON.stringify(result));
        for (const name of ['large', 'chunked-large', 'redirect', 'stall-headers', 'stall-body']) {
          assert.equal(result[name].Ok, false, name);
          assert.equal(result[name].Closed, true, name);
          assert.ok(result[name].Elapsed < 5000, `${name}: ${result[name].Elapsed}ms`);
        }
        assert.equal(
          result['stall-body'].Bytes,
          5,
          'Receive the body prefix before testing a stalled read',
        );
        for (const name of Object.keys(result)) assert.ok(requests.includes(`/${name}`), name);
        assert.equal(
          requests.filter((url) => url === '/payload').length,
          1,
          'A redirect must never request the payload',
        );
      }),
    ),
);

test(
  'a healthy endpoint is accepted only when its listener belongs to the running service',
  windowsOnly,
  () =>
    withFixture((fixture) =>
      withHttpFixture(async (port, requests) => {
        const result = await runLibrary(
          fixture,
          `
    function Get-InstallerService { param($Name) return [pscustomobject]@{State='Running';ProcessId=123} }
    function Get-InstallerListeners { param($Port) return 456 }
    $script:owned = $true
    function Test-InstallerProcessAncestor { param($ProcessId,$Owners) return $script:owned }
    Wait-InstallerHealthy 'FixtureService' 1 ${port}
    $script:owned = $false
    $rejected = $false
    try { Wait-InstallerHealthy 'FixtureService' 1 ${port} } catch { $rejected = $true }
    [pscustomobject]@{Accepted=$true;ForeignRejected=$rejected} | ConvertTo-Json -Compress
  `,
          true,
        );
        assert.deepEqual(result, { Accepted: true, ForeignRejected: true });
        assert.equal(requests.filter((url) => url === '/api/health').length, 1);
      }),
    ),
);

test(
  'service image interop compiles in Windows PowerShell and rejects an absent service',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
    $name = 'ErpInstallerAbsentFixture-' + [guid]::NewGuid().ToString('N')
    $rejected = $false
    try { Set-InstallerServiceImagePath $name '"C:\\inert-test-only.exe"' } catch { $rejected = $true }
    [pscustomobject]@{Compiled=($null -ne ('ErpInstaller.ServiceConfig' -as [type]));Rejected=$rejected} | ConvertTo-Json -Compress
  `,
      );
      assert.deepEqual(result, { Compiled: true, Rejected: true });
    }),
);

test(
  'native stderr and a nonzero exit are reported without raw credential-bearing output',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const executable = path.join(fixture.directory, 'failed-native.cmd');
      writeFileSync(
        executable,
        '@echo off\r\necho FIXTURE_PRIVATE_CREDENTIAL 1>&2\r\nexit /b 17\r\n',
      );
      const result = runLibrary(
        fixture,
        `
    $message = ''
    try { $null = Invoke-InstallerNative ${quote(executable)} @('test') 'fixture native boundary' } catch { $message = $_.Exception.Message }
    [pscustomobject]@{Message=$message} | ConvertTo-Json -Compress
  `,
      );
      assert.match(result.Message, /Native command failed.*fixture native boundary.*exit 17/);
      assert.ok(!result.Message.includes('FIXTURE_PRIVATE_CREDENTIAL'));
    }),
);

test('a failed schema gate prevents acquisition and every startup mutation', windowsOnly, () =>
  withFixture((fixture) => {
    const result = runLibrary(
      fixture,
      `
    $script:events = @()
    function Get-InstallerNode { return 'fixture-node' }
    function Test-InstallerSchema { throw 'fixture database schema not ready' }
    function Get-InstallerNssm { $script:events += 'tool';throw 'must not acquire' }
    function Get-InstallerPlan { $script:events += 'plan';throw 'must not inspect startup' }
    function Disable-ScheduledTask { $script:events += 'task';throw 'must not mutate' }
    $message = ''
    try { $null = Invoke-ErpServiceInstallation ${quote(fixture.directory)} } catch { $message = $_.Exception.Message }
    [pscustomobject]@{Message=$message;Events=@($script:events)} | ConvertTo-Json -Compress
  `,
    );
    assert.equal(result.Message, 'fixture database schema not ready');
    assert.deepEqual(result.Events, []);
  }),
);

test(
  'startup inventory scopes PM2 by checkout, retains shared resurrection and preserves disabled state',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
    $root = ${quote(fixture.directory)}
    function Get-InstallerService { return $null }
    function Get-ScheduledTask { param($TaskName,$ErrorAction)
      if ($TaskName -ne 'BinAlAjouzERP') { return $null }
      return [pscustomobject]@{TaskPath='\\';Settings=[pscustomobject]@{Enabled=$false};Actions=@([pscustomobject]@{WorkingDirectory=(Join-Path $root 'backend');Execute='C:\\pm2.ps1';Arguments='resurrect'})}
    }
    function Get-Command { param($Name,$ErrorAction) return [pscustomobject]@{Source='fixture-pm2'} }
    $script:foreign = $false
    function Invoke-InstallerNative { param($Executable,$Arguments,$Stage)
      if (($Arguments -join '|') -ne '--silent|jlist') { throw 'Expected quiet inventory only' }
      $entryPath = if ($script:foreign) { Join-Path (Split-Path -Parent $root) 'foreign\\server.js' } else { Join-Path $root 'backend\\src\\index.ts' }
      ConvertTo-Json -InputObject @(
        [pscustomobject]@{name='bin-al-ajouz-erp';pm_id=7;pid=77;pm2_env=[pscustomobject]@{pm_cwd=(Join-Path $root 'backend');pm_exec_path=$entryPath;status='online'}},
        [pscustomobject]@{name='unrelated-app';pm_id=8;pid=88;pm2_env=[pscustomobject]@{pm_cwd='C:\\other-app';pm_exec_path='C:\\other-app\\server.js';status='online'}}
      ) -Depth 5 -Compress
    }
    $plan = Get-InstallerPlan $root 'fixture-tool'
    $script:foreign = $true
    $rejected = $false
    try { $null = Get-InstallerPlan $root 'fixture-tool' } catch { $rejected = $_.Exception.Message -match 'not owned' }
    [pscustomobject]@{Ids=@($plan.Apps.Id);Retain=$plan.Tasks[0].Retain;Enabled=$plan.Tasks[0].Enabled;ForeignRejected=$rejected} | ConvertTo-Json -Compress
  `,
      );
      assert.deepEqual(result, { Ids: [7], Retain: true, Enabled: false, ForeignRejected: true });
    }),
);

test(
  'new registration ownership verifies its manager, runtime and actual entry point before rollback',
  windowsOnly,
  () =>
    withFixture((fixture) => {
      const result = runLibrary(
        fixture,
        `
    $root = ${quote(fixture.directory)}
    $manager = Join-Path $root 'scripts\\runtime-tools\\nssm.exe'
    $node = 'C:\\Node\\node.exe'
    $script:mode = 'owned'
    function Get-InstallerService {
      if ($script:mode -eq 'absent') { return $null }
      $image = if ($script:mode -eq 'foreign-manager') { 'C:\\Foreign\\manager.exe' } else { '"' + $manager + '"' }
      return [pscustomobject]@{PathName=$image;State='Stopped'}
    }
    function Invoke-InstallerNative { param($Executable,$Arguments,$Stage)
      if ($script:mode -eq 'incomplete') { throw 'fixture absent registry field' }
      switch ($Arguments[2]) {
        Application { if ($script:mode -eq 'foreign-runtime') { 'C:\\Foreign\\node.exe' } else { $node } }
        AppDirectory { Join-Path $root 'backend' }
        AppParameters { if ($script:mode -eq 'foreign-entry') { 'C:\\Foreign\\server.js' } else { '--import tsx "' + (Join-Path $root 'backend\\src\\index.ts') + '"' } }
      }
    }
    $result = [ordered]@{}
    foreach ($mode in @('owned','foreign-manager','foreign-runtime','foreign-entry','incomplete','absent')) {
      $script:mode = $mode
      $result[$mode] = Test-InstallerNewRegistration 'FixtureName' $root $manager $node
    }
    $result | ConvertTo-Json -Compress
  `,
      );
      assert.deepEqual(result, {
        owned: true,
        'foreign-manager': false,
        'foreign-runtime': false,
        'foreign-entry': false,
        incomplete: false,
        absent: true,
      });
    }),
);

for (const script of ['register-autostart.ps1', 'install-windows-startup.ps1']) {
  for (const code of [0, 17]) {
    test(`${script} preserves nested installer exit ${code} after relocation`, windowsOnly, () =>
      withFixture((fixture) => {
        copyFileSync(
          fileURLToPath(new URL(`./${script}`, import.meta.url)),
          path.join(fixture.scripts, script),
        );
        writeFileSync(fixture.installer, `exit ${code}\n`);
        const result = spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            path.join(fixture.scripts, script),
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 15000 },
        );
        assert.ifError(result.error);
        assert.equal(result.status, code, result.stdout + result.stderr);
      }),
    );
  }
}
