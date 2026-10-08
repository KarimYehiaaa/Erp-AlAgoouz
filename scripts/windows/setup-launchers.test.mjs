import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

const assertReportedDirectory = (stdout, marker, expected) => {
  const reported = stdout.split(/\r?\n/).find((line) => line.startsWith(`${marker}=`));
  assert.ok(reported, stdout);
  const actualPath = realpathSync(reported.slice(marker.length + 1));
  const expectedPath = realpathSync(expected);
  const actualDirectory = statSync(actualPath, { bigint: true });
  const expectedDirectory = statSync(expectedPath, { bigint: true });
  const message = `Reported directory does not match fixture: ${JSON.stringify({ actualPath, expectedPath })}`;
  assert.ok(actualDirectory.isDirectory() && expectedDirectory.isDirectory(), message);
  // realpathSync's JS implementation preserves Windows 8.3 names. Filesystem
  // identity, rather than a spelling comparison, proves these aliases match.
  assert.equal(actualDirectory.dev, expectedDirectory.dev, message);
  assert.equal(actualDirectory.ino, expectedDirectory.ino, message);
};

for (const [script, command] of [
  ['setup.ps1', 'run|setup'],
  ['setup-database.ps1', 'run|setup-db|-w|backend'],
  ['backup-system.ps1', 'run|backup'],
]) {
  for (const exitCode of [0, 17]) {
    test(
      `${script} delegates from the project root and preserves exit ${exitCode}`,
      {
        skip: process.platform !== 'win32',
      },
      () => {
        // Replace npm in the child session: no installation, database access or Docker starts.
        const source = `
        function global:npm {
          Write-Output ('MOCK_COMMAND=' + ($args -join '|'))
          Write-Output ('MOCK_CWD=' + (Get-Location).Path)
          $global:LASTEXITCODE = ${exitCode}
        }
        & ${quote(path.join(root, 'scripts', 'windows', script))}
        exit $LASTEXITCODE
      `;
        const result = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', source],
          {
            cwd: path.parse(root).root,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
          },
        );
        assert.ifError(result.error);
        assert.equal(result.status, exitCode, result.stderr);
        assert.ok(result.stdout.includes(`MOCK_COMMAND=${command}`), result.stdout);
        assert.ok(result.stdout.includes(`MOCK_CWD=${root}`), result.stdout);
        if (exitCode !== 0) assert.ok(!result.stdout.includes('setup completed'), result.stdout);
      },
    );
  }
}

const withLauncherFixture = (callback) => {
  // Windows can expose TEMP through its 8.3 alias while PowerShell resolves the
  // same directory to the long name. Compare the actual directory identity.
  const directory = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'erp-cashier-launcher relocated-')),
  );
  const launchers = path.join(directory, 'scripts', 'windows', 'launchers');
  mkdirSync(launchers, { recursive: true });
  try {
    callback(directory, launchers);
  } finally {
    const resolved = realpathSync(directory);
    assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
    assert.match(path.basename(resolved), /^erp-cashier-launcher relocated-/);
    rmSync(resolved, { recursive: true, force: true });
  }
};

const runBatch = (script, options = {}) =>
  spawnSync('cmd.exe', ['/d', '/s', '/c', `"call "${script}""`], {
    encoding: 'utf8',
    windowsVerbatimArguments: true,
    windowsHide: true,
    timeout: 15000,
    ...options,
  });

