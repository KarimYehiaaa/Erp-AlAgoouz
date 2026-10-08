import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test, { before, after } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
let bridge;
const requests = new Map();
let requestID = 0;
let bridgeOutput = '';
let bridgeError = '';
let bridgeDone;

before(
  async () => {
    if (process.platform !== 'win32') return;
    bridge = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$ErrorActionPreference='Stop'; . ${quote(path.join(root, 'scripts/windows/process-ownership.ps1'))};
$null = ConvertFrom-ErpWindowsCommandLine 'node.exe fixture.ts';
[Console]::Out.WriteLine('RESULT={"id":0,"ready":true}');
while ($line = [Console]::ReadLine()) {
  try {
    $request = $line | ConvertFrom-Json;
    if ($request.cleanup) {
      $plan = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { Test-ErpRuntimeProcess -ProjectRoot $request.root -Process $_ -BackendOnly });
      $ids = @($plan | ForEach-Object { $_.ProcessId });
      $plan = @($plan | Sort-Object @{Expression={ [int]($_.ParentProcessId -in $ids) }});
      foreach ($original in $plan) {
        $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $original.ProcessId);
        if (-not $current) { continue };
        if ($current.CreationDate -ne $original.CreationDate -or $current.CommandLine -ne $original.CommandLine -or -not (Test-ErpRuntimeProcess -ProjectRoot $request.root -Process $current -BackendOnly)) { throw 'Fixture cleanup identity changed' };
        Stop-Process -Id $current.ProcessId -ErrorAction Stop;
      };
      [Console]::Out.WriteLine('RESULT=' + (@{id=$request.id;stopped=$plan.Count} | ConvertTo-Json -Compress));
      continue;
    };
    $candidate = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$request.pid);
    if (-not $candidate) { throw 'Fixture process exited before ownership proof' };
    $owned = Test-ErpRuntimeProcess -ProjectRoot $request.root -Process $candidate -BackendOnly;
    $creation = $candidate.CreationDate.ToUniversalTime().ToString('o');
    [Console]::Out.WriteLine('RESULT=' + (@{id=$request.id;owned=[bool]$owned;creation=$creation} | ConvertTo-Json -Compress));
  } catch { [Console]::Out.WriteLine('RESULT=' + (@{id=$request.id;error=$_.Exception.Message} | ConvertTo-Json -Compress)) }
}`,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    const ready = new Promise((resolve, reject) => {
      requests.set(0, { resolve, reject });
    });
    bridge.stdout.on('data', (chunk) => {
      bridgeOutput += chunk;
      for (;;) {
        const end = bridgeOutput.indexOf('\n');
        if (end < 0) break;
        const line = bridgeOutput.slice(0, end).trim();
        bridgeOutput = bridgeOutput.slice(end + 1);
        if (!line.startsWith('RESULT=')) continue;
        const result = JSON.parse(line.slice(7));
        const next = requests.get(result.id);
        requests.delete(result.id);
        if (result.error) next?.reject(new Error(result.error));
        else next?.resolve(result);
      }
    });
    bridge.stderr.on('data', (chunk) => {
      bridgeError += chunk;
    });
    bridgeDone = new Promise((resolve) => {
      bridge.once('error', (error) => {
        for (const next of requests.values()) next.reject(error);
        requests.clear();
        resolve({ error });
      });
      bridge.once('close', (code) => {
        for (const next of requests.values())
          next.reject(new Error(`Ownership bridge closed ${code}: ${bridgeError}`));
        requests.clear();
        resolve({ code });
      });
    });
    await ready;
  },
  { timeout: 30000 },
);

after(async () => {
  if (!bridge) return;
  bridge.stdin.end();
  const result = await bridgeDone;
  assert.ifError(result.error);
  assert.equal(result.code, 0, bridgeError);
});

const prove = (request) =>
  new Promise((resolve, reject) => {
    if (request.cleanup) {
      assert.ok(realpathSync(request.root).startsWith(realpathSync(tmpdir()) + path.sep));
      assert.match(path.basename(request.root), /^erp-npm relocated /);
    }
    const id = ++requestID;
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(new Error('Fixture ownership observation timed out'));
    }, 10000);
    requests.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    bridge.stdin.write(JSON.stringify({ ...request, id }) + '\n');
  });

const fixture = () => {
  const directory = mkdtempSync(path.join(tmpdir(), "erp-npm relocated & owner's project-"));
  const backend = path.join(directory, 'backend');
  for (const name of ['scripts', 'src/services', 'node_modules/tsx'])
    mkdirSync(path.join(backend, name), { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(root, 'backend/package.json'), 'utf8'));
  writeFileSync(
    path.join(backend, 'package.json'),
    JSON.stringify({ private: true, type: 'module', scripts: manifest.scripts }),
  );
  const launcher = path.join(root, 'backend/scripts/start-runtime.mjs');
  if (existsSync(launcher)) copyFileSync(launcher, path.join(backend, 'scripts/start-runtime.mjs'));
  writeFileSync(
    path.join(backend, 'node_modules/tsx/package.json'),
    JSON.stringify({ type: 'module', exports: './index.mjs' }),
  );
  // Synthetic application only: no configuration, database, SDK or listening socket.
  writeFileSync(path.join(backend, 'node_modules/tsx/index.mjs'), 'globalThis.order = ["tsx"];');
  writeFileSync(
    path.join(backend, 'src/services/sentryInstrumentation.ts'),
    'globalThis.order.push("sentry");',
  );
  writeFileSync(
    path.join(backend, 'src/index.ts'),
    `import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
