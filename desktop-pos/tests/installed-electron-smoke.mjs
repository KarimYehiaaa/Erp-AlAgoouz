import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from '../../node_modules/playwright/index.mjs';

// This test executes an installed candidate only on an ephemeral GitHub Windows runner.
// Production smoke flags remain disabled; no customer login or network credentials are supplied.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_OS, 'Windows');
assert.equal(process.platform, 'win32');
const executable = fs.realpathSync(process.env.POS_INSTALLED_EXECUTABLE);
const runnerTemp = fs.realpathSync(process.env.RUNNER_TEMP);
const relative = path.relative(runnerTemp, executable);
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
const version = process.env.POS_EXPECTED_VERSION;
assert.match(version, /^\d+\.\d+\.\d+$/);
for (const name of ['AlAgoouz-POS', 'bin-al-ajouz-desktop-pos']) {
  assert.equal(
    fs.existsSync(path.join(process.env.APPDATA, name)),
    false,
    'Runner must not have an existing POS profile',
  );
}
const env = { ...process.env, NODE_ENV: 'production' };
for (const variable of [
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'VITE_DEV_SERVER_URL',
  'POS_SMOKE_TEST',
  'POS_SMOKE_USER_DATA',
])
  delete env[variable];
const evidenceDir = path.resolve('scratch/installed-desktop-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
let application;
try {
  application = await electron.launch({
    executablePath: executable,
    args: [],
    env,
    timeout: 60_000,
  });
  const page = await application.firstWindow();
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) ? route.abort() : route.continue();
  });
  await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 30_000 });
  assert.ok(page.url().startsWith('file:///'));
  assert.ok(decodeURIComponent(page.url()).includes('/resources/app.asar/dist/index.html'));
  const state = await page.evaluate(async () => ({
    api: typeof window.electronAPI,
    require: typeof window.require,
    session: await window.electronAPI.hasSecureSession(),
    queue: await window.electronAPI.getPendingTransactions(),
  }));
  assert.equal(state.api, 'object');
  assert.equal(state.require, 'undefined');
  assert.equal(state.session, false);
  assert.deepEqual(state.queue, []);
  const runtime = await application.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged,
    version: app.getVersion(),
    profile: app.getPath('userData'),
    appData: app.getPath('appData'),
    name: app.getName(),
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  }));
  assert.equal(runtime.packaged, true);
  assert.equal(runtime.version, version);
  assert.equal(
    path.resolve(runtime.appData).toLowerCase(),
    path.resolve(process.env.APPDATA).toLowerCase(),
  );
  assert.equal(
    path.resolve(runtime.profile).toLowerCase(),
    path.join(runtime.appData, runtime.name).toLowerCase(),
  );
  assert.equal(runtime.preferences.sandbox, true);
  assert.equal(runtime.preferences.contextIsolation, true);
  assert.equal(runtime.preferences.nodeIntegration, false);
  assert.equal(runtime.preferences.webSecurity, true);
  await page.screenshot({ path: path.join(evidenceDir, 'installed-login.png') });
  fs.writeFileSync(
    path.join(evidenceDir, 'installed-runtime.json'),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        sourceRunId: process.env.POS_SOURCE_RUN_ID,
        packaged: runtime.packaged,
        version: runtime.version,
        loginVisible: true,
        preloadAvailable: true,
        secureSessionEmpty: true,
        pendingQueueEmpty: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        installerSha256: process.env.POS_INSTALLER_SHA256,
        customerCredentialsUsed: false,
        userHostPolicyChanged: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: installed packaged Electron login, isolated fresh runner profile and renderer security.',
  );
} finally {
  if (application) await application.close();
}
