import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { query, getClient } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';

/** Hash a refresh token for secure DB storage */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Generate access + refresh token pair */
const issueTokens = (userId, roleName) => {
  const jti = uuidv4();
  const accessToken = jwt.sign(
    { userId, role: roleName, jti },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
  return { accessToken, refreshToken };
};

export const login = async (username, password, meta = {}) => {
  const result = await query(
    `SELECT u.*, r.name as role_name, r.name_ar as role_name_ar
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE (LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)) AND u.deleted_at IS NULL`,
    [username]
  );

  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new AppError('اسم المستخدم أو كلمة المرور غير صحيحة', 401);
  }

  let valid = false;
  const hash = user.password_hash || '';
  if (hash.startsWith('$2')) {
    valid = await bcrypt.compare(password, hash);
  } else {
    if (password === hash) {
      valid = true;
      const newHash = await bcrypt.hash(password, 10);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
      console.log(`🔒 [بن العجوز ERP] تم ترقية كلمة المرور تلقائياً لـ ${user.username} إلى bcrypt.`);
    }
  }
  if (!valid) {
    throw new AppError('اسم المستخدم أو كلمة المرور غير صحيحة', 401);
  }

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const perms = await query(
    `SELECT p.code, p.name_ar, p.module FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [user.role_id]
  );

  const { accessToken, refreshToken } = issueTokens(user.id, user.role_name);

  // Save hashed refresh token in DB
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, hashToken(refreshToken), expiresAt, meta.ip || null, meta.userAgent || null]
  );

  await query(
    `INSERT INTO activity_logs (user_id, module, action_ar) VALUES ($1, 'auth', 'تسجيل دخول')`,
    [user.id]
  );

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, permissions: perms.rows, token: accessToken, refreshToken };
};

export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) throw new AppError('Refresh token مطلوب', 401);

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw new AppError('Refresh token غير صالح أو منتهي', 401, 'INVALID_REFRESH');
  }

  const tokenHash = hashToken(refreshToken);
  const result = await query(
    `SELECT rt.*, u.is_active, u.deleted_at, r.name as role_name
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     JOIN roles r ON u.role_id = r.id
     WHERE rt.token_hash = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row || !row.is_active || row.deleted_at) {
    // If token found but user inactive, revoke all user tokens
    if (decoded.userId) {
      await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [decoded.userId]);
    }
    throw new AppError('الجلسة انتهت، يرجى تسجيل الدخول مرة أخرى', 401, 'INVALID_REFRESH');
  }

  // Token Rotation: revoke old, issue new pair
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);

  const { accessToken, refreshToken: newRefresh } = issueTokens(row.user_id, row.role_name);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.user_id, hashToken(newRefresh), expiresAt, row.ip_address, row.user_agent]
  );

  return { token: accessToken, refreshToken: newRefresh };
};

export const logout = async (userId) => {
  // Revoke all refresh tokens for this user
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE', [userId]);

  await query(
    `INSERT INTO activity_logs (user_id, module, action_ar) VALUES ($1, 'auth', 'تسجيل خروج')`,
    [userId]
  );
};

export const getProfile = async (userId) => {
  const result = await query(
    `SELECT u.id, u.uuid, u.username, u.email, u.full_name, u.phone, u.role_id, r.name as role_name, r.name_ar as role_name_ar
     FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [userId]
  );
  const user = result.rows[0];
  if (!user) throw new AppError('المستخدم غير موجود', 404);

  const perms = await query(
    `SELECT p.code, p.name_ar, p.module FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [user.role_id]
  );

  return { user, permissions: perms.rows };
};
