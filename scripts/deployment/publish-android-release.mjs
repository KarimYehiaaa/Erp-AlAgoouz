import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_ANDROID_13_CERT_SHA256 } from './verify-android-release.mjs';

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

export function publishAndroidRelease(
  { apkPath, manifestPath, targetApk, backupDirectory },
  rename = renameSync,
) {
  apkPath = resolve(apkPath);
  manifestPath = resolve(manifestPath);
  targetApk = resolve(targetApk);
  const targetManifest = `${targetApk}.manifest.json`;
  if (new Set([apkPath, manifestPath, targetApk, targetManifest]).size !== 4)
    throw new Error('Publication requires separate input and output files.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    manifest.schemaVersion !== 2 ||
    manifest.sha256 !== hash(apkPath) ||
    manifest.artifact !== basename(targetApk) ||
    manifest.signerCertificateSha256 !== EXPECTED_ANDROID_13_CERT_SHA256
  ) {
    throw new Error('The verified release manifest does not match the staged APK.');
  }
  // Retain the previous APK by content hash; it may be the only available device transition artifact.
  if (existsSync(targetApk)) {
    mkdirSync(backupDirectory, { recursive: true });
    const priorHash = hash(targetApk);
    const priorBackup = resolve(backupDirectory, `android-release-${priorHash}.apk`);
    if (existsSync(priorBackup)) {
      if (hash(priorBackup) !== priorHash)
        throw new Error('The previous APK backup has a conflicting checksum.');
    } else copyFileSync(targetApk, priorBackup, constants.COPYFILE_EXCL);
  }
  const id = randomUUID();
  const stagedApk = `${targetApk}.${id}.tmp`;
  const stagedManifest = `${targetManifest}.${id}.tmp`;
  const owned = [];
  const backups = [];
  let changed = false;
  let recovered = true;
  try {
    copyFileSync(apkPath, stagedApk, constants.COPYFILE_EXCL);
    owned.push(stagedApk);
    // Bind the manifest to the actual publication copy too.
    if (hash(stagedApk) !== manifest.sha256)
      throw new Error('Staged APK changed during publication.');
    writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    owned.push(stagedManifest);
    for (const target of [targetApk, targetManifest]) {
      if (existsSync(target)) {
        const backup = `${target}.${id}.rollback`;
        copyFileSync(target, backup, constants.COPYFILE_EXCL);
        backups.push({ target, backup });
        owned.push(backup);
      }
    }
    rename(stagedApk, targetApk);
    changed = true;
    rename(stagedManifest, targetManifest);
  } catch (error) {
    try {
      if (changed) {
        const prior = backups.find((item) => item.target === targetApk);
        if (prior) renameSync(prior.backup, targetApk);
        else unlinkSync(targetApk);
      }
    } catch (rollbackError) {
      recovered = false;
      throw new AggregateError(
        [error, rollbackError],
        'Publication and rollback failed. Preserve adjacent .rollback files for recovery.',
        { cause: rollbackError },
      );
    }
    throw error;
  } finally {
    if (recovered) for (const file of owned) if (existsSync(file)) unlinkSync(file);
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 6)
      throw new Error('Expected staged APK, verified manifest, output APK, and backup directory.');
    const manifest = publishAndroidRelease({
      apkPath: process.argv[2],
      manifestPath: process.argv[3],
      targetApk: process.argv[4],
      backupDirectory: process.argv[5],
    });
    process.stdout.write(`Android release candidate published: ${manifest.sha256}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
