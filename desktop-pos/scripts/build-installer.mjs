import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function publishRelease(stageRoot, releaseRoot, files) {
  fs.mkdirSync(releaseRoot, { recursive: true });
  const lockPath = path.join(releaseRoot, '.installer-publication.lock');
  const lock = fs.openSync(lockPath, 'wx');
  let transaction;
  let retainRecovery = false;
  const changes = [];
  try {
    transaction = fs.mkdtempSync(path.join(releaseRoot, '.installer-publication-'));
    // Prepare every transfer before touching the existing release. Publish the
    // updater metadata last so it never advertises an unfinished transfer.
    for (const file of files) {
      const target = path.join(releaseRoot, file);
      try {
        if (!fs.lstatSync(target).isFile()) {
          throw new Error(`Installer destination must be a regular file: ${target}`);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      fs.copyFileSync(path.join(stageRoot, file), path.join(transaction, file));
    }
    for (const file of files) {
      const change = {
        target: path.join(releaseRoot, file),
        backup: path.join(transaction, `${file}.previous`),
        installed: false,
        backedUp: false,
      };
      changes.push(change);
      if (fs.existsSync(change.target)) {
        fs.renameSync(change.target, change.backup);
        change.backedUp = true;
      }
      fs.renameSync(path.join(transaction, file), change.target);
      change.installed = true;
    }
  } catch (error) {
    const recoveryErrors = [];
    for (const change of changes.reverse()) {
      try {
        if (change.installed) fs.unlinkSync(change.target);
        if (change.backedUp) fs.renameSync(change.backup, change.target);
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }
    if (recoveryErrors.length) {
      retainRecovery = true;
      throw new AggregateError(
        [error, ...recoveryErrors],
        `Installer publication and recovery failed. Recovery files: ${transaction}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
    if (transaction && !retainRecovery) {
      // This invocation owns this exact directory, inside the release directory.
      try {
        fs.rmSync(transaction, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Installer temporary files retained: ${transaction}: ${error.message}`);
      }
    }
  }
}

// NSIS executes an intermediate helper. Keep that native build step in Windows'
// temporary directory instead of a workspace volume that may reject execution.
export async function buildInstaller({
  build,
  targets,
  projectRoot = desktopRoot,
  env = process.env,
  tempRoot = os.tmpdir(),
  prepackaged,
}) {
  const config = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'electron-builder.json'), 'utf8'),
  );
  const releaseRoot = path.resolve(
    projectRoot,
    env.POS_RELEASE_ROOT || config.directories?.output || 'release',
  );
  const stageRoot = fs.mkdtempSync(path.join(path.resolve(tempRoot), 'AlAgoouz-POS-Installer-'));
  config.directories = { ...config.directories, output: stageRoot };
  if (env.POS_BUILD_ROOT && !prepackaged) {
    const buildRoot = path.resolve(projectRoot, env.POS_BUILD_ROOT);
    config.files = [
      { from: path.join(buildRoot, 'dist'), to: 'dist', filter: ['**/*'] },
      { from: path.join(buildRoot, 'dist-electron'), to: 'dist-electron', filter: ['**/*'] },
      'package.json',
    ];
  }
  const configPath = path.join(stageRoot, 'installer-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // A failed build leaves the previous release and the diagnostic stage intact.
  const artifacts = await build({
    projectDir: projectRoot,
    config: configPath,
    targets,
    publish: 'never',
    ...(prepackaged ? { prepackaged: path.resolve(projectRoot, prepackaged) } : {}),
  });
  const installerFiles = artifacts.filter((file) => file.endsWith('.exe'));
  if (
    !installerFiles.length ||
    !fs.existsSync(path.join(stageRoot, 'latest.yml')) ||
    installerFiles.some((file) => !fs.existsSync(file) || !fs.existsSync(`${file}.blockmap`))
  ) {
    throw new Error(`The installer build is incomplete. Diagnostic files: ${stageRoot}`);
  }
  if (installerFiles.some((file) => path.dirname(path.resolve(file)) !== stageRoot)) {
    throw new Error(`Installer artifacts must belong to the build stage: ${stageRoot}`);
  }
  const releaseFiles = [
    ...new Set(
      installerFiles.flatMap((file) => [path.basename(file), `${path.basename(file)}.blockmap`]),
    ),
    'latest.yml',
  ];
  publishRelease(stageRoot, releaseRoot, releaseFiles);
  // Only remove the exact temporary directory created by this invocation.
  if (
    path.dirname(stageRoot) !== path.resolve(tempRoot) ||
    !path.basename(stageRoot).startsWith('AlAgoouz-POS-Installer-')
  ) {
    throw new Error(`Unexpected installer stage path: ${stageRoot}`);
  }
  try {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Completed installer stage retained: ${stageRoot}: ${error.message}`);
  }
  return releaseFiles.map((file) => path.join(releaseRoot, file));
}

async function main() {
  const args = process.argv.slice(2);
  let prepackaged;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--prepackaged') {
      throw new Error(
        'Usage: node scripts/build-installer.mjs [--prepackaged <win-unpacked directory>]',
      );
    }
    prepackaged = args[1];
  }
  const { build, Platform, Arch } = await import('electron-builder');
  const artifacts = await buildInstaller({
    build,
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    prepackaged,
  });
  for (const artifact of artifacts) console.log(`Installer artifact: ${artifact}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
