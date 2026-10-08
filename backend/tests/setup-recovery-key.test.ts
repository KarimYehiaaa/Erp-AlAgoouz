import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const originalKey = 'caller-provided-isolated-recovery-key-never-deploy';

it.each([
  ['ordinary', '', '', '', false],
  ['synthetic restore', '1', '', '', false],
  ['encrypted shared restore', '1', '1', '', true],
  ['encrypted historical upgrade', '', '', '1', true],
  ['both encrypted drills', '1', '1', '1', true],
])(
  'isolates authentication keys and selects the correct backup key for %s',
  (_name, restore, shared, upgrade, preserved) => {
    // Load the actual setup before configuration in a fresh process. No app/pool
    // or database connection is created, and inherited production preloads are disabled.
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `await import('./tests/setup-env.ts');
        console.log('RECOVERY_KEY_STATE=' + JSON.stringify({
          preserved: process.env.BACKUP_ENCRYPTION_KEY === process.env.ERP_KEY_FIXTURE_EXPECTED,
          isolatedAccess: process.env.JWT_SECRET === 'alagoouz-isolated-test-access-secret-never-deploy',
          isolatedRefresh: process.env.JWT_REFRESH_SECRET === 'alagoouz-isolated-test-refresh-secret-never-deploy',
        }));`,
      ],
      {
        cwd: backendRoot,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          NODE_OPTIONS: '',
          DATABASE_URL: '',
          DB_HOST: '127.0.0.1',
          DB_PORT: '1',
          DB_NAME: 'isolated_recovery_key_fixture_test',
          DB_USER: 'isolated-fixture-user',
          DB_PASSWORD: 'isolated-fixture-password',
          POSTGRES_PASSWORD: 'isolated-fixture-password',
          DB_SSL: 'false',
          DB_SSL_CA_FILE: '',
          DB_POOL_MODE: 'auto',
          SUPPRESS_CONFIG_LOG: '1',
          VERCEL: '',
          VERCEL_ENV: '',
          VERCEL_URL: '',
          REDIS_URL: '',
          SENTRY_DSN: '',
          TELEGRAM_BOT_TOKEN: '',
          TELEGRAM_CHAT_ID: '',
          JWT_SECRET: 'caller-access-key-must-not-be-used-by-tests',
          JWT_REFRESH_SECRET: 'caller-refresh-key-must-not-be-used-by-tests',
          BACKUP_ENCRYPTION_KEY: originalKey,
          ERP_KEY_FIXTURE_EXPECTED: originalKey,
          ERP_RESTORE_TEST: restore as string,
          ERP_SHARED_BACKUP_DRILL: shared as string,
          ERP_UPGRADE_DRILL: upgrade as string,
        },
      },
    );
    expect(child.error, child.error?.message).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const state = /^RECOVERY_KEY_STATE=(.+)$/m.exec(child.stdout);
    expect(state, 'setup did not return its redacted key selection state').not.toBeNull();
    expect(JSON.parse(state![1])).toEqual({
      preserved,
      isolatedAccess: true,
      isolatedRefresh: true,
    });
  },
  30000,
);
