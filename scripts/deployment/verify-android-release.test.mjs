import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReleaseManifest,
  EXPECTED_ANDROID_13_CERT_SHA256,
  LEGACY_ANDROID_CERT_SHA256,
  parseApkMetadata,
  readSourceReleaseVersion,
  parseSignerSha256Digests,
  verifyOutputAndWriteManifest,
} from './verify-android-release.mjs';

const tempDirectory = () => mkdtempSync(path.join(os.tmpdir(), 'alagoouz-android-release-'));
const version = readSourceReleaseVersion();
const badging = `package: name='com.binalagoouz.manager' versionCode='${version.versionCode}' versionName='${version.versionName}'\nminSdkVersion:'33'\ntargetSdkVersion:'35'`;
const inspection = (bytes) => ({
  schemaVersion: 1,
  verified: true,
  v3: true,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  signers: [EXPECTED_ANDROID_13_CERT_SHA256],
  lineage: [
    {
      sha256: LEGACY_ANDROID_CERT_SHA256,
      installedData: true,
      rollback: false,
      sharedUid: false,
      permission: false,
      auth: false,
    },
    { sha256: EXPECTED_ANDROID_13_CERT_SHA256, installedData: true, rollback: false },
  ],
});

test('rejects an additional signer even when the pinned certificate is present', () => {
  const directory = tempDirectory();
  try {
    const apkPath = path.join(directory, 'candidate.apk');
    writeFileSync(apkPath, 'fixture');
    assert.throws(
      () =>
        createReleaseManifest({
          apkPath,
          apksignerOutput: `Signer #1 certificate SHA-256 digest: ${EXPECTED_ANDROID_13_CERT_SHA256}\nSigner #2 certificate SHA-256 digest: ${'a'.repeat(64)}`,
        }),
      /exactly one/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('parses colon-separated and compact apksigner certificate fingerprints', () => {
  assert.deepEqual(
    parseSignerSha256Digests(
      `Signer #1 certificate SHA-256 digest: ${EXPECTED_ANDROID_13_CERT_SHA256.match(/.{2}/g).join(':')}\nSigner #2 certificate SHA-256 digest: ${'a'.repeat(64)}`,
    ),
    [EXPECTED_ANDROID_13_CERT_SHA256, 'a'.repeat(64)],
  );
});

test('creates a release manifest only for the pinned Android 13+ certificate', () => {
  const directory = tempDirectory();
  try {
    const apkPath = path.join(directory, 'candidate.apk');
    writeFileSync(apkPath, 'fixture apk bytes');
    const manifest = createReleaseManifest({
      apkPath,
      apksignerOutput: `Signer #1 certificate SHA-256 digest: ${EXPECTED_ANDROID_13_CERT_SHA256}`,
      apkInspection: inspection('fixture apk bytes'),
      aaptOutput: badging,
      checkedAt: '2026-10-04T00:00:00.000Z',
    });
    assert.equal(manifest.artifact, 'candidate.apk');
    assert.equal(manifest.signerCertificateSha256, EXPECTED_ANDROID_13_CERT_SHA256);
    assert.equal(manifest.minimumAndroidApi, 33);
    assert.equal(manifest.sha256, createHash('sha256').update('fixture apk bytes').digest('hex'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a mismatched or missing release signer', () => {
  const directory = tempDirectory();
  try {
    const apkPath = path.join(directory, 'candidate.apk');
    writeFileSync(apkPath, 'fixture');
    assert.throws(
      () =>
        createReleaseManifest({
          apkPath,
          apksignerOutput: `Signer #1 certificate SHA-256 digest: ${'0'.repeat(64)}`,
        }),
      /does not match the pinned Android 13\+ signer/,
    );
    assert.throws(
      () =>
        createReleaseManifest({
          apkPath,
          apksignerOutput: 'Verified using v2 scheme (APK Signature Scheme v2): true',
        }),
      /did not report a valid SHA-256 signer certificate digest/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('writes a sidecar only after the reported signer matches the installed certificate', () => {
  const directory = tempDirectory();
  try {
    const apkPath = path.join(directory, 'candidate.apk');
    const manifestPath = path.join(directory, 'candidate.apk.manifest.json');
    writeFileSync(apkPath, 'fixture');
    const result = verifyOutputAndWriteManifest({
      apkPath,
      artifactName: 'BinAlAgoouz-Manager-Release.apk',
      apksignerOutput: `Verified using v3 scheme: true\nSigner #1 certificate SHA-256 digest: ${EXPECTED_ANDROID_13_CERT_SHA256}`,
      apkInspection: inspection('fixture'),
      aaptOutput: badging,
      manifestPath,
    });
    const saved = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(saved.sha256, result.sha256);
    assert.equal(saved.artifact, 'BinAlAgoouz-Manager-Release.apk');
    assert.equal(saved.signerCertificateSha256, EXPECTED_ANDROID_13_CERT_SHA256);
    assert.throws(
      () =>
        verifyOutputAndWriteManifest({
          apkPath,
          artifactName: 'wrong.apk',
          apksignerOutput: `Signer #1 certificate SHA-256 digest: ${'0'.repeat(64)}`,
          manifestPath,
        }),
      /does not match the pinned Android 13\+ signer/,
    );
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, 'utf8')), saved);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('metadata uses actual minimum API, accepts SDK tool spelling, and requires every field', () => {
  assert.equal(parseApkMetadata(badging).minimumAndroidApi, 33);
  assert.equal(parseApkMetadata(`\uFEFF${badging}`).minimumAndroidApi, 33);
  assert.equal(
    parseApkMetadata(badging.replace('minSdkVersion', 'sdkVersion')).minimumAndroidApi,
    33,
  );
  assert.throws(
    () => parseApkMetadata(badging.replace("targetSdkVersion:'35'", '')),
    /complete APK metadata/,
  );
});

for (const [name, change, message] of [
  [
    'missing native inspection',
    (input) => {
      delete input.apkInspection;
    },
    /Native APK inspection/,
  ],
  [
    'inspection from other bytes',
    (input) => {
      input.apkInspection.sha256 = '0'.repeat(64);
    },
    /different APK bytes/,
  ],
  [
    'no embedded signing lineage',
    (input) => {
      input.apkInspection.lineage = [];
    },
    /legacy-to-current lineage/,
  ],
  [
    'wrong legacy ancestor',
    (input) => {
      input.apkInspection.lineage[0].sha256 = 'a'.repeat(64);
    },
    /legacy-to-current lineage/,
  ],
  [
    'missing data continuity',
    (input) => {
      input.apkInspection.lineage[0].installedData = false;
    },
    /legacy-to-current lineage/,
  ],
  [
    'enabled legacy rollback',
    (input) => {
      input.apkInspection.lineage[0].rollback = true;
    },
    /legacy-to-current lineage/,
  ],
  [
    'Android 12 minimum',
    (input) => {
      input.aaptOutput = badging.replace("minSdkVersion:'33'", "minSdkVersion:'32'");
    },
    /release source/,
  ],
  ...['sharedUid', 'permission', 'auth'].map((capability) => [
    `legacy ${capability} trust`,
    (input) => {
      input.apkInspection.lineage[0][capability] = true;
    },
    /privileged trust/,
  ]),
  [
    'debug application',
    (input) => {
      input.aaptOutput += '\napplication-debuggable';
    },
    /release source/,
  ],
  [
    'stale version',
    (input) => {
      input.aaptOutput = badging.replace(`versionCode='${version.versionCode}'`, "versionCode='2'");
    },
    /release source/,
  ],
  [
    'wrong application ID',
    (input) => {
      input.aaptOutput = badging.replace(
        'com.binalagoouz.manager',
        'com.binalagoouz.manager.debug',
      );
    },
    /release source/,
  ],
]) {
  test(`rejects ${name} without replacing an existing sidecar`, () => {
    const directory = tempDirectory();
    try {
      const apkPath = path.join(directory, 'candidate.apk');
      const manifestPath = path.join(directory, 'candidate.manifest.json');
      writeFileSync(apkPath, 'fixture');
      writeFileSync(manifestPath, 'previous manifest');
      const input = {
        apkPath,
        manifestPath,
        apkInspection: inspection('fixture'),
        aaptOutput: badging,
        apksignerOutput: `Signer #1 certificate SHA-256 digest: ${EXPECTED_ANDROID_13_CERT_SHA256}`,
      };
      change(input);
      assert.throws(() => verifyOutputAndWriteManifest(input), message);
      assert.equal(readFileSync(manifestPath, 'utf8'), 'previous manifest');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('cleans its manifest temporary file if the final rename fails', () => {
  const directory = tempDirectory();
  try {
    const apkPath = path.join(directory, 'candidate.apk');
    const manifestPath = path.join(directory, 'manifest-directory');
    writeFileSync(apkPath, 'fixture');
    mkdirSync(manifestPath);
    assert.throws(() =>
      verifyOutputAndWriteManifest({
        apkPath,
        manifestPath,
        apkInspection: inspection('fixture'),
        aaptOutput: badging,
        apksignerOutput: `Signer #1 certificate SHA-256 digest: ${EXPECTED_ANDROID_13_CERT_SHA256}`,
      }),
    );
    assert.deepEqual(readdirSync(directory).sort(), ['candidate.apk', 'manifest-directory']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
