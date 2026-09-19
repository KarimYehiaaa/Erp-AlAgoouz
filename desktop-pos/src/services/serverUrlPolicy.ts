/**
 * services/serverUrlPolicy.ts — سياسة وقواعد عناوين الخادم المركزي الموثوقة
 * مفصول تماماً عن Axios و Config لتفادي أي Circular Dependency
 * ومتاح للاستخدام المتطابق بين Renderer و Main Process و Sync Worker
 */

export const SAFE_LOCAL_URL = 'http://localhost:3000/api/v1';
export const DEFAULT_SERVER_URL = SAFE_LOCAL_URL;

/**
 * دالة مساعدة لقراءة متغيرات البيئة بمرونة عبر Node و Vite
 */
export function getEnvVar(key: string): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}

  try {
    const meta = (import.meta as any);
    if (meta && meta.env && meta.env[key]) {
      return meta.env[key];
    }
  } catch {}

  return undefined;
}

export function getRawEnvUrl(): string | undefined {
  return getEnvVar('VITE_API_URL') || getEnvVar('POS_SERVER_URL');
}

/**
 * استخراج قائمة عناوين الخوادم الموثوقة من إعدادات البيئة
 */
export function getTrustedServerList(
  customTrustedConfig?: string[] | string,
  envAnchorOverride?: string
): string[] {
  const result: string[] = [];

  // 1. القائمة المخصصة إن وجدت
  if (customTrustedConfig) {
    if (Array.isArray(customTrustedConfig)) {
      result.push(...customTrustedConfig);
    } else if (typeof customTrustedConfig === 'string') {
      result.push(...customTrustedConfig.split(','));
    }
  }

  // 2. فحص متغيرات البيئة VITE_TRUSTED_SERVER_URLS أو POS_TRUSTED_SERVER_URLS
  const envTrusted = getEnvVar('VITE_TRUSTED_SERVER_URLS') || getEnvVar('POS_TRUSTED_SERVER_URLS');
  if (envTrusted && typeof envTrusted === 'string') {
    result.push(...envTrusted.split(','));
  }

  // 3. إضافة المرساة الموثوقة (VITE_API_URL أو POS_SERVER_URL أو ما يمرره البناء)
  const anchor = envAnchorOverride !== undefined ? envAnchorOverride : getRawEnvUrl();
  if (anchor && typeof anchor === 'string' && anchor.trim()) {
    result.push(anchor.trim());
  }

  // تنظيف وتوحيد العناوين
  const cleaned: string[] = [];
  for (const raw of result) {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (trimmed && !cleaned.includes(trimmed)) {
      cleaned.push(trimmed);
    }
  }

  return cleaned;
}

/**
 * التحقق مما إذا كان عنوان الخادم ينتمي لنطاق رسمي موثوق للمؤسسة
 */
function isOfficialOrganizationDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'alagoouz.com' ||
    host.endsWith('.alagoouz.com') ||
    host === 'binalagoouz.com' ||
    host.endsWith('.binalagoouz.com')
  );
}

/**
 * التحقق مما إذا كان عنوان الخادم ينتمي لقائمة السيرفرات الموثوقة
 */
export function isTrustedServerUrl(
  url: string,
  forceProduction?: boolean,
  customTrustedConfig?: string[] | string,
  envAnchorOverride?: string
): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  // 1. عناوين التطوير المحلية دائماً موثوقة
  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '0.0.0.0';

  if (isLocal) {
    return true;
  }

  const isProduction =
    forceProduction !== undefined
      ? forceProduction
      : (getEnvVar('PROD') === 'true' ||
         getEnvVar('NODE_ENV') === 'production' ||
         ((import.meta as any).env?.PROD ?? false));

  // في غير بيئة الإنتاج، يُسمح بالاتصال الخارجي للتجارب إن كان بروتوكولاً صالحاً
  if (!isProduction) {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }

  // 2. فحص النطاقات الرسمية للنظام (Bin Al-Agoouz Official Production Domains)
  if (isOfficialOrganizationDomain(parsed.hostname)) {
    return true;
  }

  // 3. فحص القائمة الموثوقة المعلنة وقت البناء أو متغيرات البيئة
  const trustedList = getTrustedServerList(customTrustedConfig, envAnchorOverride);
  if (trustedList.length > 0) {
    const cleanTargetOrigin = parsed.origin.toLowerCase();
    const cleanTargetUrl = url.trim().replace(/\/+$/, '').toLowerCase();

    for (const trusted of trustedList) {
      try {
        const trustedParsed = new URL(trusted);
        const trustedOrigin = trustedParsed.origin.toLowerCase();
        const trustedClean = trusted.toLowerCase();

        // تطابق الـ Origin بالكامل أو البداية بالمسار المعتمد
        if (cleanTargetOrigin === trustedOrigin) {
          if (trustedParsed.pathname && trustedParsed.pathname !== '/') {
            const trustedPath = trustedParsed.pathname.replace(/\/+$/, '');
            if (parsed.pathname.toLowerCase().startsWith(trustedPath)) {
              return true;
            }
          } else {
            return true;
          }
        }

        if (cleanTargetUrl.startsWith(trustedClean)) {
          return true;
        }
      } catch {}
    }
  }

  // إذا لم يكن محلياً ولا نطاقاً رسمياً ولا من القائمة الموثوقة: Fail closed
  return false;
}

