import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { query } from '../database/pool.js';
import { AppError } from './errorHandler.js';

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('تسجيل الدخول مطلوب', 401, 'UNAUTHORIZED');
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const result = await query(
      `SELECT u.id, u.uuid, u.username, u.full_name, u.email, u.role_id, r.name as role_name, r.name_ar as role_name_ar
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [decoded.userId]
    );

    if (!result.rows[0]) {
      throw new AppError('المستخدم غير موجود أو غير نشط', 401, 'UNAUTHORIZED');
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('الرمز غير صالح أو منتهي الصلاحية', 401, 'INVALID_TOKEN'));
    }
    next(err);
  }
};

export const authorize = (...permissions) => async (req, res, next) => {
  try {
    // Admin يملك صلاحية كل شيء تلقائياً بدون DB query
    if (req.user?.role_name === 'admin') return next();

    const result = await query(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND p.code = ANY($2)`,
      [req.user.role_id, permissions]
    );

    if (!result.rows.length) {
      throw new AppError('ليس لديك صلاحية لتنفيذ هذه العملية', 403, 'FORBIDDEN');
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const auditLog = (action, entityType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  const tryWriteAudit = async (payload) => {
    if (res.statusCode >= 400 || !req.user) return;

    try {
      // Most API responses use: { success, data, message }
      const data = payload?.data ?? payload;
      const entityId =
        payload?.data?.id ??
        payload?.data?.entity_id ??
        payload?.data?.invoice_id ??
        null;

      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user.id, action, entityType, entityId, JSON.stringify(data ?? {}), req.ip]
      );
    } catch (_) { /* silent */ }
  };

  res.json = async (body) => {
    await tryWriteAudit(body);
    return originalJson(body);
  };

  res.send = async (body) => {
    // Buffer/templates/pdf: body may be a Buffer -> we log without assuming body.data.id
    await tryWriteAudit(body);
    return originalSend(body);
  };

  next();
};
