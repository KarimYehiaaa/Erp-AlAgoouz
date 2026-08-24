import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.ts';
import { query, withTransaction } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const logFailedLogin = async (
  username: string,
  userId: number | null,
  meta: Record<string, any> = {},
  reason: string = 'invalid_credentials',
) => {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'auth', '\u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0641\u0627\u0634\u0644', $2)`,
      [
        userId || null,
        JSON.stringify({
          username,
          ip: meta.ip || null,
          userAgent: meta.userAgent || null,
          reason,
        }),
      ],
    );
  } catch (err: any) {
    console.error(
      '[Auth] \u0641\u0634\u0644 \u062A\u0633\u062C\u064A\u0644 \u0645\u062D\u0627\u0648\u0644\u0629 \u062F\u062E\u0648\u0644 \u0641\u0627\u0634\u0644\u0629:',
      err.message,
    );
  }
};
const issueTokens = (userId: number, roleName: string, tokenVersion: number = 0) => {
  const jti = uuidv4();
  const accessToken = jwt.sign(
    { userId, role: roleName, jti, ver: tokenVersion },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn as any,
    },
  );
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
  });
  return { accessToken, refreshToken };
};

/**
 * تسجيل دخول المستخدم والتحقق من كلمة المرور (مع قفل الحساب بعد 5 محاولات فاشلة).
 * @param {string} username اسم المستخدم أو البريد الإلكتروني
 * @param {string} password كلمة المرور
 * @param {{ ip?: string, userAgent?: string }} [meta] بيانات السياق (IP ومتصفح العميل)
 * @returns {Promise<{
 *   user: Record<string, any> & { requires_password_change?: boolean },
 *   permissions: any[],
 *   token: string,
 *   refreshToken: string,
 *   warning?: string,
 * }>}
 */
const login = async (username: string, password: string, meta: Record<string, any> = {}) => {
  const result = await query(
    `SELECT u.*, r.name as role_name, r.name_ar as role_name_ar
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE (LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)) AND u.deleted_at IS NULL`,
    [username],
  );
  const user = result.rows[0];
  if (!user || !user.is_active) {
    await logFailedLogin(username, user?.id || null, meta, user ? 'inactive_user' : 'unknown_user');
    throw new AppError(
      '\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629',
      401,
    );
  }
  if (user.locked_until && new Date(user.locked_until) > /* @__PURE__ */ new Date()) {
    const remainingMin = Math.ceil(
      (new Date(user.locked_until).getTime() - /* @__PURE__ */ new Date().getTime()) / 6e4,
    );
    throw new AppError(
      `\u062A\u0645 \u0642\u0641\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0624\u0642\u062A\u0627\u064B \u0644\u062D\u0645\u0627\u064A\u062A\u0647. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F ${remainingMin} \u062F\u0642\u064A\u0642\u0629.`,
      403,
    );
  }
  // ─── إزالة نهائية لبيانات الاعتماد الافتراضية (admin/admin123) ───
  if (user.username === 'admin' && password === 'admin123') {
    await logFailedLogin(username, user.id, meta, 'default_credentials_blocked');
    throw new AppError(
      '\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629 \u0645\u0639\u0637\u0644\u0629 \u0623\u0645\u0627\u0646\u064A\u0627\u064B \u2014 \u064A\u062C\u0628 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629 \u0644\u0644\u0645\u062F\u064A\u0631 \u0642\u0628\u0644 \u0627\u0644\u062F\u062E\u0648\u0644',
      403,
      'DEFAULT_CREDENTIALS_DISABLED',
    );
  }
  let valid = false;
  const hash = user.password_hash || '';
  if (hash.startsWith('$2')) {
    valid = await bcrypt.compare(password, hash);
  } else {
    // مقارنة زمنية ثابتة لتجنب تسريب التوقيت (مسار كلمات المرور القديمة النصية)
    const a = Buffer.from(password);
    const b = Buffer.from(hash);
    const legacyMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (legacyMatch) {
      valid = true;
      const newHash = await bcrypt.hash(password, 10);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
      console.log(
        `\u{1F512} [\u0628\u0646 \u0627\u0644\u0639\u062C\u0648\u0632 ERP] \u062A\u0645 \u062A\u0631\u0642\u064A\u0629 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0644\u0640 ${user.username} \u0625\u0644\u0649 bcrypt.`,
      );
    }
  }
  if (!valid) {
    await logFailedLogin(username, user.id, meta, 'wrong_password');
    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    if (failedAttempts >= config.auth.maxFailedAttempts) {
      await query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + make_interval(mins => $3) WHERE id = $2`,
        [
          failedAttempts,
          user.id,
          Math.max(1, Math.floor(Number(config.auth.lockoutMinutes) || 15)),
        ],
      );
      throw new AppError(
        '\u062A\u0645 \u0642\u0641\u0644 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0624\u0642\u062A\u0627\u064B (15 \u062F\u0642\u064A\u0642\u0629) \u0628\u0633\u0628\u0628 \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u062F\u062E\u0648\u0644 \u0645\u062A\u0643\u0631\u0631\u0629 \u062E\u0627\u0637\u0626\u0629.',
        403,
      );
    } else {
      await query(`UPDATE users SET failed_login_attempts = $1 WHERE id = $2`, [
        failedAttempts,
        user.id,
      ]);
      throw new AppError(
        '\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629',
        401,
      );
    }
  }
  await query(
    'UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
    [user.id],
  );
  const perms = await query(
    `SELECT p.code, p.name_ar, p.module FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [user.role_id],
  );
  const { accessToken, refreshToken } = issueTokens(
    user.id,
    user.role_name || '',
    Number(user.token_version) || 0,
  );
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, hashToken(refreshToken), expiresAt, meta.ip || null, meta.userAgent || null],
  );
  const isDefaultAdminPassword =
    user.username === 'admin' && (password === 'admin123' || user.password_hash === 'admin123');
  if (isDefaultAdminPassword) {
    console.warn(
      `\u26A0\uFE0F [\u0623\u0645\u0627\u0646 \u0627\u0644\u0646\u0638\u0627\u0645] \u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A (${user.username}). \u064A\u064F\u0646\u0635\u062D \u0628\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0641\u0648\u0631\u0627\u064B.`,
    );
  }
  const { password_hash, ...safeUser } = user;
  void password_hash;
  return {
    user: {
      ...safeUser,
      requires_password_change: isDefaultAdminPassword,
    },
    permissions: perms.rows,
    token: accessToken,
    refreshToken,
    warning: isDefaultAdminPassword
      ? '\u062A\u0646\u0628\u064A\u0647 \u0623\u0645\u0646\u064A: \u064A\u0631\u062C\u0649 \u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629 \u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062F\u064A\u0631 \u0644\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0646\u0638\u0627\u0645.'
      : void 0,
  };
};
/**
 * تجديد صلاحية الجلسة باستخدام Refresh Token صالح.
 * @param {string} refreshToken رمز التحديث
 * @returns {Promise<{ token: string, refreshToken: string }>}
 */
const refreshAccessToken = async (refreshToken: string) => {
  if (!refreshToken) throw new AppError('Refresh token مطلوب', 401);
  /** @type {any} */
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw new AppError('Refresh token غير صالح أو منتهي', 401, 'INVALID_REFRESH');
  }

  return await withTransaction(async (client) => {
    const tokenHash = hashToken(refreshToken);
    const result = await client.query(
      `SELECT rt.*, u.is_active, u.deleted_at, u.token_version, r.name as role_name
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE rt.token_hash = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()
       FOR UPDATE`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row || !row.is_active || row.deleted_at) {
      if (decoded.userId) {
        await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [
          decoded.userId,
        ]);
      }
      throw new AppError('الجلسة انتهت، يرجى تسجيل الدخول مرة أخرى', 401, 'INVALID_REFRESH');
    }
    await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);
    const { accessToken, refreshToken: newRefresh } = issueTokens(
      row.user_id,
      row.role_name,
      Number(row.token_version) || 0,
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.user_id, hashToken(newRefresh), expiresAt, row.ip_address, row.user_agent],
    );
    return { token: accessToken, refreshToken: newRefresh };
  });
};
/**
 * تسجيل الخروج: إبطال جميع توكنات التحديث للمستخدم وتسجيل النشاط.
 * @param {number} userId معرف المستخدم
 */
const logout = async (userId: number) => {
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE', [
    userId,
  ]);
  await query(
    `INSERT INTO activity_logs (user_id, module, action_ar) VALUES ($1, 'auth', '\u062A\u0633\u062C\u064A\u0644 \u062E\u0631\u0648\u062C')`,
    [userId],
  );
};
/**
 * جلب بيانات المستخدم وصلاحياته.
 * @param {number} userId معرف المستخدم
 * @returns {Promise<{ user: any, permissions: any[] }>}
 */
const getProfile = async (userId: number) => {
  const result = await query(
    `SELECT u.id, u.uuid, u.username, u.email, u.full_name, u.phone, u.role_id, r.name as role_name, r.name_ar as role_name_ar
     FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user)
    throw new AppError(
      '\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  const perms = await query(
    `SELECT p.code, p.name_ar, p.module FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [user.role_id],
  );
  return { user, permissions: perms.rows };
};
export { getProfile, login, logout, refreshAccessToken };
