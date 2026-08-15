import { randomUUID } from 'crypto';

/**
 * Middleware: Request ID
 * ─────────────────────────────────────────────────────────────
 * يُضيف معرّفاً فريداً لكل طلب HTTP لتسهيل تتبع الأخطاء في الـ Logs
 *
 * الاستخدام: يتوفر عبر req.requestId في جميع controllers/services
 * يُضاف تلقائياً لرأس الاستجابة: X-Request-ID
 */
export const requestId = (req, res, next) => {
  // استخدام X-Request-ID المرسل من العميل إن وُجد، وإلا إنشاء UUID جديد
  const id = req.headers['x-request-id'] || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};

export default requestId;
