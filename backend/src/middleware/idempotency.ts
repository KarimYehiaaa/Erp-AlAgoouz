/**
 * middleware/idempotency.ts — حماية تكرار العمليات المالية والحرجة
 * ═════════════════════════════════════════════════════════════
 * يتحقق من وجود رأس Idempotency-Key أو X-Idempotency-Key لمنع تكرار
 * العمليات المالية (مثل إنشاء الفواتير أو تسديد الدفعات) في حال انقطاع الاتصال
 * أو إعادة إرسال الطلب من العميل.
 */
import type { Request, Response, NextFunction } from 'express';

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  createdAt: number;
}

// تخزين المفاتيح في الذاكرة (TTL: 24 ساعة)
const idempotencyStore = new Map<string, CachedResponse | 'PROCESSING'>();
const TTL_MS = 24 * 60 * 60 * 1000;

// تنظيف دوري كل ساعة
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of idempotencyStore.entries()) {
      if (value !== 'PROCESSING' && now - value.createdAt > TTL_MS) {
        idempotencyStore.delete(key);
      }
    }
  },
  60 * 60 * 1000,
).unref?.();

/**
 * Middleware لتطبيق مبدأ Idempotency
 */
export const requireIdempotency = (req: Request, res: Response, next: NextFunction): void => {
  // تطبيق فقط على طلبات التعديل والإنشاء
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as
    string | undefined;

  if (!idempotencyKey) {
    return next();
  }

  const cached = idempotencyStore.get(idempotencyKey);

  if (cached === 'PROCESSING') {
    res.status(409).json({
      success: false,
      message: 'الطلب قيد المعالجة حالياً. يرجى الانتظار.',
      code: 'REQUEST_IN_PROGRESS',
    });
    return;
  }

  if (cached) {
    // إعادة الرد المحفوظ مسبقاً
    res.status(cached.statusCode).json({
      ...cached.body,
      _idempotentReplay: true,
    });
    return;
  }

  // تسجيل المفتاح كقيد المعالجة
  idempotencyStore.set(idempotencyKey, 'PROCESSING');

  // اعتراض الرد لحفظه
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode < 500) {
      idempotencyStore.set(idempotencyKey, {
        statusCode: res.statusCode,
        headers: {},
        body,
        createdAt: Date.now(),
      });
    } else {
      // في حال خطأ الخادم، نحذف المفتاح للسماح بالمحاولة مجدداً
      idempotencyStore.delete(idempotencyKey);
    }
    return originalJson(body);
  };

  next();
};
