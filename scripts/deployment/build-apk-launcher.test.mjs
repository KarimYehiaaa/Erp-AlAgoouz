import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const launcher = readFileSync(path.join(scriptDirectory, 'build-apk.bat'), 'utf8');
const guardedBuild = readFileSync(path.join(scriptDirectory, 'build-apk.ps1'), 'utf8');

for (const { explicitSdk, successful, existingProperties, missingUserProfile } of [
  { explicitSdk: true, successful: false, existingProperties: true },
  { explicitSdk: false, successful: false, existingProperties: true },
  { explicitSdk: true, successful: true, existingProperties: true },
  { explicitSdk: true, successful: true, existingProperties: false },
  { explicitSdk: true, successful: true, existingProperties: false, missingUserProfile: true },
  { explicitSdk: false, successful: true, existingProperties: true, missingUserProfile: true },
]) {
  test(
    `Android build preserves Unicode SDK paths and local settings (${explicitSdk ? 'explicit SDK' : 'existing SDK'}, ${successful ? 'success' : 'failure'}, ${existingProperties ? 'existing settings' : 'new settings'}, ${missingUserProfile ? 'no user profile' : 'user profile'})`,
    { skip: process.platform !== 'win32' },
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'AlAgoouz-Android-Path-Test-'));
      try {
        const script = path.join(root, 'scripts/deployment/build-apk.ps1');
        const sdk = path.join(root, 'SDK-العجوز');
        const properties = path.join(root, 'frontend/android/local.properties');
        const bin = path.join(root, 'bin');
        for (const directory of [path.dirname(script), path.dirname(properties), sdk, bin])
          mkdirSync(directory, { recursive: true });
        writeFileSync(script, guardedBuild);
        const encode = (value) =>
          value
            .replace(/\\/g, '\\\\')
            .replace(/:/g, '\\:')
            .replace(
              /[\u0080-\uffff]/g,
              (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
            );
        const original = Buffer.from(
          `# Preserve this file exactly\r\ncustom.flag=true\r\nsdk.dir=${encode(sdk)}\r\n`,
        );
        if (existingProperties) writeFileSync(properties, original);
        writeFileSync(
          path.join(bin, 'npm.cmd'),
          `@echo off\r\ncopy /y "frontend\\android\\local.properties" "captured.properties" >nul\r\nexit /b ${successful ? 0 : 1}\r\n`,
        );
        writeFileSync(
          path.join(root, 'frontend/android/gradlew.bat'),
          '@echo off\r\nmkdir app\\build\\outputs\\apk\\debug\r\necho fixture-debug-apk>app\\build\\outputs\\apk\\debug\\app-debug.apk\r\nexit /b 0\r\n',
        );
        const environment = {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          LOCALAPPDATA: root,
        };
        delete environment.ANDROID_HOME;
        delete environment.ANDROID_SDK_ROOT;
        if (missingUserProfile) delete environment.LOCALAPPDATA;
        const result = spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            script,
            '-BuildType',
            'Debug',
            ...(explicitSdk ? ['-AndroidSdkPath', sdk] : []),
          ],
          { env: environment, encoding: 'utf8', timeout: 15000 },
        );
        assert.equal(result.error, undefined);
        if (successful) {
          assert.equal(result.status, 0, result.stdout + result.stderr);
          assert.match(
            readFileSync(path.join(root, 'BinAlAgoouz-Manager-Debug.apk'), 'utf8'),
            /fixture-debug-apk/,
          );
        } else {
          assert.notEqual(result.status, 0);
          assert.match(
            result.stdout + result.stderr,
            /Native frontend build or Capacitor sync failed/,
          );
        }
        const generated = readFileSync(path.join(root, 'captured.properties'), 'ascii');
        const sdkLine = generated.split(/\r?\n/).find((line) => line.startsWith('sdk.dir='));
        const decoded = sdkLine
          .slice(8)
          .replace(/\\u([0-9a-f]{4})|\\(.)/gi, (_, hex, escaped) =>
            hex ? String.fromCharCode(parseInt(hex, 16)) : escaped,
          );
        assert.equal(decoded, sdk);
        if (existingProperties) assert.deepEqual(readFileSync(properties), original);
        else assert.equal(existsSync(properties), false);
      } finally {
        assert.equal(path.dirname(root), os.tmpdir());
        assert.ok(path.basename(root).startsWith('AlAgoouz-Android-Path-Test-'));
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
}

