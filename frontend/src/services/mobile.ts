/**
 * mobile.ts — طبقة دعم تشغيل الواجهة داخل تطبيق الموبايل (Capacitor/Android)
 *
 * عند تغليف الواجهة بنفسها في WebView عبر Capacitor يعمل التطبيق من الأصل
 * المحلي https://localhost — لذلك يجب توجيه كل الطلبات إلى خادم الـ API
 * المُستضاف بدل "نفس الأصل" كما في المتصفح.
 *
 * يُضبط عنوان الخادم عبر:
 *  1. متغير البناء VITE_API_URL (يُدمج في الحزمة عند `npm run build`)
 *  2. القيمة المحفوظة في localStorage (مفتاح MOBILE_API_URL) — تُدخل من شاشة الإعدادات
 *     داخل التطبيق ويمكن تغييرها دون إعادة بناء الحزمة.
 */

/** مفتاح التخزين المحلي لعنوان الخادم داخل التطبيق. */
export const MOBILE_API_URL_KEY = 'MOBILE_API_URL';

/** هل تعمل الواجهة حاليًا داخل WebView أصلي (Capacitor) وليس متصفحًا عاديًا؟ */
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.();
};

/** قراءة عنوان الخادم المحفوظ من إعدادات التطبيق (إن وُجد). */
export const getStoredServerUrl = (): string | null => {
  try {
    return localStorage.getItem(MOBILE_API_URL_KEY) || null;
  } catch {
    return null;
  }
};

/** حفظ عنوان الخادم في إعدادات التطبيق. */
export const setStoredServerUrl = (url: string): void => {
  localStorage.setItem(MOBILE_API_URL_KEY, url.trim().replace(/\/+$/, ''));
};

/**
 * العنوان الأساسي للـ API.
 * - داخل التطبيق: عنوان الخادم المحفوظ أو VITE_API_URL (مثال: https://erp.example.com)
 * - في المتصفح: '' (نفس الأصل — عبر بروكسي Vite في التطوير أو الخادم نفسه في الإنتاج)
 */
export const getApiBaseUrl = (): string => {
  if (isNativeApp()) {
    const stored = getStoredServerUrl();
    if (stored) return stored.replace(/\/+$/, '');
    const envUrl = (import.meta.env.VITE_API_URL || '').trim();
    if (envUrl) return envUrl.replace(/\/+$/, '');
    // لا يوجد عنوان مضبوط — يعيد النص الفارغ ويظهر تحذير للمستخدم من شاشة الدخول
    return '';
  }
  return import.meta.env.VITE_API_URL || '';
};

/**
 * عنوان اتصال WebSocket للمزامنة اللحظية.
 * داخل التطبيق يُشتق من عنوان الخادم (http→ws / https→wss).
 */
export const getWsUrl = (): string => {
  if (isNativeApp()) {
    const base = getApiBaseUrl();
    if (!base) return '';
    return `${base.replace(/^http/, 'ws')}/ws`;
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/ws`;
};
