/**
 * services/config.ts — مصدر الإعدادات المركزي الموحد لنقاط البيع المكتبية
 * يضمن تزامن عنوان الخادم المركزي (Server URL) بين واجهة المستخدم وعامل المزامنة والـ API
 */
import { api } from './api';

export const DEFAULT_SERVER_URL =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';

export function getServerUrl(): string {
  return localStorage.getItem('pos_server_url') || DEFAULT_SERVER_URL;
}

export async function setServerUrl(url: string): Promise<void> {
  const cleanUrl = (url || '').trim().replace(/\/+$/, '');
  if (!cleanUrl) return;

  localStorage.setItem('pos_server_url', cleanUrl);
  api.defaults.baseURL = cleanUrl;

  if (window.electronAPI?.setServerUrl) {
    try {
      await window.electronAPI.setServerUrl(cleanUrl);
    } catch (err) {
      console.warn('[Config] Failed to push server URL to Electron main process:', err);
    }
  }
}

export async function initServerConfig(): Promise<string> {
  // If Electron has an environment or main-process URL, reconcile it
  if (window.electronAPI?.getServerUrl) {
    try {
      const electronUrl = await window.electronAPI.getServerUrl();
      const localUrl = localStorage.getItem('pos_server_url');
      if (localUrl) {
        await window.electronAPI.setServerUrl(localUrl);
        return localUrl;
      } else if (electronUrl) {
        localStorage.setItem('pos_server_url', electronUrl);
        api.defaults.baseURL = electronUrl;
        return electronUrl;
      }
    } catch {
      // Browser fallback
    }
  }

  const current = getServerUrl();
  api.defaults.baseURL = current;
  return current;
}
