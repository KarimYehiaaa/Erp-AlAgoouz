import { describe, expect, it } from 'vitest';
import { assertMigrationsAllowed } from '../src/database/migrationApproval.ts';

describe('remote database migration approval', () => {
  it('keeps loopback development databases on automatic migration behavior', () => {
    expect(() =>
      assertMigrationsAllowed({ host: 'localhost', port: 5432 }, ['001_schema.sql'], false),
    ).not.toThrow();
  });

  it('blocks pending migrations on Supabase unless approval is explicit', () => {
    expect(() =>
      assertMigrationsAllowed(
        { connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres' },
        ['091_restore_session_generation.sql'],
        false,
      ),
    ).toThrow(/migrate-supabase -w backend -- --allow-remote/);
  });

  it('allows a specifically approved remote migration run', () => {
    expect(() =>
      assertMigrationsAllowed(
        { connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres' },
        ['091_restore_session_generation.sql'],
        true,
      ),
    ).not.toThrow();
  });

  it('applies the same protection to other remote PostgreSQL endpoints', () => {
    expect(() =>
      assertMigrationsAllowed(
        { host: 'db.internal.example', port: 5432 },
        ['094_restrict_direct_api_role_privileges.sql'],
        false,
      ),
    ).toThrow(/remote database/);
  });

  it('does not block a remote API startup when there are no pending migrations', () => {
    expect(() =>
      assertMigrationsAllowed(
        { connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres' },
        [],
        false,
      ),
    ).not.toThrow();
  });

  it('blocks remote migration tracking writes even when no SQL migration is pending', () => {
    expect(() =>
      assertMigrationsAllowed(
        { connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres' },
        [],
        false,
        undefined,
        true,
      ),
    ).toThrow(/migration tracking updates/);
  });

  it('keeps the Docker Compose postgres service classified as local', () => {
    expect(() =>
      assertMigrationsAllowed(
        { host: 'postgres', port: 5432 },
        ['094_restrict_direct_api_role_privileges.sql'],
        false,
        'postgres',
      ),
    ).not.toThrow();
  });
});
