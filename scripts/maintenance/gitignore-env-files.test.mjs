import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ignoredPaths = (paths) => {
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    encoding: 'utf8',
    input: `${paths.join('\n')}\n`,
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return new Set(result.stdout.split(/\r?\n/).filter(Boolean));
};

test('local environment variants are ignored while safe templates stay trackable', () => {
  const localEnvironmentFiles = [
    '.env.local',
    '.env.production',
    'backend/.env.local',
    'backend/.env.production',
    'frontend/.env.local',
    'frontend/.env.production',
    'frontend/.env.production.local',
    'backend/.env.recovered',
  ];
  const safeTemplates = ['.env.example', 'backend/.env.example'];
  const ignored = ignoredPaths([...localEnvironmentFiles, ...safeTemplates]);

  for (const path of localEnvironmentFiles) assert.ok(ignored.has(path), `${path} must be ignored`);
  for (const path of safeTemplates) assert.ok(!ignored.has(path), `${path} must remain trackable`);
});

test('local temporary and duplicate release outputs are ignored', () => {
  const generatedPaths = [
    'temp-e2e/playwright-transform-cache/index.js',
    'temp-npm-cache/_logs/debug.log',
    'desktop-pos/release-codex-local/AlAgoouz-POS-Setup.exe',
    'desktop-pos/.codex-build-temp-local/dist/index.html',
    'desktop-pos/.codex-esbuild-temp-local/node-compile-cache/cache.bin',
  ];
  const ignored = ignoredPaths(generatedPaths);

  for (const path of generatedPaths) assert.ok(ignored.has(path), `${path} must be ignored`);
});

test('no live environment files or private key artifacts are tracked', () => {
  const result = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);

  const trackedFiles = result.stdout.split('\0').filter(Boolean);
  const forbiddenFiles = trackedFiles.filter((path) => {
    const name = path.split('/').at(-1) || '';
    return (
      (/^\.env(?:$|\.)/.test(name) && name !== '.env.example') ||
      name === '.postgres.local' ||
      /\.(?:pem|key|p12|pfx|jks|keystore|apk)$/i.test(name)
    );
  });

  assert.deepEqual(
    forbiddenFiles,
    [],
    'tracked files must not contain live env or private key material',
  );
});

test('PKCS12 release keys and generated APK sidecars are ignored without hiding audit metadata', () => {
  const generated = [
    'frontend/android/release.p12',
    'frontend/android/release.pfx',
    'frontend/android/release.jks',
    'BinAlAgoouz-Manager-Release.apk.manifest.json',
    'frontend/android/app-release.apk.idsig',
  ];
  const evidence = 'docs/audits/evidence/android-release-verification.json';
  const ignored = ignoredPaths([...generated, evidence]);
  for (const file of generated) assert.ok(ignored.has(file), `${file} must be ignored`);
  assert.ok(!ignored.has(evidence), 'release audit metadata must remain trackable');
});
