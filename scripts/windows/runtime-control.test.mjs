import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildWindowsRestartScript } from '../maintenance/windowsRestart.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const windowsOnly = { skip: process.platform !== 'win32' };
const withFixture = (callback) => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "erp-runtime-fixture-relocated & owner's project-"),
  );
  mkdirSync(path.join(directory, 'backend', 'src'), { recursive: true });
  mkdirSync(path.join(directory, 'frontend', 'dist'), { recursive: true });
  mkdirSync(path.join(directory, 'scripts', 'windows'), { recursive: true });
  writeFileSync(path.join(directory, 'frontend', 'dist', 'index.html'), '<!doctype html>Fixture');
  const systemSource = readFileSync(path.join(root, 'system.ps1'), 'utf8');
  // Retain real function bodies; omit only the interactive/CLI dispatcher from this library fixture.
  writeFileSync(
    path.join(directory, 'system.ps1'),
    systemSource.slice(0, systemSource.indexOf('if ($Action)')),
  );
  for (const name of ['process-ownership.ps1', 'runtime-control.ps1']) {
    const source = path.join(root, 'scripts', 'windows', name);
    if (existsSync(source)) copyFileSync(source, path.join(directory, 'scripts', 'windows', name));
  }
  // Keep updater routing intact; replace only its child-scope database/Node prerequisite boundary.
  const restart = buildWindowsRestartScript();
  assert.ok(restart.includes('\nStart-ErpRuntime '));
  writeFileSync(
    path.join(directory, 'restart.ps1'),
    restart.replace(
      '\nStart-ErpRuntime ',
      '\nfunction Test-ErpRuntimePrerequisites { param($ProjectRoot) return "C:\\fixture-node.exe" }\nStart-ErpRuntime ',
    ),
  );
  try {
    return callback(directory);
  } finally {
    const resolved = realpathSync(directory);
    assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
    assert.match(path.basename(resolved), /^erp-runtime-fixture-/);
    rmSync(resolved, { recursive: true, force: true });
  }
};

