import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const child = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('child_process', () => child);
vi.mock('node:child_process', () => child);

beforeEach(() => {
  vi.resetModules();
  child.execSync.mockReset();
  child.execFileSync.mockReset();
  vi.stubEnv('POSTGRES_PASSWORD', 'test-only-unused-child-password');
  vi.stubEnv('DB_HOST', '127.0.0.1');
  vi.stubEnv('DB_NAME', 'scripts_fixture_test');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('fixture exit 1');
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each([
  ['DB_HOST', 'db.example.invalid'],
  ['DB_NAME', 'postgres'],
  ['DB_NAME', 'bin_al_ajouz'],
])('rejects unsafe %s=%s before executing any child process', async (key, value) => {
  vi.stubEnv(key, value);
  await expect(import('../scripts/check-scripts.ts')).rejects.toThrow('fixture exit 1');
  expect(child.execSync).not.toHaveBeenCalled();
  expect(child.execFileSync).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(
    '❌ فشل فحص سكربتات الصيانة:',
    expect.stringContaining('Unsafe test database target'),
  );
});

it('accepts only a loopback test database and forwards it to setup and migration', async () => {
  await import('../scripts/check-scripts.ts');
  const calls = [...child.execSync.mock.calls, ...child.execFileSync.mock.calls];
  expect(calls.length).toBeGreaterThan(2);
  for (const call of calls) {
    const options = call.at(-1) as { env: Record<string, string> };
    expect(options.env.DB_HOST).toBe('127.0.0.1');
    expect(options.env.DB_NAME).toBe('scripts_fixture_test');
    expect(options.env.DATABASE_URL).toBe('');
  }
});