for (const scenario of ['stopped', 'refused', 'still-listening']) {
  test(
    `owned port CLI from a relocated copy preserves the actual child result: ${scenario}`,
    { skip: process.platform !== 'win32' },
    () =>
      withLauncherFixture((directory, launchers) => {
        const maintenance = path.join(directory, 'scripts', 'maintenance');
        mkdirSync(maintenance);
        for (const name of ['kill-port.ts', 'ownedLinuxPort.ts'])
          copyFileSync(
            path.join(root, 'scripts', 'maintenance', name),
            path.join(maintenance, name),
          );
        writeFileSync(
          path.join(path.dirname(launchers), 'runtime-control.ps1'),
          `
        function Stop-ErpRuntime { param($ProjectRoot)
          Write-Output ('MOCK_STOP_ROOT=' + $ProjectRoot)
          ${scenario === 'refused' ? "throw 'Isolated ownership refusal'" : ''}
        }
        function Get-ErpRuntimeListeners { ${scenario === 'still-listening' ? 'return 991' : 'return @()'} }
      `,
        );
        const result = spawnSync(process.execPath, [path.join(maintenance, 'kill-port.ts')], {
          cwd: tmpdir(),
          windowsHide: true,
          encoding: 'utf8',
          timeout: 15000,
          env: { ...process.env, NODE_OPTIONS: '' },
        });
        assert.ifError(result.error);
        assert.equal(result.status, scenario === 'stopped' ? 0 : 1, result.stdout + result.stderr);
        assertReportedDirectory(result.stdout, 'MOCK_STOP_ROOT', directory);
        assert.equal(
          result.stdout.includes('تم التحقق من تحرير المنفذ 3000'),
          scenario === 'stopped',
          result.stdout,
        );
        assert.equal(
          result.stderr.includes('تعذر إثبات تحرير المنفذ 3000 بأمان'),
          scenario !== 'stopped',
          result.stderr,
        );
      }),
  );
}

for (const filename of ['start-silent.bat', 'start-frontend.bat']) {
  for (const startExit of [0, 17]) {
    test(
      `legacy ${filename} uses the unified readiness controller and preserves exit ${startExit}`,
      { skip: process.platform !== 'win32' },
      () =>
        withLauncherFixture((directory, launchers) => {
          const script = path.join(path.dirname(launchers), filename);
          const source = readFileSync(path.join(root, 'scripts', 'windows', filename), 'utf8');
          // Replace only native boundaries: the old VBS GUI runner and global
          // frontend executable must never run during a failing fixture.
          const fixtureSource = source
            .replace(/^\s*powershell\.exe\b/gim, 'call powershell')
            .replace(/^\s*wscript\.exe\b[^\r\n]*\r?$/gim, 'echo MOCK_UNVERIFIED_VBS')
            .replace(/^\s*timeout\b[^\r\n]*\r?$/gim, 'ver >nul')
            .replace(/^\s*(?:call\s+)?serve\b[^\r\n]*\r?$/gim, 'echo MOCK_SEPARATE_FRONTEND');
          assert.doesNotMatch(fixtureSource, /^\s*(?:wscript\.exe|powershell\.exe|serve)\b/im);
          writeFileSync(script, fixtureSource);
          mkdirSync(path.join(directory, 'frontend'));
          const bin = path.join(directory, 'test-bin');
          mkdirSync(bin);
          writeFileSync(
            path.join(bin, 'powershell.cmd'),
            `@echo off\r\necho MOCK_CWD=%cd%\r\necho MOCK_ARGS=%*\r\nexit /b ${startExit}\r\n`,
          );
          const result = runBatch(script, {
            cwd: tmpdir(),
            env: { ...process.env, PATH: `${bin};${process.env.PATH}` },
          });
          assert.ifError(result.error);
          assert.equal(result.status, startExit, result.stdout + result.stderr);
          assert.ok(result.stdout.includes(`MOCK_CWD=${directory}`), result.stdout);
          assert.ok(
            result.stdout.includes(`-File "${path.join(directory, 'system.ps1')}" start -Silent`),
            result.stdout,
          );
          assert.ok(!result.stdout.includes('MOCK_SEPARATE_FRONTEND'), result.stdout);
          assert.ok(!result.stdout.includes('MOCK_UNVERIFIED_VBS'), result.stdout);
          if (startExit !== 0) assert.ok(!result.stdout.includes('already in use'), result.stdout);
        }),
    );
  }
}