globalThis.order.push('entry');
const record = process.env.ERP_FIXTURE_RECORD;
const pendingRecord = record + '.pending';
fs.writeFileSync(pendingRecord, JSON.stringify({
  pid: process.pid, parent: process.ppid, argv: process.argv,
  execArgv: process.execArgv, cwd: process.cwd(), order: globalThis.order
}));
fs.renameSync(pendingRecord, record);
const deadline = Date.now() + 20000;
while (!fs.existsSync(process.env.ERP_FIXTURE_RELEASE) && Date.now() < deadline) await delay(25);
process.exit(Number(process.env.ERP_FIXTURE_EXIT));
`,
  );
  return { directory, backend };
};

for (const mode of ['start', 'start:prod']) {
  for (const exitCode of [0, 17]) {
    test(
      `actual npm ${mode} keeps preload order, relocatable ownership and exit ${exitCode}`,
      { skip: process.platform !== 'win32', timeout: 45000 },
      async () => {
        const { directory, backend } = fixture();
        const record = path.join(directory, 'record.json');
        const release = path.join(directory, 'release');
        let output = '';
        const child = spawn(process.execPath, [npmCli, '--prefix', backend, 'run', mode], {
          cwd: tmpdir(),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NODE_OPTIONS: '',
            ERP_FIXTURE_RECORD: record,
            ERP_FIXTURE_RELEASE: release,
            ERP_FIXTURE_EXIT: String(exitCode),
          },
        });
        child.stdout.on('data', (s) => (output += s));
        child.stderr.on('data', (s) => (output += s));
        const completion = new Promise((resolve) => {
          child.once('error', (error) => resolve({ error }));
          child.once('close', (code, signal) => resolve({ code, signal }));
        });
        try {
          const deadline = Date.now() + 15000;
          while (!existsSync(record) && child.exitCode === null && Date.now() < deadline)
            await delay(25);
          assert.ok(existsSync(record), output);
          const actual = JSON.parse(readFileSync(record, 'utf8'));
          assert.deepEqual(actual.order, ['tsx', 'sentry', 'entry']);
          assert.equal(actual.cwd, backend);
          assert.equal(actual.argv[1], path.join(backend, 'src/index.ts'));
          const proof = await prove({ pid: actual.pid, root: directory });
          assert.equal(proof.owned, true, 'Actual npm child entry ownership is unproven');
          writeFileSync(release, 'release');
          const result = await completion;
          assert.ifError(result.error);
          assert.equal(result.code, exitCode, output);
          assert.equal(result.signal, null);
        } finally {
          // The synthetic entry self-exits after 20 seconds even if an assertion fails.
          writeFileSync(release, 'release');
          await completion;
          const resolved = realpathSync(directory);
          assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
          assert.match(path.basename(resolved), /^erp-npm relocated /);
          rmSync(resolved, { recursive: true, force: true });
        }
      },
    );
  }
}

test(
  'actual npm dev retains native watch reload and owned supervisor in a relocated copy',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    const { directory, backend } = fixture();
    const record = path.join(directory, 'record.json');
    const release = path.join(directory, 'release');
    writeFileSync(release, 'release');
    let output = '';
    const child = spawn(process.execPath, [npmCli, '--prefix', backend, 'run', 'dev'], {
      cwd: tmpdir(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        ERP_FIXTURE_RECORD: record,
        ERP_FIXTURE_RELEASE: release,
        ERP_FIXTURE_EXIT: '0',
      },
    });
    child.stdout.on('data', (s) => {
      output += s;
    });
    child.stderr.on('data', (s) => {
      output += s;
    });
    const completion = new Promise((resolve) => {
      child.once('error', (error) => resolve({ error }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    const awaitBoot = async (previousPID) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && child.exitCode === null) {
        if (existsSync(record)) {
          const actual = JSON.parse(readFileSync(record, 'utf8'));
          if (actual.pid !== previousPID && output.includes('Completed running')) return actual;
        }
        await delay(25);
      }
      assert.fail('Native watch did not complete its fixture boot: ' + output);
    };
    try {
      const first = await awaitBoot();
      assert.deepEqual(first.order, ['tsx', 'sentry', 'entry']);
      const proof = await prove({ pid: first.parent, root: directory });
      assert.equal(proof.owned, true, 'Native watch supervisor ownership is unproven');
      output = '';
      const entry = path.join(backend, 'src/index.ts');
      writeFileSync(entry, readFileSync(entry, 'utf8') + '\n// fixture reload\n');
      const second = await awaitBoot(first.pid);
      assert.deepEqual(second.order, ['tsx', 'sentry', 'entry']);
      assert.equal(second.parent, first.parent);
      assert.equal(second.argv[1], entry);
      const afterReload = await prove({ pid: second.parent, root: directory });
      assert.equal(afterReload.creation, proof.creation);
      assert.equal(afterReload.owned, true);
    } finally {
      // Force cleanup is confined to exact temporary fixture entries and checked creation identities.
      await prove({ root: directory, cleanup: true });
      const result = await completion;
      assert.ifError(result.error);
      const resolved = realpathSync(directory);
      assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
      assert.match(path.basename(resolved), /^erp-npm relocated /);
      rmSync(resolved, { recursive: true, force: true });
    }
  },
);

for (const scenario of ['unsupported-options', 'preload-failure']) {
  test(`runtime startup returns failure for ${scenario}`, () => {
    const { directory, backend } = fixture();
    const record = path.join(directory, 'record.json');
    const release = path.join(directory, 'release');
    writeFileSync(release, 'release');
    try {
      if (scenario === 'preload-failure')
        writeFileSync(
          path.join(backend, 'src/services/sentryInstrumentation.ts'),
          'throw new Error("Isolated preload failure");',
        );
      const result = spawnSync(
        process.execPath,
        [
          path.join(backend, 'scripts/start-runtime.mjs'),
          ...(scenario === 'unsupported-options' ? ['--eval', 'unexpected'] : []),
        ],
        {
          cwd: tmpdir(),
          windowsHide: true,
          encoding: 'utf8',
          timeout: 15000,
          env: {
            ...process.env,
            NODE_OPTIONS: '',
            ERP_FIXTURE_RECORD: record,
            ERP_FIXTURE_RELEASE: release,
            ERP_FIXTURE_EXIT: '17',
          },
        },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(
        existsSync(record),
        false,
        'Entry must not run after rejected options or failed preload',
      );
    } finally {
      const resolved = realpathSync(directory);
      assert.ok(resolved.startsWith(realpathSync(tmpdir()) + path.sep));
      assert.match(path.basename(resolved), /^erp-npm relocated /);
      rmSync(resolved, { recursive: true, force: true });
    }
  });
}
