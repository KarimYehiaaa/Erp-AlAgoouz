/**
 * desktop-pos/electron/security/ipcSecurity.ts
 * طبقة تأمين قنوات الاتصال بين العمليات (IPC Security & Origin Validation Layer)
 * تضمن:
 * 1. حصر تنفيذ الـ IPC على الإطار الرئيسي لنافذة التطبيق المعتمدة (Main Frame Only).
 * 2. التحقق الصارم من الأصل (Origin / URL) سواء في بيئة التطوير أو الإنتاج.
 * 3. حظر أي استدعاءات من iframes أو صفحات خارجية أو نوافذ غير مصرح بها.
 * 4. فحص وتطهير الحمولات (Payload Validation) لمنع ثغرات Prototype Pollution وحقن البيانات.
 * 5. تطهير رسائل الأخطاء لإخفاء مسارات النظام والـ Stack Traces.
 */

import type { IpcMainInvokeEvent } from 'electron';

export interface IpcValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * فحص هوية وأصل مرسل الـ IPC
 */
export function validateIpcSender(
  event: IpcMainInvokeEvent,
  isPackaged: boolean,
  devServerUrl?: string
): boolean {
  if (!event || !event.senderFrame) {
    console.warn('[IPC Security] Rejected: Missing senderFrame');
    return false;
  }

  // 1. منع أي استدعاءات من iframes فرعية (يجب أن يكون الإطار الرئيسي فقط)
  if (event.senderFrame.parent !== null) {
    console.warn('[IPC Security] Blocked privileged IPC from sub-frame');
    return false;
  }

  const senderUrl = event.senderFrame.url || '';

  // 2. فحص بيئة التطوير
  if (!isPackaged) {
    const allowedDevUrls = [
      devServerUrl,
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ].filter(Boolean) as string[];

    const matchesDev = allowedDevUrls.some((allowed) => {
      try {
        const allowedOrigin = new URL(allowed).origin;
        const senderOrigin = new URL(senderUrl).origin;
        return senderOrigin === allowedOrigin;
      } catch {
        return false;
      }
    });

    if (matchesDev) {
      return true;
    }

    // السماح أيضاً بملف dist/index.html في التطوير إذا تم تشغيله محلياً
    if (senderUrl.startsWith('file://') && (senderUrl.includes('dist/index.html') || senderUrl.includes('dist\\index.html'))) {
      return true;
    }

    console.warn(`[IPC Security] Blocked IPC from unapproved dev origin: ${senderUrl}`);
    return false;
  }

  // 3. فحص بيئة الإنتاج المجمعة (Packaged Application)
  // يجب أن يكون البروتوكول file:// ويستهدف حزمة التطبيق المجمعة حصراً
  if (senderUrl.startsWith('file://')) {
    const normalized = senderUrl.replace(/\\/g, '/');
    if (normalized.endsWith('/dist/index.html') || normalized.includes('/dist/index.html#')) {
      return true;
    }
  }

  console.warn(`[IPC Security] Blocked IPC from unauthorized packaged URL: ${senderUrl}`);
  return false;
}

/**
 * حماية من ثغرات Prototype Pollution بفحص المفاتيح المحظورة
 */
export function containsDangerousKeys(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;

  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    if (typeof obj[key] === 'object' && containsDangerousKeys(obj[key])) {
      return true;
    }
  }
  return false;
}

/**
 * فحص حمولة الجلسة المشفرة (Session Payload Validation)
 */
export function validateSessionPayload(data: any): IpcValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'بيانات الجلسة غير صالحة' };
  }

  if (containsDangerousKeys(data)) {
    return { valid: false, error: 'حمولة غير آمنة (تم رفض مفاتيح مشبوهة)' };
  }

  if (typeof data.token !== 'string' || data.token.trim().length === 0) {
    return { valid: false, error: 'رمز الجلسة (token) مطلوب ويجب أن يكون نصاً صالحاً' };
  }

  if (data.token.length > 8192) {
    return { valid: false, error: 'رمز الجلسة يتجاوز الحد الأقصى المسموح به' };
  }

  if (data.refreshToken && (typeof data.refreshToken !== 'string' || data.refreshToken.length > 8192)) {
    return { valid: false, error: 'رمز التحديث (refreshToken) غير صالح' };
  }

  if (!data.user || typeof data.user !== 'object') {
    return { valid: false, error: 'بيانات المستخدم مطلوبة في الجلسة' };
  }

  return { valid: true };
}

/**
 * فحص حمولة العمليات غير المتصلة (Offline Transaction Payload Validation)
 */
export function validateTransactionPayload(data: any): IpcValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'بيانات العملية غير صالحة' };
  }

  if (containsDangerousKeys(data)) {
    return { valid: false, error: 'حمولة غير آمنة (تم رفض مفاتيح مشبوهة)' };
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    return { valid: false, error: 'قائمة الأصناف مطلوبة ولا يمكن أن تكون فارغة' };
  }

  if (typeof data.total_amount !== 'number' || isNaN(data.total_amount) || data.total_amount < 0) {
    return { valid: false, error: 'إجمالي الفاتورة يجب أن يكون رقماً موجباً' };
  }

  if (data.sync_id && (typeof data.sync_id !== 'string' || data.sync_id.length > 128)) {
    return { valid: false, error: 'معرف المزامنة (sync_id) غير صالح' };
  }

  return { valid: true };
}

/**
 * تطهير رسائل الأخطاء لإخفاء مسارات القرص الصلب والـ Stack Traces
 */
export function sanitizeIpcError(err: any): string {
  if (!err) return 'حدث خطأ غير متوقع';
  const msg = typeof err === 'string' ? err : err.message || 'حدث خطأ أثناء معالجة الطلب';

  // إزالة مسارات الملفات من الرسالة لحماية الخصوصية والأمان
  const cleaned = msg
    .replace(/[A-Za-z]:\\[^:\n\r]+/g, '[file_path]')
    .replace(/\/[^:\n\r\s]+/g, '[file_path]')
    .replace(/\bat\b.+/gs, '')
    .trim();

  return cleaned || 'حدث خطأ أثناء معالجة الطلب';
}
