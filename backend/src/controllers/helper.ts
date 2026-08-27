/**
 * استجابة نجاح موحدة.
 * @param {import('express').Response} res كائن الاستجابة
 * @param {unknown} data بيانات الاستجابة
 * @param {string} [message] رسالة اختيارية
 * @param {unknown} [meta] بيانات إضافية اختيارية
 * @returns {void}
 */
export const ok = (
  res: import('express').Response,
  data: unknown,
  message?: string,
  meta?: unknown,
) => res.json({ success: true, data, message, meta });

/**
 * يلفّ معالجاً غير متزامن ويحوّل أي خطأ إلى next() — يلغي حاجة try/catch اليدوية.
 * @param {Function} fn المعالج غير المتزامن
 * @returns {import('express').RequestHandler}
 */
export const wrap =
  (fn: (...args: any[]) => unknown): import('express').RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
