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

    // إزالة وسوم السكربتات المباشرة والأطر والوسوم المضمنة الخطيرة
    clean = clean.replace(/<\s*script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\s*\/\s*script\s*>/gi, '');
    clean = clean.replace(
      /<\s*(iframe|object|embed|style|link|base|applet)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\s*\/\s*\1\s*>/gi,
      '',
    );
    clean = clean.replace(/<\s*(iframe|object|embed|style|link|base|applet)\b[^>]*\/?>/gi, '');
    clean = clean.replace(/javascript\s*:/gi, '');
    clean = clean.replace(/vbscript\s*:/gi, '');
    clean = clean.replace(/data\s*:\s*text\/html/gi, '');
    // إزالة كافة معالجات الأحداث (on* event handlers مثل onload, onerror, onclick, onfocus...)
    clean = clean.replace(/\bon[a-z]{3,20}\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

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
      const sanitizedQuery = sanitizeValue(req.query);
      Object.defineProperty(req, 'query', {
        value: sanitizedQuery,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    if (req.params && typeof req.params === 'object') {
      const sanitizedParams = sanitizeValue(req.params);
      Object.defineProperty(req, 'params', {
        value: sanitizedParams,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

export default sanitizeInput;
