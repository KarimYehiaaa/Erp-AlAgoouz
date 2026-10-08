import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [path.join(backendRoot, 'scripts/run-vitest-local.ts'), 'tests/runtime-server-boot.test.ts'],
  {
    cwd: backendRoot,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, DB_NAME: '', ERP_BOOT_LIFECYCLE_TEST: '1' },
  },
);
if (result.error) console.error('تعذر تشغيل اختبار بدء الخادم:', result.error.message);
process.exitCode = result.status ?? 1;