test('Android batch launcher delegates SDK setup and build to the guarded PowerShell script', () => {
  assert.match(launcher, /set "BUILD_SCRIPT=%~dp0build-apk\.ps1"/i);
  assert.match(
    launcher,
    /powershell(?:\.exe)?[^\r\n]*-ExecutionPolicy Bypass[^\r\n]*-File "%BUILD_SCRIPT%"\s+-BuildType Debug/i,
  );
  assert.doesNotMatch(launcher, /gradlew(?:\.bat)?\s+assembleDebug/i);
  assert.doesNotMatch(launcher, /npm(?:\.cmd)?\s+run\s+cap:build/i);
});

test(
  'missing release credentials fail before changing SDK properties or the distributable APK',
  { skip: process.platform !== 'win32' },
  () => {
    const root = path.resolve(scriptDirectory, '../..');
    const properties = path.join(root, 'frontend/android/local.properties');
    const apk = path.join(root, 'BinAlAgoouz-Manager-Release.apk');
    const beforeProperties = existsSync(properties) ? readFileSync(properties) : null;
    const beforeApk = existsSync(apk) ? readFileSync(apk) : null;
    const environment = { ...process.env };
    for (const name of [
      'ANDROID_KEYSTORE_PATH',
      'ANDROID_KEYSTORE_PASSWORD',
      'ANDROID_KEY_ALIAS',
      'ANDROID_KEY_PASSWORD',
      'ANDROID_SIGNING_LINEAGE_PATH',
    ])
      delete environment[name];
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(scriptDirectory, 'build-apk.ps1'),
        '-BuildType',
        'Release',
      ],
      { env: environment, encoding: 'utf8', timeout: 15000 },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Release signing requires explicitly provisioned/);
    assert.deepEqual(existsSync(properties) ? readFileSync(properties) : null, beforeProperties);
    assert.deepEqual(existsSync(apk) ? readFileSync(apk) : null, beforeApk);
  },
);

test('Android batch launcher fails when the guarded build fails', () => {
  const wrapperCall = launcher.search(/powershell(?:\.exe)?[^\r\n]*"%BUILD_SCRIPT%"/i);
  const failureCheck = launcher.search(/if\s+errorlevel\s+1\s+goto\s+build_failure/i);
  const failureLabel = launcher.search(/:build_failure/i);
  const nonzeroExit = launcher.search(/exit\s*\/b\s+1/i);

  assert.ok(wrapperCall >= 0, 'must call the guarded build script');
  assert.ok(failureCheck > wrapperCall, 'must check the PowerShell exit code');
  assert.ok(failureLabel > failureCheck, 'must route failures to a clear failure path');
  assert.ok(nonzeroExit > failureLabel, 'must return a nonzero exit status');
});

test('Android batch launcher uses a clearly labeled debug APK and never overwrites the release filename', () => {
  assert.match(launcher, /set "DEBUG_APK=%ROOT_DIR%\\BinAlAgoouz-Manager-Debug\.apk"/i);
  assert.match(launcher, /cannot update the installed release app/i);
  assert.doesNotMatch(launcher, /BinAlAgoouz-Manager\.apk/i);
  assert.doesNotMatch(launcher, /copy \/y/i);
});

test('release build verifies the installed signer before publishing an APK and checksum sidecar', () => {
  assert.match(guardedBuild, /verify --verbose --print-certs --min-sdk-version 33/i);
  assert.match(guardedBuild, /verify-android-release\.mjs/i);
  assert.match(guardedBuild, /manifest\.json/i);
  assert.ok(
    guardedBuild.indexOf('verify-android-release.mjs') <
      guardedBuild.indexOf('publish-android-release.mjs'),
    'must verify the pinned signer and create its manifest before replacing the distributable APK',
  );
});
