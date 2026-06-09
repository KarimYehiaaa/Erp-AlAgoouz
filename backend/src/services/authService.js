import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';

export const login = async (username, password) => {
  const result = await query(
    `SELECT u.*, r.name as role_name, r.name_ar as role_name_ar
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE (u.username = $1 OR u.email = $1) AND u.deleted_at IS NULL`,
    [username]
  );

  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw new AppError('اسم المستخدم أو كلمة المرور غير صحيحة', 401);
  }

  let valid = false;
  const hash = user.password_hash || '';
  if (hash.startsWith('$2')) {
    // bcrypt — الطريقة الآمنة والمعتمدة
    valid = await bcrypt.compare(password, hash);
  } else {
    // كلمة مرور قديمة (غير bcrypt) — يُطلب من المستخدم التواصل مع الأدمن
    throw new AppError(
      'كلمة مرورك قديمة وغير مدعومة. تواصل مع مسؤول النظام لإعادة تعيينها.',
      401
    );
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

  const token = jwt.sign({ userId: user.id, role: user.role_name }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  await query(
    `INSERT INTO activity_logs (user_id, module, action_ar) VALUES ($1, 'auth', 'تسجيل دخول')`,
    [user.id]
  );

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, permissions: perms.rows, token };
};

export const getProfile = async (userId) => {
  const result = await query(
    `SELECT u.id, u.uuid, u.username, u.email, u.full_name, u.phone, u.role_id, r.name as role_name, r.name_ar as role_name_ar
     FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0];
};
