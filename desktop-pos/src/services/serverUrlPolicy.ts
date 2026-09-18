/**
 * services/serverUrlPolicy.ts — سياسة وقواعد عناوين الخادم المركزي
 * مفصول تماماً عن Axios و Config لتفادي أي Circular Dependency
 */

export const SAFE_LOCAL_URL = 'http://localhost:3000/api/v1';
export const DEFAULT_SERVER_URL = SAFE_LOCAL_URL;

export function getRawEnvUrl(): string | undefined {
  try {
    return (import.meta as any).env?.VITE_API_URL;
  } catch {
    return undefined;
  }
}

export function validateServerUrl(
  url: string,
  forceProduction?: boolean
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
  const isProduction = forceProduction !== undefined ? forceProduction : ((import.meta as any).env?.PROD ?? false);

  if (isProduction && parsed.protocol === 'http:' && !isLocal) {
    return {
      valid: false,
      error: 'في بيئة الإنتاج، يجب استخدام بروتوكول مشفر وآمن (HTTPS) للاتصال بالخادم المركزي لحماية البيانات',
    };
  }

  const cleanUrl = url.trim().replace(/\/+$/, '');
  return { valid: true, normalizedUrl: cleanUrl };
}

export function getServerUrl(forceProduction?: boolean, customEnvUrl?: string): string {
  const isProd = forceProduction !== undefined ? forceProduction : ((import.meta as any).env?.PROD ?? false);

  // 1. Check localStorage if available
  if (typeof localStorage !== 'undefined') {
    const rawLocal = localStorage.getItem('pos_server_url');
    if (rawLocal) {
      const localVal = validateServerUrl(rawLocal, isProd);
      if (localVal.valid && localVal.normalizedUrl) {
        return localVal.normalizedUrl;
      }
      // Purge invalid or insecure URL from localStorage
      localStorage.removeItem('pos_server_url');
    }
  }

  // 2. Check VITE_API_URL / environment fallback
  const envUrl = customEnvUrl !== undefined ? customEnvUrl : getRawEnvUrl();
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const envVal = validateServerUrl(envUrl, isProd);
    if (envVal.valid && envVal.normalizedUrl) {
      return envVal.normalizedUrl;
    }
  }

  // 3. Fallback to guaranteed safe local URL
  return SAFE_LOCAL_URL;
}
