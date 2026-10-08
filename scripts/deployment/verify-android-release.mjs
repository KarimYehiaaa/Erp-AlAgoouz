import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_ANDROID_13_CERT_SHA256 =
  'f082252c0506cc50af35ff7cb5bc4e7e77136a8c2b5befb6609f35a5fa83d805';
export const LEGACY_ANDROID_CERT_SHA256 =
  '8ef9a804043c411f136d716da23d13e1e0c50f9f024a84acc1a5738065fa051b';

export function parseSignerSha256Digests(output) {
  const digests = [
    ...output.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([\da-fA-F:]+)\s*$/gm),
  ].map(([, digest]) => digest.replaceAll(':', '').toLowerCase());
  return digests;
}

export function parseApkMetadata(output) {
  output = output.replace(/^\uFEFF/, '');
  const app = output.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  const min = output.match(/^(?:minSdkVersion|sdkVersion):'(\d+)'\s*$/m);
  const target = output.match(/^targetSdkVersion:'(\d+)'\s*$/m);
  if (!app || !min || !target) throw new Error('aapt2 did not report complete APK metadata.');
  return {
    packageName: app[1],
    versionCode: Number(app[2]),
    versionName: app[3],
    minimumAndroidApi: Number(min[1]),
    targetAndroidApi: Number(target[1]),
  };
}

export function readSourceReleaseVersion() {
  const source = readFileSync(
    new URL('../../frontend/android/app/build.gradle', import.meta.url),
    'utf8',
  );
  const code = source.match(/^\s*versionCode\s+(\d+)\s*$/m);
  const name = source.match(/^\s*versionName\s+"([^"\r\n]+)"\s*$/m);
  if (!code || !name) throw new Error('Cannot determine the Android release version from Gradle.');
  return { versionCode: Number(code[1]), versionName: name[1] };
}

export function createReleaseManifest({
  apkPath,
  artifactName = basename(apkPath),
  apksignerOutput,
  apkInspection,
  aaptOutput,
  expectedVersion = readSourceReleaseVersion(),
  checkedAt = new Date().toISOString(),
}) {
  const signerDigests = parseSignerSha256Digests(apksignerOutput);
  if (signerDigests.length === 0 || signerDigests.some((digest) => digest.length !== 64)) {
    throw new Error('apksigner did not report a valid SHA-256 signer certificate digest.');
  }
  if (signerDigests.length !== 1)
    throw new Error('Release APK must have exactly one current signer.');
  if (signerDigests[0] !== EXPECTED_ANDROID_13_CERT_SHA256) {
    throw new Error('Release certificate does not match the pinned Android 13+ signer.');
  }

  const apk = readFileSync(apkPath);
  const sha256 = createHash('sha256').update(apk).digest('hex');
  if (
    apkInspection?.schemaVersion !== 1 ||
    apkInspection.verified !== true ||
    apkInspection.sha256 !== sha256 ||
    apkInspection.v3 !== true ||
    apkInspection.signers?.length !== 1 ||
    apkInspection.signers[0] !== signerDigests[0]
  ) {
    throw new Error(
      'Native APK inspection is missing, invalid, or belongs to different APK bytes.',
    );
  }
  const lineage = apkInspection.lineage;
  if (
    !Array.isArray(lineage) ||
    lineage.length !== 2 ||
    lineage[0].sha256 !== LEGACY_ANDROID_CERT_SHA256 ||
    lineage[1].sha256 !== EXPECTED_ANDROID_13_CERT_SHA256 ||
    lineage[0].installedData !== true ||
    lineage[0].rollback !== false ||
    lineage[0].sharedUid !== false ||
    lineage[0].permission !== false ||
    lineage[0].auth !== false
  ) {
    throw new Error(
      'APK must include the verified legacy-to-current lineage with data continuity and no legacy rollback or privileged trust.',
    );
  }
  const metadata = parseApkMetadata(aaptOutput);
  if (
    metadata.packageName !== 'com.binalagoouz.manager' ||
    metadata.minimumAndroidApi !== 33 ||
    metadata.targetAndroidApi !== 35 ||
    metadata.versionCode !== expectedVersion.versionCode ||
    metadata.versionName !== expectedVersion.versionName ||
    /application-debuggable/.test(aaptOutput)
  ) {
    throw new Error(
      'APK package, version, Android API levels, or debug status does not match the release source.',
    );
  }
  if (artifactName !== basename(artifactName) || !artifactName.endsWith('.apk'))
    throw new Error('Invalid APK artifact filename.');
  return {
    schemaVersion: 2,
    artifact: artifactName,
    sha256,
    bytes: apk.length,
    signerCertificateSha256: signerDigests[0],
    ...metadata,
    signingLineage: lineage,
    checkedAt,
  };
}

export function verifyOutputAndWriteManifest({
  apkPath,
  artifactName,
  apksignerOutput,
  apkInspection,
  aaptOutput,
  manifestPath,
}) {
  const resolvedApk = resolve(apkPath);
  if (!existsSync(resolvedApk)) throw new Error(`APK not found: ${resolvedApk}`);

  const manifest = createReleaseManifest({
    apkPath: resolvedApk,
    artifactName,
    apksignerOutput,
    apkInspection,
    aaptOutput,
  });
  const target = resolve(manifestPath);
  const temporary = `${target}.${randomUUID()}.tmp`;
  let owned = false;
  try {
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    owned = true;
    renameSync(temporary, target);
    owned = false;
  } finally {
    if (owned) unlinkSync(temporary);
  }
  return manifest;
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (
      ![
        '--apk',
        '--signer-output',
        '--inspection',
        '--badging',
        '--manifest',
        '--artifact-name',
      ].includes(key) ||
      options[key.slice(2)] ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    ) {
      throw new Error(`Invalid or incomplete option: ${key}`);
    }
    options[key.slice(2)] = args[++i];
  }
  for (const key of [
    'apk',
    'signer-output',
    'inspection',
    'badging',
    'manifest',
    'artifact-name',
  ]) {
    if (!options[key]) throw new Error(`Missing required option: --${key}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifest = verifyOutputAndWriteManifest({
      apkPath: options.apk,
      artifactName: options['artifact-name'],
      apksignerOutput: readFileSync(options['signer-output'], 'utf8'),
      apkInspection: JSON.parse(readFileSync(options.inspection, 'utf8').replace(/^\uFEFF/, '')),
      aaptOutput: readFileSync(options.badging, 'utf8'),
      manifestPath: options.manifest,
    });
    process.stdout.write(`Release APK verified: SHA-256 ${manifest.sha256}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
