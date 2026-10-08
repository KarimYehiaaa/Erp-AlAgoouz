import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import config from '../src/config/index.ts';
import { query } from '../src/database/pool.ts';
import { login } from '../src/services/authService.ts';

const usernames: string[] = [];

afterEach(async () => {
  if (usernames.length === 0) return;
  const testUsernames = usernames.splice(0);
  const userResult = await query('SELECT id FROM users WHERE username = ANY($1::text[])', [
    testUsernames,
  ]);
  const userIds = userResult.rows.map((row) => row.id);
  if (userIds.length === 0) return;
  await query('DELETE FROM activity_logs WHERE user_id = ANY($1::int[])', [userIds]);
  await query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
});

describe('concurrent login lockout', () => {
  it('counts simultaneous wrong passwords atomically and locks the account at the limit', async () => {
    const roleResult = await query("SELECT id FROM roles WHERE name = 'admin' LIMIT 1");
    const roleId = roleResult.rows[0]?.id;
    expect(roleId).toBeTruthy();

    const username = `lockout_${randomUUID().replace(/-/g, '')}`;
    usernames.push(username);
    const passwordHash = await bcrypt.hash('CorrectTestPassword-482!', 10);
    await query(
      `INSERT INTO users (username, password_hash, role_id, is_active, full_name)
       VALUES ($1, $2, $3, TRUE, 'Concurrent Lockout Test')`,
      [username, passwordHash, roleId],
    );

    const threshold = Math.max(1, Number(config.auth.maxFailedAttempts) || 5);
    const attempts = await Promise.all(
      Array.from({ length: threshold }, () =>
        login(username, 'incorrect-password').catch((err) => err),
      ),
    );
    const state = await query(
      'SELECT failed_login_attempts, locked_until FROM users WHERE username = $1',
      [username],
    );

    expect(state.rows[0].failed_login_attempts).toBe(threshold);
    expect(new Date(state.rows[0].locked_until).getTime()).toBeGreaterThan(Date.now());
    expect(attempts.some((err) => err.statusCode === 403)).toBe(true);
  });
});
