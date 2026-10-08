import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.dirname(desktopRoot);
const require = createRequire(path.join(desktopRoot, 'package.json'));

export function createDesktopBuildEnvironment(root = workspaceRoot, inherited = process.env) {
  const tempRoot = path.resolve(root, 'scratch', 'desktop-build-temp');
  mkdirSync(tempRoot, { recursive: true });
  return { ...inherited, TEMP: tempRoot, TMP: tempRoot, TMPDIR: tempRoot };
}

export function assertInstallerBuildInputs(root = desktopRoot, env = process.env, args = []) {
  if (args.length === 2 && args[0] === '--prepackaged') return;
  const buildRoot = env.POS_BUILD_ROOT ? path.resolve(root, env.POS_BUILD_ROOT) : root;
  const required = ['dist/index.html', 'dist-electron/main.js', 'dist-electron/preload.cjs'];
  const missing = required.filter((file) => !existsSync(path.join(buildRoot, file)));
  if (missing.length) {
    throw new Error(
      `Installer inputs are missing from ${buildRoot}: ${missing.join(', ')}. Run npm run build in desktop-pos first, or use npm run electron:build to build and package together.`,
    );
  }
}

function runStep(label, args, env) {
  process.stdout.write(`\n[Desktop build] ${label}\n`);
  const result = spawnSync(process.execPath, args, {
    cwd: desktopRoot,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const [mode = 'all', ...installerArgs] = process.argv.slice(2);
  if (!['all', 'renderer', 'installer'].includes(mode)) {
    throw new Error(
      'Usage: node scripts/run-desktop-build.mjs [all|renderer|installer] [installer args]',
    );
  }

  const env = createDesktopBuildEnvironment();
  const vitePackage = path.dirname(require.resolve('vite/package.json'));
  runStep(
    'apply reviewed dependency security patch',
    ['scripts/patch-http-cache-semantics.mjs'],
    env,
  );

  if (mode === 'all' || mode === 'renderer') {
    runStep(
      'build renderer, main process, and preload',
      [path.join(vitePackage, 'bin/vite.js'), 'build'],
      env,
    );
  }

  if (mode === 'all' || mode === 'installer') {
    assertInstallerBuildInputs(desktopRoot, env, installerArgs);
    runStep('package Windows installer', ['scripts/build-installer.mjs', ...installerArgs], env);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
