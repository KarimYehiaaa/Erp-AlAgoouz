import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.ts';
import { query, withTransaction } from '../database/pool.ts';
import { runSharedMaintenanceTask } from '../database/maintenanceBarrier.ts';
import { AppError } from '../types/errors.ts';
import { logger } from './loggerService.ts';
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
    logger.error(
      '[Auth] \u0641\u0634\u0644 \u062A\u0633\u062C\u064A\u0644 \u0645\u062D\u0627\u0648\u0644\u0629 \u062F\u062E\u0648\u0644 \u0641\u0627\u0634\u0644\u0629:',
      err.message,
    );
  }
};
const issueTokens = (
  userId: number,
  roleName: string,
  tokenVersion: number,
  sessionGeneration: string,
) => {
  const jti = uuidv4();
  const accessToken = jwt.sign(
    { userId, role: roleName, jti, ver: tokenVersion, gen: sessionGeneration },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn as any,
    },
  );
  const refreshToken = jwt.sign(
    { userId, type: 'refresh', jti: uuidv4(), ver: tokenVersion, gen: sessionGeneration },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn as any,
    },
  );
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
const login = async (username: string, password: string, meta: Record<string, any> = {}) =>
  runSharedMaintenanceTask(async () => {
    const result = await query(
      `SELECT u.*, r.name as role_name, r.name_ar as role_name_ar
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE (LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)) AND u.deleted_at IS NULL`,
      [username],
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      await logFailedLogin(
        username,
        user?.id || null,
        meta,
        user ? 'inactive_user' : 'unknown_user',
      );
      throw new AppError(
        '\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629',
        401,
      );
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMin = Math.ceil(
        (new Date(user.locked_until).getTime() - new Date().getTime()) / 6e4,
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
    const hash = typeof user.password_hash === 'string' ? user.password_hash.trim() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (cleanPassword.length > 0 && hash.length > 0) {
      if (hash.startsWith('$2')) {
        valid = await bcrypt.compare(cleanPassword, hash);
      } else if (cleanPassword.length >= 4 && hash.length >= 4) {
        // مقارنة زمنية ثابتة لتجنب تسريب التوقيت (مسار كلمات المرور القديمة النصية الموثقة)
        const a = Buffer.from(cleanPassword);
        const b = Buffer.from(hash);
        const legacyMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (legacyMatch) {
          valid = true;
          const newHash = await bcrypt.hash(cleanPassword, 10);
          await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
          logger.info(
            `🔒 [بن العجوز ERP] تم ترقية كلمة المرور تلقائياً لـ ${user.username} إلى bcrypt.`,
          );
        }
      }
    }
    if (!valid) {
      await logFailedLogin(username, user.id, meta, 'wrong_password');
      const maxFailedAttempts = Math.max(1, Math.floor(Number(config.auth.maxFailedAttempts) || 5));
      const lockoutMinutes = Math.max(1, Math.floor(Number(config.auth.lockoutMinutes) || 15));
      const failureState = await query(
        `UPDATE users
         SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
             locked_until = CASE
               WHEN COALESCE(failed_login_attempts, 0) + 1 >= $1
                 THEN NOW() + make_interval(mins => $2)
               ELSE locked_until
             END
         WHERE id = $3
         RETURNING failed_login_attempts, locked_until`,
        [maxFailedAttempts, lockoutMinutes, user.id],
      );
      const failedAttempts = Number(failureState.rows[0]?.failed_login_attempts) || 0;
      if (failedAttempts >= maxFailedAttempts) {
        const lockedUntil = failureState.rows[0]?.locked_until;
        const remainingMinutes = lockedUntil
          ? Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 6e4))
          : lockoutMinutes;
        throw new AppError(
          `تم قفل الحساب مؤقتاً لمدة ${remainingMinutes} دقيقة بسبب محاولات دخول متكررة خاطئة.`,
          403,
        );
      } else {
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
      user.session_generation,
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
      logger.warn(
        `\u26A0\uFE0F [\u0623\u0645\u0627\u0646 \u0627\u0644\u0646\u0638\u0627\u0645] \u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A (${user.username}). \u064A\u064F\u0646\u0635\u062D \u0628\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0641\u0648\u0631\u0627\u064B.`,
      );
    }
    const { password_hash, session_generation, ...safeUser } = user;
    void password_hash;
    void session_generation;
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
  });
/**
 * تجديد صلاحية الجلسة باستخدام Refresh Token صالح.
 * @param {string} refreshToken رمز التحديث
 * @returns {Promise<{ token: string, refreshToken: string }>}
 */
const refreshAccessToken = async (refreshToken: string, authorization?: string) => {
  if (!refreshToken) throw new AppError('Refresh token مطلوب', 401);
  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (decoded.type !== 'refresh' || !Number.isInteger(decoded.userId) || decoded.userId <= 0) {
      throw new AppError('Refresh token غير صالح', 401, 'INVALID_REFRESH');
    }
  } catch {
    throw new AppError('Refresh token غير صالح أو منتهي', 401, 'INVALID_REFRESH');
  }
  if (authorization !== undefined) {
    try {
      const accessToken = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
      if (!accessToken) throw new Error('Missing bearer identity');
      // Expired access tokens still identify the caller; the valid refresh token
      // is the credential. Never renew a different account from a shared cookie.
      const access = jwt.verify(accessToken, config.jwt.secret, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      }) as jwt.JwtPayload;
      if (access.userId !== decoded.userId) throw new Error('Different account');
    } catch {
      throw new AppError('تغير الحساب. يرجى تسجيل الدخول مرة أخرى', 401, 'SESSION_CONTEXT_CHANGED');
    }
  }

  return await withTransaction(async (client) => {
    // Lock the account before its refresh rows, matching logout/revocation.
    // This serializes rotation with account-wide revocation without lock inversion.
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [decoded.userId]);
    const tokenHash = hashToken(refreshToken);
    const result = await client.query(
      `SELECT rt.*, u.is_active, u.deleted_at, u.token_version, u.session_generation, r.name as role_name
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE rt.token_hash = $1 AND rt.user_id = $2
       FOR UPDATE OF rt`,
      [tokenHash, decoded.userId],
    );
    const row = result.rows[0];
    if (!row || !row.is_active || row.deleted_at) {
      throw new AppError('الجلسة انتهت، يرجى تسجيل الدخول مرة أخرى', 401, 'INVALID_REFRESH');
    }
    if (row.revoked || new Date(row.expires_at) <= new Date()) {
      throw new AppError('رمز التحديث غير صالح أو منتهي الصلاحية', 401, 'INVALID_REFRESH');
    }
    if (
      (decoded.ver ?? 0) !== (Number(row.token_version) || 0) ||
      typeof row.session_generation !== 'string' ||
      decoded.gen !== row.session_generation
    ) {
      throw new AppError('تم إلغاء الجلسة. يرجى تسجيل الدخول مرة أخرى', 401, 'SESSION_REVOKED');
    }
    await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);
    const { accessToken, refreshToken: newRefresh } = issueTokens(
      row.user_id,
      row.role_name,
      Number(row.token_version) || 0,
      row.session_generation,
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
  await withTransaction(async (client) => {
    const user = await client.query(
      'UPDATE users SET token_version=COALESCE(token_version,0)+1 WHERE id=$1 RETURNING id',
      [userId],
    );
    if (!user.rows[0]) throw new AppError('المستخدم غير موجود', 401, 'UNAUTHORIZED');
    await client.query(
      'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE',
      [userId],
    );
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar) VALUES ($1, 'auth', '\u062A\u0633\u062C\u064A\u0644 \u062E\u0631\u0648\u062C')`,
      [userId],
    );
  });
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