/**
 * فحص كامل لعنوان الخادم من حيث الصياغة، والبروتوكول، وسياسة الثقة
 */
export function validateServerUrl(
  url: string,
  forceProduction?: boolean,
  customTrustedConfig?: string[] | string,
  envAnchorOverride?: string
): { valid: boolean; normalizedUrl?: string; error?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'عنوان الخادم مطلوب ولا يمكن أن يكون فارغاً' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: 'صيغة عنوان الخادم غير صالحة (مثال صحيح: https://api.alagoouz.com/api/v1)' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'يجب أن يبدأ عنوان الخادم ببروتوكول http:// أو https://' };
  }

  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '0.0.0.0';

  const isProduction =
    forceProduction !== undefined
      ? forceProduction
      : (getEnvVar('PROD') === 'true' ||
         getEnvVar('NODE_ENV') === 'production' ||
         ((import.meta as any).env?.PROD ?? false));

  // في بيئة الإنتاج: منع الاتصال الخارجي غير المشفر (HTTP)
  if (isProduction && parsed.protocol === 'http:' && !isLocal) {
    return {
      valid: false,
      error: 'في بيئة الإنتاج، يجب استخدام بروتوكول مشفر وآمن (HTTPS) للاتصال بالخادم المركزي لحماية البيانات',
    };
  }

  const cleanUrl = url.trim().replace(/\/+$/, '');

  // في بيئة الإنتاج: فحص الثقة (Trusted Server Policy)
  if (isProduction && !isTrustedServerUrl(cleanUrl, true, customTrustedConfig, envAnchorOverride)) {
    return {
      valid: false,
      error: 'عنوان الخادم غير موثوق به لهذا الجهاز',
    };
  }

  return { valid: true, normalizedUrl: cleanUrl };
}

/**
 * الحصول على عنوان الخادم الفعّال والآمن
 */
export function getServerUrl(
  forceProduction?: boolean,
  customEnvUrl?: string,
  customTrustedConfig?: string[] | string
): string {
  const isProd =
    forceProduction !== undefined
      ? forceProduction
      : (getEnvVar('PROD') === 'true' ||
         getEnvVar('NODE_ENV') === 'production' ||
         ((import.meta as any).env?.PROD ?? false));

  // 1. فحص التخزين المحلي إن وُجد
  if (typeof localStorage !== 'undefined') {
    const rawLocal = localStorage.getItem('pos_server_url');
    if (rawLocal) {
      const localVal = validateServerUrl(rawLocal, isProd, customTrustedConfig, customEnvUrl);
      if (localVal.valid && localVal.normalizedUrl) {
        return localVal.normalizedUrl;
      }
      // إزالة العنوان غير الموثوق أو غير الآمن من التخزين المحلي
      localStorage.removeItem('pos_server_url');
    }
  }

  // 2. فحص متغيرات البيئة أو السيرفر الافتراضي المعتمد
  const envUrl = customEnvUrl !== undefined ? customEnvUrl : getRawEnvUrl();
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const envVal = validateServerUrl(envUrl, isProd, customTrustedConfig, envUrl);
    if (envVal.valid && envVal.normalizedUrl) {
      return envVal.normalizedUrl;
    }
  }

  // 3. التراجع الآمن للخادم المحلي الافتراضي
  return SAFE_LOCAL_URL;
}
