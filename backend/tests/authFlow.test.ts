import { describe, it, expect } from 'vitest';
import { login, refreshAccessToken } from '../src/services/authService.ts';
import { query } from '../src/database/pool.ts';
import { AppError } from '../src/types/errors.ts';

/** يضمن وجود مستخدم admin نشط في قاعدة الاختبار المعزولة */
const ensureAdminUser = async () => {
  const role = await query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`);
  const roleId = role.rows[0]?.id;
  if (!roleId) return;
  await query(
    `INSERT INTO users (username, password_hash, role_id, is_active, full_name)
     VALUES ('admin', '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DsAMd4xM8cLGOiNlYCL0eGyAxvW9q', $1, TRUE, 'مدير النظام')
     ON CONFLICT DO NOTHING`,
    [roleId],
  );
  await query(
    `UPDATE users SET is_active = TRUE, deleted_at = NULL, failed_login_attempts = 0, locked_until = NULL WHERE LOWER(username) = 'admin'`,
  );
};

describe('authService.login (isolated local DB)', () => {
  it('blocks the factory default admin credentials', async () => {
    await ensureAdminUser();
    await expect(login('admin', 'admin123')).rejects.toMatchObject({
      code: 'DEFAULT_CREDENTIALS_DISABLED',
      statusCode: 403,
    });
  });

  it('rejects unknown usernames without leaking user existence details', async () => {
    const err = await login('no_such_user_xyz', 'whatever').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('rejects wrong passwords for existing users', async () => {
    const err = await login('admin', 'definitely-not-the-password').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });
});

describe('authService.refreshAccessToken', () => {
  it('rejects invalid refresh tokens', async () => {
    const err = await refreshAccessToken('bogus-refresh-token').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });
});
