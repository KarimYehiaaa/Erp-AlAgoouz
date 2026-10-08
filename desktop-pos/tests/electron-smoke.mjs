import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from '../../node_modules/playwright/index.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(directory, '..');
const mainEntry = process.env.POS_BUILD_ROOT
  ? path.resolve(process.env.POS_BUILD_ROOT, 'dist-electron/main.js')
  : desktop;
const require = createRequire(path.join(desktop, 'package.json'));
const profile = fs.mkdtempSync(path.resolve(desktop, '../scratch/electron-smoke-'));
const env = { ...process.env, NODE_ENV: 'test', POS_SMOKE_TEST: '1', POS_SMOKE_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
delete env.NODE_OPTIONS;
let application;
let unsafeProfilePath;
try {
  application = await electron.launch({
    executablePath: process.env.POS_SMOKE_EXECUTABLE || require('electron'),
    args: [mainEntry, `--user-data-dir=${profile}`],
    env,
    timeout: 60_000,
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 30_000 });
  const state = await page.evaluate(async () => ({
    api: typeof globalThis.window.electronAPI,
    require: typeof globalThis.window.require,
    session: await globalThis.window.electronAPI.hasSecureSession(),
    pending: await globalThis.window.electronAPI.getPendingTransactions(),
    server: await globalThis.window.electronAPI.getServerUrl(),
    cleared: await globalThis.window.electronAPI.clearSecureSession(),
  }));
  assert.equal(state.api, 'object');
  assert.equal(state.require, 'undefined');
  assert.equal(state.session, false);
  assert.deepEqual(state.pending, []);
  assert.equal(state.cleared, true);
  assert.match(state.server, /^https?:\/\//);
  const preferences = await application.evaluate(({ BrowserWindow, app }) => ({
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
    profile: app.getPath('userData'),
  }));
  assert.equal(path.resolve(preferences.profile), profile);
  assert.equal(preferences.preferences.sandbox, true);
  assert.equal(preferences.preferences.contextIsolation, true);
  assert.equal(preferences.preferences.nodeIntegration, false);
  assert.equal(preferences.preferences.webSecurity, true);
  console.log(
    'PASS: isolated Electron boot, sandboxed preload, trusted IPC, empty vault and queue.',
  );
} finally {
  if (application) await application.close();
  const scratchRoot = path.resolve(desktop, '..', 'scratch');
  const resolvedProfile = path.resolve(profile);
  if (
    !resolvedProfile.startsWith(`${scratchRoot}${path.sep}`) ||
    !path.basename(resolvedProfile).startsWith('electron-smoke-')
  ) {
    unsafeProfilePath = resolvedProfile;
  } else {
    fs.rmSync(resolvedProfile, { recursive: true, force: true });
  }
}
if (unsafeProfilePath) {
  throw new Error(`Refusing to remove unexpected Electron smoke profile: ${unsafeProfilePath}`);
}
