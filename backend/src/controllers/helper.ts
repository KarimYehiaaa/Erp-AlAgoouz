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
