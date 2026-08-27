import jwt from 'jsonwebtoken';
import config from '../config/index.ts';
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { ADMIN_ROLES, expandPermissionCodes } from '../../../shared/permissions.js';
import type { User } from '../../../shared/types.ts';
import { logger } from '../services/loggerService.ts';
/**
 * التحقق من صحة توكن JWT في رأس Authorization وتحميل بيانات المستخدم على req.user.
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} next تمرير الخطأ أو المتابعة
 */
const authenticate = async (req, res, next) => {
  try {
    // قراءة التوكن من Cookie أو من Header (دعم الطريقتين للتوافقية)
    const header = req.headers.authorization;
    const token =
      req.cookies?.access_token || (header?.startsWith('Bearer ') ? header.split(' ')[1] : null);
    if (!token) {
      throw new AppError('تسجيل الدخول مطلوب', 401, 'UNAUTHORIZED');
    }
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as import('jsonwebtoken').JwtPayload;
    const result = await query(
      `SELECT u.id, u.uuid, u.username, u.full_name, u.email, u.role_id, u.password_changed_at, u.token_version, r.name as role_name, r.name_ar as role_name_ar
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [decoded.userId],
    );
    if (!result.rows[0]) {
      throw new AppError('المستخدم غير موجود أو غير نشط', 401, 'UNAUTHORIZED');
    }
    const user = result.rows[0] as User;
    // إبطال فوري لتوكنات الوصول عند إلغاء كل الجلسات أو تغيير الصلاحيات
    if (
      user.token_version !== undefined &&
      user.token_version !== null &&
      (decoded.ver ?? 0) !== Number(user.token_version)
    ) {
      throw new AppError('تم إلغاء الجلسة. يرجى تسجيل الدخول مرة أخرى', 401, 'SESSION_REVOKED');
    }
    if (user.password_changed_at) {
      const changedAtSec = Math.floor(new Date(user.password_changed_at).getTime() / 1e3);
      if ((decoded.iat ?? 0) < changedAtSec) {
        throw new AppError(
          'تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى',
          401,
          'PASSWORD_CHANGED',
        );
      }
    }
    req.user = {
      ...user,
      userId: user.id,
      role: user.role_name || '',
      jti: decoded.jti,
    };
    next();
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('الرمز غير صالح أو منتهي الصلاحية', 401, 'INVALID_TOKEN'));
    }
    next(err);
  }
};
/**
 * التحقق من صلاحيات المستخدم (الأدوار الإدارية تمر دائمًا، وإلا تُفحص صلاحيات الدور).
 * @param {string[]} permissions رموز الصلاحيات المطلوبة
 * @returns {import('express').RequestHandler} middleware التحقق
 */
const authorize =
  (...permissions) =>
  async (req, res, next) => {
    try {
      const userRole = req.user?.role_name || req.user?.role;
      if (ADMIN_ROLES.includes(userRole)) return next();
      const roleId = req.user?.role_id;
      if (!roleId) throw new AppError('غير مصرح لك', 401, 'UNAUTHORIZED');

      // Find acceptable permissions for the requested permission codes
      const acceptablePermissions = expandPermissionCodes(permissions);

      const result = await query(
        `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND p.code = ANY($2)`,
        [roleId, Array.from(acceptablePermissions)],
      );
      if (!result.rows.length) {
        throw new AppError('ليس لديك صلاحية لتنفيذ هذه العملية', 403, 'FORBIDDEN');
      }
      next();
    } catch (err: any) {
      next(err);
    }
  };
/**
 * تسجيل تدقيق تلقائي في activity/audit_logs عند إتمام الاستجابة بنجاح.
 * @param {string} action الإجراء المنفذ (create/update/delete...)
 * @param {string} entityType نوع الكيان (products، sales...)
 * @returns {import('express').RequestHandler} middleware التسجيل
 */
const auditLog = (action, entityType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  const tryWriteAudit = async (payload) => {
    if (res.statusCode >= 400 || !req.user) return;
    try {
      const data = payload?.data ?? payload;
      const entityId =
        payload?.data?.id ?? payload?.data?.entity_id ?? payload?.data?.invoice_id ?? null;
      const userId = req.user?.id || req.user.userId;
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, action, entityType, entityId, JSON.stringify(data ?? {}), req.ip],
      );
    } catch (auditErr: any) {
      logger.error(
        '[AuditLog] \u0641\u0634\u0644 \u062D\u0641\u0638 \u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642:',
        auditErr.message,
      );
    }
  };
  res.json = function (body) {
    tryWriteAudit(body).catch((err) => logger.error('[AuditLog]', err.message));
    return originalJson(body);
  };
  res.send = function (body) {
    tryWriteAudit(body).catch((err) => logger.error('[AuditLog]', err.message));
    return originalSend(body);
  };
  next();
};
export { auditLog, authenticate, authorize };
