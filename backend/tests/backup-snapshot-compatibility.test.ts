import { beforeEach, expect, it, vi } from 'vitest';

const { getClient, query, release } = vi.hoisted(() => ({
  getClient: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../src/database/pool.ts', () => ({ getClient }));

import { readBackupSnapshot } from '../src/services/backupService.ts';

beforeEach(() => {
  query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes("to_regclass('public.manager_override_tokens')")) {
      return { rows: [{ exists: false }] };
    }
    if (sql === 'SELECT * FROM manager_override_tokens') {
      throw new Error('relation "manager_override_tokens" does not exist');
    }
    return { rows: [] };
  });
  release.mockReset();
  getClient.mockReset().mockResolvedValue({ query, release });
});

it('keeps a complete backup contract when the not-yet-migrated override-token table is absent', async () => {
  const snapshot = await readBackupSnapshot();

  expect(snapshot.manager_override_tokens).toEqual([]);
  expect(snapshot.sales).toEqual([]);
  expect(query).toHaveBeenCalledWith("SELECT to_regclass('public.manager_override_tokens') IS NOT NULL AS exists");
  expect(query).not.toHaveBeenCalledWith('SELECT * FROM manager_override_tokens');
  expect(query).toHaveBeenLastCalledWith('COMMIT');
  expect(release).toHaveBeenCalledOnce();
});
