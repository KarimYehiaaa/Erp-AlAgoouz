import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const frontend = path.join(root, 'frontend');
const frontendRequire = createRequire(path.join(frontend, 'package.json'));
const vite = path.join(path.dirname(frontendRequire.resolve('vite/package.json')), 'bin/vite.js');
const env = {
  ...process.env,
  VITE_API_URL: 'http://127.0.0.1:4173',
  VITE_SENTRY_DSN: '',
  ERP_WEB_API_BROWSER_TEST: '1',
  ERP_WEB_API_BUILD_DIR: '.playwright-dist',
};

for (const [cwd, args] of [
  [frontend, [vite, 'build', '--outDir', '.playwright-dist']],
  [path.join(root, 'backend'), ['scripts/run-vitest-local.ts', 'tests/web-api-browser.test.ts']],
]) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Browser integration stage failed${result.signal ? ` (${result.signal})` : ''}`);
    process.exit(result.status ?? 1);
  }
}