const runController = (directory, scenario, operation = 'stop') => {
  const program = path.join(directory, 'test-driver.ps1');
  writeFileSync(
    program,
    `
    $ErrorActionPreference = 'Stop'
    $global:runtimeFixtureScenario = ${quote(scenario)}
    $global:runtimeFixtureEvents = New-Object 'System.Collections.Generic.List[string]'
    $global:runtimeFixtureRoot = ${quote(directory)}
    $global:runtimeFixtureForeign = Join-Path (Split-Path -Parent $global:runtimeFixtureRoot) 'foreign-checkout'
    $global:runtimeFixtureNodePresent = $global:runtimeFixtureScenario -in @('foreign-node','owned-node','missing-database-health','owned-healthy','pid-reuse','unhealthy-pm2')
    $global:runtimeFixtureStarted = $false
    $global:runtimeFixtureServicePresent = $global:runtimeFixtureScenario -in @('foreign-service','owned-service','service-reassigned')
    $global:runtimeFixtureServiceState = 'Running'
    $global:runtimeFixturePm2Present = $global:runtimeFixtureScenario -in @('foreign-pm2','owned-pm2','invalid-pm2-state','pm2-delete-failure','pm2-reassigned','unhealthy-pm2')
    $global:runtimeFixtureCimReads = 0
    $global:runtimeFixtureServiceReads = 0
    $global:runtimeFixturePm2Reads = 0
    function Get-Service { param($Name,$ErrorAction)
      if ($Name -eq 'postgresql*') { return [pscustomobject]@{Status='Stopped';DisplayName='Unrelated local PostgreSQL'} }
      if ($global:runtimeFixtureServicePresent) { return [pscustomobject]@{Status=$global:runtimeFixtureServiceState;Name='AlAgoouz-ERP'} | Add-Member -MemberType ScriptMethod -Name WaitForStatus -Value { param($status,$timeout) if ($global:runtimeFixtureServiceState -ne $status) { throw 'FIXTURE_WAIT_STATE' } } -PassThru }
      return $null
    }
    function Get-CimInstance { param($ClassName,$Filter,$ErrorAction)
      if ($ClassName -eq 'Win32_Service') {
        $global:runtimeFixtureServiceReads++
        if ($global:runtimeFixtureServicePresent) { return [pscustomobject]@{State=$global:runtimeFixtureServiceState;ProcessId=55;PathName='C:\\fixture-service.exe'} }
        return $null
      }
      $global:runtimeFixtureCimReads++
      if ($global:runtimeFixtureScenario -eq 'inventory-failure') { throw 'FIXTURE_INVENTORY_FAILURE' }
      if ($global:runtimeFixtureStarted) {
        return [pscustomobject]@{Name='node.exe';ProcessId=201;ParentProcessId=0;CommandLine=('C:\\node.exe "' + (Join-Path $global:runtimeFixtureRoot 'backend\\src\\index.ts') + '"');CreationDate=[datetime]'2026-01-02'}
      }
      if (-not $global:runtimeFixtureNodePresent) { return $null }
      if ($Filter -like 'ProcessId=*' -and $Filter -ne 'ProcessId=77') { return $null }
      $command = if ($global:runtimeFixtureScenario -eq 'foreign-node') { 'C:\\node.exe src/index.ts "' + $global:runtimeFixtureRoot + '"' } else { 'C:\\node.exe --import tsx "' + (Join-Path $global:runtimeFixtureRoot 'backend\\src\\index.ts') + '"' }
      if ($global:runtimeFixtureScenario -eq 'pid-reuse' -and $global:runtimeFixtureCimReads -gt 1) { $command = 'C:\\node.exe C:\\unrelated\\index.ts' }
      return [pscustomobject]@{Name='node.exe';ProcessId=77;ParentProcessId=0;ExecutablePath='C:\\node.exe';CommandLine=$command;CreationDate=[datetime]'2026-01-01'}
    }
    function Get-ItemProperty { param($LiteralPath,$Path,$ErrorAction)
      if ($global:runtimeFixtureScenario -eq 'owned-service' -or ($global:runtimeFixtureScenario -eq 'service-reassigned' -and $global:runtimeFixtureServiceReads -lt 2)) { return [pscustomobject]@{Application='C:\\node.exe';AppDirectory=(Join-Path $global:runtimeFixtureRoot 'backend');AppParameters='--import tsx src/index.ts'} }
      return [pscustomobject]@{Application='C:\\node.exe';AppDirectory=$global:runtimeFixtureForeign;AppParameters='src/index.ts'}
    }
    function Get-NetTCPConnection { param($LocalPort,$State,$ErrorAction)
      if ($global:runtimeFixtureStarted) { return [pscustomobject]@{OwningProcess=201;LocalPort=3000} }
      if ($global:runtimeFixtureNodePresent -or $global:runtimeFixtureScenario -eq 'foreign-health') { return [pscustomobject]@{OwningProcess=77;LocalPort=3000} }
      return $null
    }
    function Stop-Process { param($Id,[switch]$Force,$ErrorAction) $global:runtimeFixtureEvents.Add('stop-process:'+ $Id);$global:runtimeFixtureNodePresent=$false }
    function Stop-Service { param($Name,$ErrorAction) $global:runtimeFixtureEvents.Add('stop-service:'+ $Name);$global:runtimeFixtureServiceState='Stopped' }
    function Restart-Service { param($Name,$ErrorAction) $global:runtimeFixtureEvents.Add('restart-service:'+ $Name) }
    function Start-Service { param($Name,$ErrorAction) $global:runtimeFixtureEvents.Add('start-service:'+ $Name);$global:runtimeFixtureServiceState='Running';$global:runtimeFixtureStarted=$true }
    function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,$RedirectStandardOutput,$RedirectStandardError,[switch]$PassThru)
      $global:runtimeFixtureEvents.Add('start-process:'+ $FilePath)
      if ($FilePath -ne 'http://localhost:3000') { $global:runtimeFixtureStarted=$true }
      return [pscustomobject]@{Id=201}
    }
    function Start-Sleep { param($Seconds,$Milliseconds) }
    function Invoke-RestMethod { param($Uri,$TimeoutSec,$ErrorAction,$MaximumRedirection)
      if ($global:runtimeFixtureScenario -in @('foreign-health','missing-database-health','unhealthy-pm2') -and -not $global:runtimeFixtureStarted) { return [pscustomobject]@{success=$true} }
      return [pscustomobject]@{success=$true;db=[pscustomobject]@{connected=$true}}
    }
    function Fixture-Pm2 {
      $global:runtimeFixtureEvents.Add('pm2:'+ ($args -join '|'))
      $global:LASTEXITCODE=0
      if ($args -contains 'jlist') {
        $global:runtimeFixturePm2Reads++
        if ($global:runtimeFixtureScenario -eq 'invalid-pm2-state') { $state='launching' } else { $state='stopped' }
        $cwd = if ($global:runtimeFixtureScenario -eq 'foreign-pm2' -or ($global:runtimeFixtureScenario -eq 'pm2-reassigned' -and $global:runtimeFixturePm2Reads -gt 1)) { $global:runtimeFixtureForeign } else { Join-Path $global:runtimeFixtureRoot 'backend' }
        ConvertTo-Json -InputObject @([pscustomobject]@{name='bin-al-ajouz-erp';pm_id=7;pid=0;pm2_env=[pscustomobject]@{pm_cwd=$cwd;pm_exec_path=(Join-Path $cwd 'src\\index.ts');status=$state}}) -Depth 5 -Compress
      }
    }
    function Get-Command { param($Name,$ErrorAction)
      if ($Name -eq 'pm2' -and $global:runtimeFixturePm2Present) { return [pscustomobject]@{Source='Fixture-Pm2'} }
      if ($Name -eq 'node') { return [pscustomobject]@{Source='C:\\fixture-node.exe';CommandType='Application'} }
      return $null
    }
    . ${quote(path.join(directory, 'system.ps1'))}
    # Database/schema execution and native process managers are isolated OS boundaries.
    function Test-ErpRuntimePrerequisites { param($ProjectRoot) if ($global:runtimeFixtureScenario -eq 'schema-failure') { throw 'FIXTURE_SCHEMA_FAILURE' }; return 'C:\\fixture-node.exe' }
    function Invoke-ErpNativeCommand { param($Executable,$Arguments,$Stage)
      if ($Executable -eq 'Fixture-Pm2') { if ($global:runtimeFixtureScenario -eq 'pm2-delete-failure' -and $Arguments -contains 'delete') { throw 'FIXTURE_PM2_DELETE_FAILED' }; return Fixture-Pm2 @Arguments }
      return ''
    }
    $errorText = ''
    $exitCode = 0
    $global:LASTEXITCODE = 0
    try {
      if (${quote(operation)} -eq 'restart-script') { & ${quote(path.join(directory, 'restart.ps1'))};$exitCode=$LASTEXITCODE }
      elseif (${quote(operation)} -eq 'start') { Start-SystemServer -Silent }
      elseif (${quote(operation)} -eq 'start-visible') { Start-SystemServer }
      elseif (${quote(operation)} -eq 'failed-start-cleanup') { function Wait-ErpRuntimeHealthy { throw 'FIXTURE_READINESS_FAILURE' }; Start-ErpRuntime $global:runtimeFixtureRoot }
      else { Stop-SystemServer }
    } catch { $errorText = $_.Exception.Message; $exitCode=1 }
    [pscustomobject]@{Error=$errorText;ExitCode=$exitCode;Events=@($global:runtimeFixtureEvents)} | ConvertTo-Json -Depth 5 -Compress
  `,
  );
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', program],
    { encoding: 'utf8', windowsHide: true, timeout: 40000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const line = result.stdout
    .split(/\r?\n/)
    .filter((value) => value.startsWith('{'))
    .at(-1);
  assert.ok(line, result.stdout + result.stderr);
  return JSON.parse(line);
};

test(
  'stop does not kill a foreign relative entry point with an incidental project argument',
  windowsOnly,
  () =>
    withFixture((directory) => {
      const result = runController(directory, 'foreign-node');
      assert.ok(
        !result.Events.some((event) => event.startsWith('stop-process:')),
        JSON.stringify(result),
      );
    }),
);
test(
  'stop refuses a foreign PM2 entry using the ERP name before any deletion or save',
  windowsOnly,
  () =>
    withFixture((directory) => {
      const result = runController(directory, 'foreign-pm2');
      assert.notEqual(result.ExitCode, 0, JSON.stringify(result));
      assert.ok(
        !result.Events.some((event) => event.includes('delete') || event.includes('save')),
        JSON.stringify(result),
      );
    }),
);
test('stop refuses a same-name foreign service before touching it', windowsOnly, () =>
  withFixture((directory) => {
    const result = runController(directory, 'foreign-service');
    assert.notEqual(result.ExitCode, 0, JSON.stringify(result));
    assert.ok(
      !result.Events.some((event) => event.startsWith('stop-service:')),
      JSON.stringify(result),
    );
  }),
);
test(
  'start refuses foreign health without opening a browser or starting unrelated PostgreSQL',
  windowsOnly,
  () =>
    withFixture((directory) => {
      const result = runController(directory, 'foreign-health', 'start');
      assert.notEqual(result.ExitCode, 0, JSON.stringify(result));
      assert.deepEqual(result.Events, []);
    }),
);
test('the updater refuses a same-name foreign service before restart', windowsOnly, () =>
  withFixture((directory) => {
    const result = runController(directory, 'foreign-service', 'restart-script');
    assert.notEqual(result.ExitCode, 0, JSON.stringify(result));
    assert.ok(
      !result.Events.some((event) => event.startsWith('restart-service:')),
      JSON.stringify(result),
    );
  }),
);
test('stop recognizes a quoted absolute backend entry in a relocated project', windowsOnly, () =>
  withFixture((directory) => {
    const result = runController(directory, 'owned-node');
    assert.equal(result.ExitCode, 0, JSON.stringify(result));
    assert.deepEqual(result.Events, ['stop-process:77']);
  }),
);

for (const [scenario, operation, expected] of [
  ['owned-service', 'stop', ['stop-service:AlAgoouz-ERP']],
  ['owned-service', 'restart-script', ['stop-service:AlAgoouz-ERP', 'start-service:AlAgoouz-ERP']],
  ['owned-healthy', 'start', []],
  ['owned-healthy', 'start-visible', ['start-process:http://localhost:3000']],
  ['missing-database-health', 'start', ['stop-process:77', 'start-process:C:\\fixture-node.exe']],
  ['empty', 'start', ['start-process:C:\\fixture-node.exe']],
]) {
  test(
    `${operation} handles ${scenario} and establishes readiness before success`,
    windowsOnly,
    () =>
      withFixture((directory) => {
        const result = runController(directory, scenario, operation);
        assert.equal(result.ExitCode, 0, JSON.stringify(result));
        assert.deepEqual(result.Events, expected);
      }),
  );
}

for (const [scenario, operation] of [
  ['inventory-failure', 'stop'],
  ['schema-failure', 'start'],
  ['pid-reuse', 'stop'],
  ['invalid-pm2-state', 'stop'],
  ['service-reassigned', 'stop'],
  ['pm2-reassigned', 'stop'],
  ['unhealthy-pm2', 'start'],
]) {
  test(`${operation} refuses ${scenario} before any mutation`, windowsOnly, () =>
    withFixture((directory) => {
      const result = runController(directory, scenario, operation);
      assert.notEqual(result.ExitCode, 0, JSON.stringify(result));
      assert.ok(
        !result.Events.some(
          (event) =>
            event.startsWith('stop-') ||
            event.startsWith('start-') ||
            event.includes('delete') ||
            event.includes('save'),
        ),
        JSON.stringify(result),
      );
    }),
  );
}

test('a newly launched backend is stopped when its readiness check fails', windowsOnly, () =>
  withFixture((directory) => {
    const result = runController(directory, 'empty', 'failed-start-cleanup');
    assert.notEqual(result.ExitCode, 0, JSON.stringify(result));
    assert.deepEqual(result.Events, ['start-process:C:\\fixture-node.exe', 'stop-process:201']);
  }),
);

test(
  'owned PM2 entries are deleted by ID and persistence is skipped on deletion failure',
  windowsOnly,
  () =>
    withFixture((directory) => {
      const success = runController(directory, 'owned-pm2');
      assert.equal(success.ExitCode, 0, JSON.stringify(success));
      assert.deepEqual(
        success.Events.filter((event) => !event.includes('jlist')),
        ['pm2:delete|7', 'pm2:save|--force'],
      );
      const failure = runController(directory, 'pm2-delete-failure');
      assert.notEqual(failure.ExitCode, 0, JSON.stringify(failure));
      assert.ok(!failure.Events.some((event) => event.includes('save')), JSON.stringify(failure));
    }),
);

test(
  'native argument encoding preserves quotes, spaces, trailing slashes and shell characters',
  windowsOnly,
  () =>
    withFixture((directory) => {
      const entry = path.join(directory, 'argv-fixture.cjs');
      writeFileSync(entry, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
      const values = [
        "owner's path & file",
        'quote"inside',
        'C:\\trailing\\',
        '',
        'two\\\\"slashes',
      ];
      const program = path.join(directory, 'argv-driver.ps1');
      writeFileSync(
        program,
        `. ${quote(path.join(directory, 'scripts/windows/process-ownership.ps1'))}\n$arguments = ConvertTo-ErpNativeArguments @(${[entry, ...values].map(quote).join(',')})\n$p=Start-Process -FilePath ${quote(process.execPath)} -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput ${quote(path.join(directory, 'argv.json'))}\nexit $p.ExitCode`,
      );
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-File', program],
        { encoding: 'utf8', windowsHide: true, timeout: 40000 },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'argv.json'), 'utf8')), values);
    }),
);