for (const restartExit of [0, 17]) {
  test(
    `legacy restart uses only the owned runtime controller and preserves exit ${restartExit}`,
    { skip: process.platform !== 'win32' },
    () =>
      withLauncherFixture((directory, launchers) => {
        const script = path.join(path.dirname(launchers), 'restart.bat');
        const source = readFileSync(path.join(root, 'scripts/windows/restart.bat'), 'utf8');
        // Execute CMD branching and relative paths, substituting dangerous native
        // boundaries in the old launcher so a red test cannot stop real programs.
        const fixtureSource = source
          .replace(/^net session >nul 2>&1\r?$/m, 'ver >nul')
          .replace(/^\s*(?:call\s+)?taskkill\b[^\r\n]*\r?$/gim, 'echo MOCK_GLOBAL_NODE_KILL')
          .replace(/^timeout[^\r\n]*\r?$/gm, 'ver >nul')
          .replace(/^npm run dev\r?$/m, 'call npm run dev')
          .replace(/^pause\r?$/gm, 'echo MOCK_PAUSE');
        assert.doesNotMatch(
          fixtureSource,
          /\btaskkill\b/i,
          'A native kill boundary escaped fixture substitution',
        );
        assert.doesNotMatch(
          fixtureSource,
          /\bpowershell\.exe\b/i,
          'The fixture controller must resolve to its mock',
        );
        writeFileSync(script, fixtureSource);
        mkdirSync(path.join(directory, 'backend'));
        const bin = path.join(directory, 'test-bin');
        mkdirSync(bin);
        writeFileSync(
          path.join(bin, 'powershell.cmd'),
          `@echo off\r\necho MOCK_CONTROLLER_CWD=%cd%\r\necho MOCK_CONTROLLER_ARGS=%*\r\nexit /b ${restartExit}\r\n`,
        );
        writeFileSync(
          path.join(bin, 'npm.cmd'),
          '@echo off\r\necho MOCK_UNGUARDED_NPM_START\r\nexit /b 0\r\n',
        );
        const result = runBatch(script, {
          cwd: tmpdir(),
          env: { ...process.env, PATH: `${bin};${process.env.PATH}` },
        });
        assert.ifError(result.error);
        assert.ok(!result.stdout.includes('MOCK_GLOBAL_NODE_KILL'), result.stdout);
        assert.ok(!result.stdout.includes('MOCK_UNGUARDED_NPM_START'), result.stdout);
        assert.equal(result.status, restartExit, result.stdout + result.stderr);
        assert.ok(result.stdout.includes(`MOCK_CONTROLLER_CWD=${directory}`), result.stdout);
        assert.ok(
          result.stdout.includes(`-File "${path.join(directory, 'system.ps1')}" restart -Silent`),
          result.stdout,
        );
      }),
  );
}

for (const silent of [false, true]) {
  for (const failed of [false, true]) {
    test(
      `shared restart preserves guarded startup and browser visibility silent=${silent} failed=${failed}`,
      { skip: process.platform !== 'win32' },
      () =>
        withLauncherFixture((directory, launchers) => {
          const script = path.join(directory, 'system.ps1');
          copyFileSync(path.join(root, 'system.ps1'), script);
          writeFileSync(
            path.join(path.dirname(launchers), 'runtime-control.ps1'),
            `
        function Start-ErpRuntime { param($ProjectRoot,[switch]$Restart)
          Write-Output ('MOCK_RUNTIME_ROOT=' + $ProjectRoot)
          Write-Output ('MOCK_RUNTIME_RESTART=' + $Restart.IsPresent)
          ${failed ? "throw 'Isolated readiness refusal'" : ''}
        }
        function Start-Process { param($FilePath) Write-Output ('MOCK_BROWSER=' + $FilePath) }
      `,
          );
          const result = spawnSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              script,
              'restart',
              ...(silent ? ['-Silent'] : []),
            ],
            {
              cwd: tmpdir(),
              encoding: 'utf8',
              windowsHide: true,
              timeout: 15000,
            },
          );
          assert.ifError(result.error);
          assert.equal(result.status, failed ? 1 : 0, result.stdout + result.stderr);
          assertReportedDirectory(result.stdout, 'MOCK_RUNTIME_ROOT', directory);
          assert.ok(result.stdout.includes('MOCK_RUNTIME_RESTART=True'), result.stdout);
          assert.equal(
            result.stdout.includes('MOCK_BROWSER=http://localhost:3000'),
            !silent && !failed,
            result.stdout,
          );
          assert.equal(
            result.stdout.includes('[SUCCESS] ERP restarted'),
            !failed && !silent,
            result.stdout,
          );
        }),
    );
  }
}

