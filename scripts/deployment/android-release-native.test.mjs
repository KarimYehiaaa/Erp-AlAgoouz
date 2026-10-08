import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createReleaseManifest } from './verify-android-release.mjs';

const enabled = process.env.ERP_ANDROID_NATIVE_VERIFY === '1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inspector = path.join(root, 'scripts/deployment/AndroidReleaseInspector.java');
const tools = process.env.ALAGOOUZ_ANDROID_TEST_BUILD_TOOLS;
const apk = path.join(root, 'BinAlAgoouz-Manager-Release.apk');
const jar = tools && path.join(tools, 'lib/apksigner.jar');
const runJava = (args) => spawnSync('java', args, { encoding: 'utf8', timeout: 30000 });
const inspect = (file) => {
  const result = runJava(['--class-path', jar, inspector, file]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const verifiedOutput = (file) => {
  const result = runJava(['-jar', jar, 'verify', '--verbose', '--print-certs', '-Werr', file]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const badging = (file) => {
  const result = spawnSync(
    path.join(tools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'),
    ['dump', 'badging', file],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test(
  'native SDK inspection validates the rebuilt APK and its data-only legacy lineage',
  { skip: !enabled },
  () => {
    assert.ok(tools && existsSync(jar), 'explicit Android SDK build-tools required');
    const manifest = createReleaseManifest({
      apkPath: apk,
      apksignerOutput: verifiedOutput(apk),
      apkInspection: inspect(apk),
      aaptOutput: badging(apk),
    });
    assert.equal(manifest.sha256, JSON.parse(readFileSync(`${apk}.manifest.json`, 'utf8')).sha256);
    assert.equal(manifest.signingLineage[0].installedData, true);
    assert.equal(manifest.signingLineage[0].permission, false);
  },
);

test(
  'native verification rejects an APK whose signature bytes were altered',
  { skip: !enabled },
  () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'alagoouz-android-tamper-'));
    try {
      const tampered = path.join(directory, 'tampered.apk');
      copyFileSync(apk, tampered);
      appendFileSync(tampered, 'invalid unsigned bytes');
      const result = runJava(['--class-path', jar, inspector, tampered]);
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  'a previous real APK fails the required data-only legacy-to-current signing policy',
  { skip: !enabled },
  () => {
    const previous = process.env.ALAGOOUZ_ANDROID_PREVIOUS_APK;
    assert.ok(previous && existsSync(previous), 'explicit predecessor APK required');
    assert.throws(
      () =>
        createReleaseManifest({
          apkPath: previous,
          artifactName: 'previous.apk',
          apksignerOutput: verifiedOutput(previous),
          apkInspection: inspect(previous),
          aaptOutput: badging(previous),
        }),
      /legacy-to-current lineage/,
    );
  },
);

test(
  'lineage preparation rejects unrelated certificates without modifying its input or creating output',
  { skip: !enabled },
  () => {
    const wrong = process.env.ALAGOOUZ_ANDROID_WRONG_LINEAGE_PATH;
    assert.ok(wrong && existsSync(wrong), 'explicit unrelated lineage fixture required');
    const before = readFileSync(wrong);
    const directory = mkdtempSync(path.join(os.tmpdir(), 'alagoouz-android-lineage-'));
    try {
      const output = path.join(directory, 'prepared.bin');
      const result = runJava(['--class-path', jar, inspector, '--prepare-lineage', wrong, output]);
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(output), false);
      assert.deepEqual(readFileSync(wrong), before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
