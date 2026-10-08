/** Central, fail-closed protection against duplicate financial requests. */
import type { Request, Response, NextFunction } from 'express';
import { query } from '../database/pool.ts';
import { logger } from '../services/loggerService.ts';

// Retained for callers of the former memory fallback; ownership now lives only in PostgreSQL.
export const clearIdempotencyMemory = (): void => {};

export const requireIdempotency = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key || typeof key !== 'string' || !key.trim()) return next();

  const basePath = (req.originalUrl || req.url || '').split('?')[0];
  const userId = (req as any).user?.id || (req as any).user?.userId || null;
  if ((req.headers.authorization || (req as any).cookies?.access_token) && !userId) {
    res
      .status(401)
      .json({ success: false, code: 'UNAUTHORIZED', message: 'يلزم تسجيل الدخول مجدداً' });
    return;
  }
  const scope = userId ? `user:${userId}` : `anon:${req.ip || 'noip'}`;
  const scopedKey = `${scope}:${req.method}:${basePath}:${key.trim()}`;
  if (scopedKey.length > 128) {
    res.status(400).json({
      success: false,
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'مفتاح العملية أطول من المسموح',
    });
    return;
  }

  let claimToken: string;
  try {
    // Only an expired COMPLETED response may be replaced. A PROCESSING request might
    // have committed its transaction even when its client disconnected or returned 5xx.
    const claim = await query(
      `INSERT INTO idempotency_records (key, user_id, request_path, status, locked_at, expires_at)
       VALUES ($1, $2, $3, 'PROCESSING', NOW(), NOW() + INTERVAL '24 hours')
       ON CONFLICT (key) DO UPDATE
       SET status = 'PROCESSING', locked_at = NOW(), expires_at = NOW() + INTERVAL '24 hours',
           user_id = EXCLUDED.user_id, request_path = EXCLUDED.request_path,
           status_code = NULL, response_body = NULL
       WHERE idempotency_records.status = 'COMPLETED' AND idempotency_records.expires_at <= NOW()
       RETURNING EXTRACT(EPOCH FROM locked_at)::text AS claim_token`,
      [scopedKey, userId, basePath],
    );
    if (!claim.rowCount) {
      const existing = await query(
        `SELECT status, status_code, response_body, user_id FROM idempotency_records WHERE key = $1`,
        [scopedKey],
      );
      const record = existing.rows[0];
      if (record?.status === 'COMPLETED' && record.status_code) {
        if (record.user_id && Number(record.user_id) !== Number(userId)) {
          res
            .status(403)
            .json({ success: false, code: 'FORBIDDEN', message: 'غير مصرح بالوصول إلى العملية' });
          return;
        }
        const body =
          typeof record.response_body === 'string'
            ? JSON.parse(record.response_body)
            : record.response_body;
        res.status(record.status_code).json({ ...body, _idempotentReplay: true });
        return;
      }
      // An absent row after a conflicting claim is also unsafe: never execute unowned work.
      res.status(409).json({
        success: false,
        code: 'REQUEST_IN_PROGRESS',
        message: 'العملية قيد المعالجة أو تحتاج مراجعة نتيجتها قبل إعادة المحاولة',
      });
      return;
    }
    claimToken = claim.rows[0].claim_token;
  } catch (err) {
    logger.error('[Idempotency] Could not claim the central request lock', err);
    res.status(503).json({
      success: false,
      code: 'IDEMPOTENCY_UNAVAILABLE',
      message: 'تعذر تأمين العملية. يرجى المحاولة لاحقاً بنفس المفتاح',
    });
    return;
  }

  const originalJson = res.json.bind(res);
  let responseStarted = false;
  res.json = function (body: any) {
    if (responseStarted) return res;
    responseStarted = true;
    const statusCode = res.statusCode;
    // Persist before delivering the result so an immediate retry on another server
    // observes the same outcome. Errors and disconnects never release uncertain work.
    void (async () => {
      try {
        const completed = await query(
          `UPDATE idempotency_records
           SET status = 'COMPLETED', status_code = $2, response_body = $3, locked_at = NULL
           WHERE key = $1 AND status = 'PROCESSING' AND EXTRACT(EPOCH FROM locked_at)::text = $4 RETURNING key`,
          [scopedKey, statusCode, JSON.stringify(body), claimToken],
        );
        if (!completed.rowCount) throw new Error('Idempotency ownership was lost');
        if (!res.destroyed) originalJson(body);
      } catch (err) {
        logger.error('[Idempotency] Could not persist the operation result', err);
        if (!res.destroyed && !res.headersSent) {
          res.status(503);
          originalJson({
            success: false,
            code: 'IDEMPOTENCY_RESULT_UNCONFIRMED',
            message: 'تعذر تأكيد نتيجة العملية. لا تكررها بمفتاح جديد؛ راجع نتيجتها أولاً',
          });
        }
      }
    })();
    return res;
  };
  next();
};
