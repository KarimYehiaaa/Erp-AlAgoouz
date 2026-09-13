import type { Request, Response, NextFunction } from 'express';

/**
 * تنظيف النصوص والمدخلات لحماية النظام من ثغرات XSS وحقن الأحرف الضارة.
 */
function sanitizeValue(value: any, isPasswordField = false): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // إزالة Null Bytes المهددة للأمان
    let clean = value.replace(/\0/g, '');

    // لا نقوم بالتلاعب بحقول كلمات المرور والتوكنات عدا الـ null bytes
    if (isPasswordField) {
      return clean;
    }

    // إزالة وسوم السكربتات المباشرة والأحداث الخبيثة
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/javascript\s*:/gi, '');
    clean = clean.replace(/onload\s*=/gi, '');
    clean = clean.replace(/onerror\s*=/gi, '');

    return clean.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, isPasswordField));
  }

  if (typeof value === 'object' && value.constructor === Object) {
    const sanitizedObj: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      const isSensitiveKey = /password|token|secret|pin/i.test(key);
      sanitizedObj[key] = sanitizeValue(value[key], isSensitiveKey);
    }
    return sanitizedObj;
  }

  return value;
}

/**
 * Middleware مركزي لتنظيف مدخلات الطلب قبل وصولها للـ Controllers
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeValue(req.params);
    }
    next();
  } catch (err) {
    next(err);
  }
};

export default sanitizeInput;
