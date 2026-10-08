import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { publishAndroidRelease } from './publish-android-release.mjs';
import { EXPECTED_ANDROID_13_CERT_SHA256 } from './verify-android-release.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(previous = true) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'alagoouz-android-publication-'));
  const options = {
    apkPath: path.join(directory, 'stage.apk'),
    manifestPath: path.join(directory, 'stage.json'),
    targetApk: path.join(directory, 'release.apk'),
    backupDirectory: path.join(directory, 'backups'),
  };
  writeFileSync(options.apkPath, 'new APK');
  writeFileSync(
    options.manifestPath,
    JSON.stringify({
      schemaVersion: 2,
      artifact: 'release.apk',
      sha256: digest('new APK'),
      signerCertificateSha256: EXPECTED_ANDROID_13_CERT_SHA256,
    }),
  );
  if (previous) {
    writeFileSync(options.targetApk, 'previous APK');
    writeFileSync(`${options.targetApk}.manifest.json`, 'previous manifest');
  }
  return { directory, options };
}

test('publishes a matching pair and retains the previous APK by its complete checksum', () => {
  const { directory, options } = fixture();
  try {
    publishAndroidRelease(options);
    assert.equal(readFileSync(options.targetApk, 'utf8'), 'new APK');
    assert.equal(
      JSON.parse(readFileSync(`${options.targetApk}.manifest.json`, 'utf8')).sha256,
      digest('new APK'),
    );
    assert.equal(
      readFileSync(
        path.join(options.backupDirectory, `android-release-${digest('previous APK')}.apk`),
        'utf8',
      ),
      'previous APK',
    );
    assert.ok(readdirSync(directory).every((name) => !/\.tmp$|\.rollback$/.test(name)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const previous of [true, false]) {
  test(`restores the previous publication state if sidecar rename fails (previous=${previous})`, () => {
    const { directory, options } = fixture(previous);
    try {
      let renameCount = 0;
      assert.throws(
        () =>
          publishAndroidRelease(options, (source, destination) => {
            if (++renameCount === 2) throw new Error('sidecar publication denied');
            renameSync(source, destination);
          }),
        /sidecar publication denied/,
      );
      if (previous) {
        assert.equal(readFileSync(options.targetApk, 'utf8'), 'previous APK');
        assert.equal(
          readFileSync(`${options.targetApk}.manifest.json`, 'utf8'),
          'previous manifest',
        );
      } else {
        assert.equal(existsSync(options.targetApk), false);
        assert.equal(existsSync(`${options.targetApk}.manifest.json`), false);
      }
      assert.ok(readdirSync(directory).every((name) => !/\.tmp$|\.rollback$/.test(name)));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('rejects a tampered stage without replacing either previous artifact', () => {
  const { directory, options } = fixture();
  try {
    writeFileSync(options.apkPath, 'tampered');
    assert.throws(() => publishAndroidRelease(options), /does not match/);
    assert.equal(readFileSync(options.targetApk, 'utf8'), 'previous APK');
    assert.equal(readFileSync(`${options.targetApk}.manifest.json`, 'utf8'), 'previous manifest');
    assert.equal(existsSync(options.backupDirectory), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a conflicting historical backup prevents overwriting the previous APK', () => {
  const { directory, options } = fixture();
  try {
    publishAndroidRelease(options);
    writeFileSync(options.targetApk, 'previous APK');
    writeFileSync(
      path.join(options.backupDirectory, `android-release-${digest('previous APK')}.apk`),
      'tampered backup',
    );
    assert.throws(() => publishAndroidRelease(options), /conflicting checksum/);
    assert.equal(readFileSync(options.targetApk, 'utf8'), 'previous APK');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
