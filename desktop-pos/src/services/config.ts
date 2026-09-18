/**
 * services/config.ts — مصدر الإعدادات المركزي الموحد لنقاط البيع المكتبية
 * يضمن تزامن عنوان الخادم المركزي (Server URL) بين واجهة المستخدم وعامل المزامنة والـ API
 * ويفرض بروتوكول HTTPS في بيئات الإنتاج لمنع تسريب البيانات
 */
import { api } from './api';

export const SAFE_LOCAL_URL = 'http://localhost:3000/api/v1';

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

export const DEFAULT_SERVER_URL = SAFE_LOCAL_URL;

export async function setServerUrl(url: string): Promise<{ success: boolean; error?: string }> {
  const validation = validateServerUrl(url);
  if (!validation.valid || !validation.normalizedUrl) {
    return { success: false, error: validation.error };
  }

  const cleanUrl = validation.normalizedUrl;

  if (typeof window !== 'undefined' && window.electronAPI?.setServerUrl) {
    try {
      const ipcRes = await window.electronAPI.setServerUrl(cleanUrl);
      if (!ipcRes || !ipcRes.success) {
        return {
          success: false,
          error: ipcRes?.error || 'رفض النظام عنوان الخادم لأسباب أمنية',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'فشل الاتصال ببيئة سطح المكتب لتحديث عنوان الخادم',
      };
    }
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pos_server_url', cleanUrl);
  }
  api.defaults.baseURL = cleanUrl;

  return { success: true };
}

export async function initServerConfig(): Promise<string> {
  // If Electron has an environment or main-process URL, reconcile it
  if (typeof window !== 'undefined' && window.electronAPI?.getServerUrl) {
    try {
      const electronUrl = await window.electronAPI.getServerUrl();
      const localUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('pos_server_url') : null;
      if (localUrl) {
        const val = validateServerUrl(localUrl);
        if (val.valid && val.normalizedUrl) {
          const ipcRes = await window.electronAPI.setServerUrl(val.normalizedUrl);
          if (ipcRes?.success) {
            api.defaults.baseURL = val.normalizedUrl;
            return val.normalizedUrl;
          }
        }
      } else if (electronUrl) {
        const val = validateServerUrl(electronUrl);
        if (val.valid && val.normalizedUrl) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('pos_server_url', val.normalizedUrl);
          }
          api.defaults.baseURL = val.normalizedUrl;
          return val.normalizedUrl;
        }
      }
    } catch {
      // Browser fallback
    }
  }

  const current = getServerUrl();
  api.defaults.baseURL = current;
  return current;
}
