import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ runMigrations: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../src/database/connectionOptions.ts', () => ({
  databaseConnectionOptions: () => ({
    connectionString: 'postgresql://fixture:fictional@fixture.pooler.supabase.com:6543/postgres',
    host: null,
    port: null,
    ssl: true,
  }),
  isLoopbackDatabaseConnection: () => false,
}));
vi.mock('../src/database/pool.ts', () => ({ closePool: vi.fn() }));
vi.mock('../scripts/migrate.ts', () => ({ runMigrations: fixture.runMigrations }));

describe('setup wizard remote database safety', () => {
  it('delegates configured remote endpoints to the migration approval guard', async () => {
    const { setupDatabase } = await import('../src/database/setup.ts');

    await setupDatabase();

    expect(fixture.runMigrations).toHaveBeenCalledOnce();
  });
});
