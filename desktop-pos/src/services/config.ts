/**
 * services/config.ts — مصدر الإعدادات المركزي الموحد لنقاط البيع المكتبية
 * يضمن تزامن عنوان الخادم المركزي (Server URL) بين واجهة المستخدم وعامل المزامنة والـ API
 * ويفرض بروتوكول HTTPS في بيئات الإنتاج لمنع تسريب البيانات
 */
import { api } from './api';

export const DEFAULT_SERVER_URL =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';

export function validateServerUrl(url: string): { valid: boolean; normalizedUrl?: string; error?: string } {
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

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0';
  const isProduction = (import.meta as any).env?.PROD;

  if (isProduction && parsed.protocol === 'http:' && !isLocal) {
    return {
      valid: false,
      error: 'في بيئة الإنتاج، يجب استخدام بروتوكول مشفر وآمن (HTTPS) للاتصال بالخادم المركزي لحماية البيانات',
    };
  }

  const cleanUrl = url.trim().replace(/\/+$/, '');
  return { valid: true, normalizedUrl: cleanUrl };
}

export function getServerUrl(): string {
  return localStorage.getItem('pos_server_url') || DEFAULT_SERVER_URL;
}

export async function setServerUrl(url: string): Promise<{ success: boolean; error?: string }> {
  const validation = validateServerUrl(url);
  if (!validation.valid || !validation.normalizedUrl) {
    return { success: false, error: validation.error };
  }

  const cleanUrl = validation.normalizedUrl;
  localStorage.setItem('pos_server_url', cleanUrl);
  api.defaults.baseURL = cleanUrl;

  if (window.electronAPI?.setServerUrl) {
    try {
      await window.electronAPI.setServerUrl(cleanUrl);
    } catch (err) {
      console.warn('[Config] Failed to push server URL to Electron main process:', err);
    }
  }

  return { success: true };
}

export async function initServerConfig(): Promise<string> {
  // If Electron has an environment or main-process URL, reconcile it
  if (window.electronAPI?.getServerUrl) {
    try {
      const electronUrl = await window.electronAPI.getServerUrl();
      const localUrl = localStorage.getItem('pos_server_url');
      if (localUrl) {
        const val = validateServerUrl(localUrl);
        if (val.valid && val.normalizedUrl) {
          await window.electronAPI.setServerUrl(val.normalizedUrl);
          api.defaults.baseURL = val.normalizedUrl;
          return val.normalizedUrl;
        }
      } else if (electronUrl) {
        const val = validateServerUrl(electronUrl);
        if (val.valid && val.normalizedUrl) {
          localStorage.setItem('pos_server_url', val.normalizedUrl);
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
