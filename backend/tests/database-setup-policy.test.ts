import { describe, expect, it } from 'vitest';
import { canAutoProvisionDatabase } from '../src/database/setup.ts';

describe('database setup provisioning boundary', () => {
  it('allows automatic provisioning only for explicit loopback host settings', () => {
    expect(canAutoProvisionDatabase({ host: 'localhost' })).toBe(true);
    expect(canAutoProvisionDatabase({ host: '127.0.0.1' })).toBe(true);
    expect(
      canAutoProvisionDatabase({
        connectionString: 'postgresql://fixture:fictional@localhost:5432/fixture_test',
        host: null,
      }),
    ).toBe(false);
    expect(
      canAutoProvisionDatabase({
        connectionString:
          'postgresql://fixture:fictional@fixture.pooler.supabase.com:6543/postgres',
        host: null,
      }),
    ).toBe(false);
    expect(canAutoProvisionDatabase({ host: 'db.example.invalid' })).toBe(false);
  });
});