for (const backendExit of [0, 17]) {
  test(
    `cashier development waits for verified backend readiness and preserves exit ${backendExit}`,
    { skip: process.platform !== 'win32' },
    () =>
      withLauncherFixture((directory, launchers) => {
        const script = path.join(launchers, 'start-cashier-dev.bat');
        copyFileSync(path.join(root, 'scripts/windows/launchers/start-cashier-dev.bat'), script);
        writeFileSync(
          path.join(launchers, 'start-desktop.bat'),
          '@echo off\r\necho MOCK_DESKTOP_LAUNCHED\r\nexit /b 23\r\n',
        );
        const bin = path.join(directory, 'test-bin');
        mkdirSync(bin);
        writeFileSync(
          path.join(bin, 'powershell.cmd'),
          `@echo off\r\necho MOCK_CWD=%cd%\r\necho MOCK_ARGS=%*\r\nexit /b ${backendExit}\r\n`,
        );
        const result = runBatch(script, {
          cwd: tmpdir(),
          env: { ...process.env, PATH: `${bin};${process.env.PATH}` },
        });
        assert.ifError(result.error);
        assert.equal(result.status, backendExit || 23, result.stdout + result.stderr);
        assert.ok(result.stdout.includes(`MOCK_CWD=${directory}`), result.stdout);
        assert.ok(
          result.stdout.includes(`-File "${path.join(directory, 'system.ps1')}" start -Silent`),
          result.stdout,
        );
        assert.equal(result.stdout.includes('MOCK_DESKTOP_LAUNCHED'), backendExit === 0);
      }),
  );
}

for (const filename of ['start-silent.vbs', 'start-backend-silent.vbs']) {
  for (const backendExit of [0, 17]) {
    test(
      `${filename} waits for the shared controller and preserves exit ${backendExit}`,
      { skip: process.platform !== 'win32' },
      () =>
        withLauncherFixture((directory, launchers) => {
          const scripts = path.dirname(launchers);
          const source = readFileSync(path.join(root, 'scripts/windows', filename), 'utf8');
          const script = path.join(scripts, filename);
          // Replace only WScript.Shell; execute the actual VBS control flow and FSO path resolution.
          writeFileSync(
            script,
            `Class FixtureShell
              Public CurrentDirectory
              Public Function Run(command, style, wait)
                WScript.Echo "MOCK_COMMAND=" & command
                WScript.Echo "MOCK_CWD=" & CurrentDirectory
                WScript.Echo "MOCK_STYLE=" & CStr(style)
                WScript.Echo "MOCK_WAIT=" & CStr(wait)
                Run = ${backendExit}
              End Function
            End Class
            ` + source.replace('CreateObject("WScript.Shell")', 'New FixtureShell'),
          );
          const result = spawnSync('cscript.exe', ['//Nologo', script], {
            cwd: tmpdir(),
            encoding: 'utf8',
            windowsHide: true,
            timeout: 15000,
          });
          assert.ifError(result.error);
          assert.equal(result.status, backendExit, result.stdout + result.stderr);
          assert.equal(result.stdout.match(/MOCK_COMMAND=/g)?.length, 1);
          assert.ok(
            result.stdout.includes(`-File "${path.join(directory, 'system.ps1')}" start -Silent`),
            result.stdout,
          );
          assert.ok(result.stdout.includes(`MOCK_CWD=${directory}`), result.stdout);
          assert.ok(result.stdout.includes('MOCK_STYLE=0'), result.stdout);
          assert.ok(result.stdout.includes('MOCK_WAIT=True'), result.stdout);
        }),
    );
  }
}