for (const name of ['start-erp.ps1', 'stop-erp.ps1']) {
  test(`${name} preserves a delegated startup/control failure`, windowsOnly, () =>
    withFixture((directory) => {
      copyFileSync(
        path.join(root, 'scripts/windows', name),
        path.join(directory, 'scripts/windows', name),
      );
      writeFileSync(
        path.join(directory, 'system.ps1'),
        'param($Action)\nWrite-Output $Action\nexit 17',
      );
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-File', path.join(directory, 'scripts/windows', name)],
        { encoding: 'utf8', windowsHide: true, timeout: 40000 },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 17, result.stdout + result.stderr);
    }),
  );
}

test(
  'Node option values and application arguments cannot change entry-point ownership',
  windowsOnly,
  () =>
    withFixture((directory) => {
      const backendEntry = path.join(directory, 'backend/src/index.ts');
      const inertEntry = path.join(directory, 'inert-other.cjs');
      writeFileSync(backendEntry, '# INERT_FIXTURE_ONLY=1\n');
      writeFileSync(inertEntry, 'process.stdout.write("inert")');
      const flags = ['--title', '--conditions', '--env-file', '--redirect-warnings'];
      // Prove these options really consume a separate value on the pinned Node runtime.
      for (const flag of flags) {
        const child = spawnSync(process.execPath, [flag, backendEntry, inertEntry], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 15000,
        });
        assert.ifError(child.error);
        assert.equal(child.status, 0, child.stderr);
        assert.equal(child.stdout, 'inert');
      }
      const program = path.join(directory, 'ownership-options.ps1');
      writeFileSync(
        program,
        `. ${quote(path.join(directory, 'scripts/windows/process-ownership.ps1'))}\n$root=${quote(directory)}\n$entry=${quote(backendEntry)}\n$other=${quote(inertEntry)}\n$values=@()\nforeach($flag in @(${flags.map(quote).join(',')})) {\n $line='C:\\node.exe ' + $flag + ' "' + $entry + '" "' + $other + '"'\n $values += Test-ErpRuntimeProcess $root ([pscustomobject]@{Name='node.exe';CommandLine=$line})\n}\nforeach($line in @(('C:\\node.exe --unrecognized-flag "'+$entry+'"'), ('C:\\node.exe "'+$entry+'" --eval app-argument'), ('C:\\node.exe --watch --import tsx "'+$entry+'"'))) { $values += Test-ErpRuntimeProcess $root ([pscustomobject]@{Name='node.exe';CommandLine=$line}) }\nConvertTo-Json -InputObject $values -Compress`,
      );
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-File', program],
        { encoding: 'utf8', windowsHide: true, timeout: 40000 },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.deepEqual(JSON.parse(result.stdout.trim()), [
        false,
        false,
        false,
        false,
        false,
        true,
        true,
      ]);
    }),
);
