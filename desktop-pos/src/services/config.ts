/**
 * services/config.ts — واجهة إدارة الإعدادات لنقاط البيع المكتبية
 * يستورد من serverUrlPolicy ومن api لتحديث baseURL
 * ولا يستورده api.ts لتفادي أي circular dependency
 */
import { api } from './api';
import {
  SAFE_LOCAL_URL,
  DEFAULT_SERVER_URL,
  getRawEnvUrl,
  validateServerUrl,
  getServerUrl,
} from './serverUrlPolicy';

export {
  SAFE_LOCAL_URL,
  DEFAULT_SERVER_URL,
  getRawEnvUrl,
  validateServerUrl,
  getServerUrl,
};

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