test(
  'desktop development launcher runs from a relocated root and preserves npm failure',
  {
    skip: process.platform !== 'win32',
  },
  () =>
    withLauncherFixture((directory, launchers) => {
      const script = path.join(launchers, 'start-desktop.bat');
      copyFileSync(path.join(root, 'scripts', 'windows', 'launchers', 'start-desktop.bat'), script);
      const bin = path.join(directory, 'test-bin');
      mkdirSync(bin);
      writeFileSync(
        path.join(bin, 'npm.cmd'),
        '@echo off\r\necho MOCK_CWD=%cd%\r\necho MOCK_ARGS=%*\r\nexit /b 19\r\n',
      );
      const env = { ...process.env, PATH: `${bin};${process.env.PATH}` };
      const result = runBatch(script, { cwd: tmpdir(), env });
      assert.ifError(result.error);
      assert.equal(result.status, 19, `${result.stdout}\n${result.stderr}`);
      assert.ok(result.stdout.includes(`MOCK_CWD=${directory}`), result.stdout);
      assert.ok(result.stdout.includes('MOCK_ARGS=run dev --prefix desktop-pos'), result.stdout);
    }),
);

test(
  'production fallback locates the unpacked application in a relocated project',
  {
    skip: process.platform !== 'win32',
  },
  () =>
    withLauncherFixture((directory, launchers) => {
      const source = readFileSync(
        path.join(root, 'scripts', 'windows', 'launchers', 'start-cashier.bat'),
        'utf8',
      );
      const script = path.join(launchers, 'start-cashier.bat');
      // CMD resets ProgramFiles from Windows, even when a custom child environment
      // supplies it. Redirect installed-app roots and process creation to fixtures;
      // the real project-relative path resolution and existence checks still run.
      writeFileSync(
        script,
        source
          .replaceAll('%LocalAppData%', '%ERP_TEST_INSTALL_ROOT%')
          .replaceAll('%ProgramFiles%', '%ERP_TEST_INSTALL_ROOT%')
          .replaceAll('start "" ', 'echo MOCK_LAUNCH='),
      );
      const executable = path.join(
        directory,
        'desktop-pos',
        'release',
        'win-unpacked',
        'AlAgoouz-POS.exe',
      );
      mkdirSync(path.dirname(executable), { recursive: true });
      writeFileSync(executable, 'Fixture: never executed');
      const env = { ...process.env, ERP_TEST_INSTALL_ROOT: directory };
      const result = runBatch(script, {
        cwd: tmpdir(),
        env,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      const match = result.stdout.match(/MOCK_LAUNCH="([^"\r\n]+)"/);
      assert.ok(match, result.stdout);
      assert.equal(path.resolve(match[1]), executable);
    }),
);

test(
  'the silent launcher derives the relocated project root without opening the POS',
  {
    skip: process.platform !== 'win32',
  },
  () =>
    withLauncherFixture((directory, launchers) => {
      const source = readFileSync(
        path.join(root, 'scripts', 'windows', 'launchers', 'silent-pos.vbs'),
        'utf8',
      );
      const script = path.join(launchers, 'silent-pos.vbs');
      assert.match(source, /^WshShell\.Run .+$/m);
      writeFileSync(script, source.replace(/^WshShell\.Run .+$/m, 'WScript.Echo rootDir'));
      const result = spawnSync('cscript.exe', ['//Nologo', script], {
        cwd: tmpdir(),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), directory);
    }),
);
