import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';

const { loadLocalEnvironment } = vi.hoisted(() => ({ loadLocalEnvironment: vi.fn() }));
vi.mock('dotenv', () => ({ default: { config: loadLocalEnvironment } }));

const localSecret = 'synthetic-local-file-secret-that-must-not-configure-cloud';
const cloudSecret = 'synthetic-platform-secret-for-environment-boundary-test';

beforeEach(() => {
  vi.resetModules();
  loadLocalEnvironment.mockReset();
  loadLocalEnvironment.mockImplementation(() => {
    if (process.env.JWT_SECRET === undefined) process.env.JWT_SECRET = localSecret;
    return { parsed: { JWT_SECRET: localSecret } };
  });
  for (const [name, value] of Object.entries({
    NODE_ENV: 'test',
    VERCEL: '',
    VERCEL_ENV: '',
    VERCEL_URL: '',
    DATABASE_URL: '',
    DB_HOST: '127.0.0.1',
    DB_USER: 'synthetic-user',
    DB_PASSWORD: 'synthetic-password',
    DB_NAME: 'synthetic_test',
    DB_SSL: 'false',
    DB_SSL_CA_FILE: '',
    JWT_SECRET: cloudSecret,
    JWT_REFRESH_SECRET: '',
    BACKUP_ENCRYPTION_KEY: 'synthetic-backup-key-for-environment-boundary-test',
    SUPPRESS_CONFIG_LOG: '1',
  }))
    vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('serverless environment boundary', () => {
  it.each(['VERCEL', 'VERCEL_ENV', 'VERCEL_URL'])(
    'does not load local files when %s identifies the cloud runtime',
    async (flag) => {
      vi.stubEnv(flag, flag === 'VERCEL' ? '1' : 'synthetic-preview');
      const { default: config } = await import('../src/config/index.ts');
      expect(config.jwt.secret).toBe(cloudSecret);
      expect(loadLocalEnvironment).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing cloud JWT secret instead of filling it from a local environment file', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('JWT_SECRET', undefined);
    await expect(import('../src/config/index.ts')).rejects.toThrow('JWT_SECRET');
    expect(loadLocalEnvironment).not.toHaveBeenCalled();
  });

  it('preserves local backend/root environment discovery outside the cloud runtime', async () => {
    vi.stubEnv('JWT_SECRET', undefined);
    const { default: config } = await import('../src/config/index.ts');
    expect(config.jwt.secret).toBe(localSecret);
    expect(loadLocalEnvironment).toHaveBeenCalledTimes(2);
    const locations = loadLocalEnvironment.mock.calls.map(([options]) =>
      options.path.replaceAll('\\', '/'),
    );
    expect(locations).toEqual(
      ['../.env', '../../.env'].map((location) =>
        fileURLToPath(new URL(location, import.meta.url)).replaceAll('\\', '/'),
      ),
    );
  });
});
