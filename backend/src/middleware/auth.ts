import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import config from '../config/index.js';
import { query } from '../database/pool.js';
import { AppError } from '../types/errors.js';
import type { AuthRequest, User } from '../types/index.js';

interface JwtPayload {
  userId: number;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('تسجيل الدخول مطلوب', 401, 'UNAUTHORIZED');
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    const result = await query<User>(
      `SELECT u.id, u.uuid, u.username, u.full_name, u.email, u.role_id, u.password_changed_at, r.name as role_name, r.name_ar as role_name_ar
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [decoded.userId],
    );

    if (!result.rows[0]) {
      throw new AppError('المستخدم غير موجود أو غير نشط', 401, 'UNAUTHORIZED');
    }

    // Reject tokens issued before password change
    const user = result.rows[0];
    if (user.password_changed_at) {
      const changedAtSec = Math.floor(new Date(user.password_changed_at).getTime() / 1000);
      if (decoded.iat < changedAtSec) {
        throw new AppError(
          'تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى',
          401,
          'PASSWORD_CHANGED',
        );
      }
    }

    req.user = {
      userId: user.id,
      role: user.role_name || '',
      jti: decoded.jti
    };
    // Also attach full user object temporarily for compatibility until all controllers are typed
    (req as any).user = user; 
    
    next();
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('الرمز غير صالح أو منتهي الصلاحية', 401, 'INVALID_TOKEN'));
    }
    next(err);
  }
};

export const authorize =
  (...permissions: string[]) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Admin يملك صلاحية كل شيء تلقائياً بدون DB query
      if ((req as any).user?.role_name === 'admin' || req.user?.role === 'admin') return next();

      const roleId = (req as any).user?.role_id;
      if (!roleId) throw new AppError('غير مصرح لك', 401, 'UNAUTHORIZED');

      const result = await query(
        `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND p.code = ANY($2)`,
        [roleId, permissions],
      );

      if (!result.rows.length) {
        throw new AppError('ليس لديك صلاحية لتنفيذ هذه العملية', 403, 'FORBIDDEN');
      }
      next();
    } catch (err) {
      next(err);
    }
  };

export const auditLog = (action: string, entityType: string) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  const tryWriteAudit = async (payload: any) => {
    if (res.statusCode >= 400 || !req.user) return;

    try {
      // Most API responses use: { success, data, message }
      const data = payload?.data ?? payload;
      const entityId =
        payload?.data?.id ?? payload?.data?.entity_id ?? payload?.data?.invoice_id ?? null;
      
      const userId = (req as any).user?.id || req.user.userId;

      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, action, entityType, entityId, JSON.stringify(data ?? {}), req.ip],
      );
    } catch (auditErr: any) {
      console.error('[AuditLog] فشل حفظ سجل التدقيق:', auditErr.message);
    }
  };

  res.json = async function(body: any) {
    await tryWriteAudit(body);
    return originalJson(body);
  } as any;

  res.send = async function(body: any) {
    // Buffer/templates/pdf: body may be a Buffer -> we log without assuming body.data.id
    await tryWriteAudit(body);
    return originalSend(body);
  } as any;

  next();
};
