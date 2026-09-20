/**
 * desktop-pos/src/services/sessionService.ts
 * خدمة إدارة وتأمين الجلسات الموحدة (Unified Secure Session Service)
 * تعزل تماماً مكان التخزين الفعلي عن باقي طبقات التطبيق
 * في Electron: تعتمد على safeStorage (تشفير على مستوى نظام التشغيل)
 * في الذاكرة الحية (In-Memory): تحتفظ بالتوكنات بدون كتابة JWT مكشوفة على القرص
 * تطهّر وتمنع أي استخدام لـ localStorage لحفظ أو استرجاع التوكنات الحساسة
 */

import type { PosSessionData } from '../types/electron';

class SessionService {
  private currentAccessToken: string | null = null;
  private currentRefreshToken: string | null = null;
  private currentUser: any = null;
  private currentTerminal: any = null;
  private initializing = false;

  constructor() {}

  /**
   * تطهير أي توكن نصي قديم متبقٍ في localStorage لمنع أي تسريب أمني
   */
  public cleanseLegacyTokens(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('pos_token');
        localStorage.removeItem('pos_refresh_token');
      } catch {
        // تجاهل بيئات الاختبار غير المجهزة
      }
    }
  }

  /**
   * هل الجلسة قيد التهيئة الأولية عند إقلاع التطبيق؟
   */
  public isSessionInitializing(): boolean {
    return this.initializing;
  }

  public setSessionInitializing(val: boolean): void {
    this.initializing = val;
  }

  /**
   * الحصول على توكن الوصول الفعال من الذاكرة الحية
   */
  public getAccessToken(): string | null {
    return this.currentAccessToken;
  }

  /**
   * الحصول على توكن التحديث الفعال
   */
  public getRefreshToken(): string | null {
    return this.currentRefreshToken;
  }

  /**
   * بيانات المستخدم الحالي
   */
  public getUser(): any {
    return this.currentUser;
  }

  /**
   * بيانات نقطة البيع / الكاشير
   */
  public getTerminal(): any {
    return this.currentTerminal;
  }

  /**
   * التحقق مما إذا كانت هناك جلسة نشطة
   */
  public async hasSession(): Promise<boolean> {
    if (this.currentAccessToken && this.currentUser) {
      return true;
    }
    if (typeof window !== 'undefined' && window.electronAPI?.hasSecureSession) {
      return await window.electronAPI.hasSecureSession();
    }
    return false;
  }

  /**
   * حفظ الجلسة بأمان في الذاكرة الحية وفي Electron safeStorage
   */
  public async saveSession(data: PosSessionData): Promise<boolean> {
    this.currentAccessToken = data.token;
    this.currentRefreshToken = data.refreshToken || null;
    this.currentUser = data.user;
    this.currentTerminal = data.terminal || null;

    // تطهير التوكن النصي من localStorage فوراً
    this.cleanseLegacyTokens();

    // حفظ تفضيلات المستخدم غير الحساسة فقط في localStorage
    if (typeof localStorage !== 'undefined' && data.user) {
      try {
        localStorage.setItem('pos_user', JSON.stringify(data.user));
        if (data.terminal) {
          localStorage.setItem('pos_terminal', JSON.stringify(data.terminal));
        }
      } catch {
        // تجاهل
      }
    }

    // الحفظ المشفر عبر safeStorage في بيئة Electron
    if (typeof window !== 'undefined' && window.electronAPI?.saveSecureSession) {
      const res = await window.electronAPI.saveSecureSession({
        token: data.token,
        refreshToken: data.refreshToken,
        user: data.user,
        terminal: data.terminal,
        savedAt: data.savedAt || new Date().toISOString(),
      });
      return !!res && res.success;
    }

    return true;
  }

  /**
   * تحديث التوكنات فقط (مثلما يحدث بعد عملية refresh ناجحة)
   */
  public async updateTokens(accessToken: string, refreshToken?: string): Promise<boolean> {
    this.currentAccessToken = accessToken;
    if (refreshToken !== undefined) {
      this.currentRefreshToken = refreshToken;
    }
    this.cleanseLegacyTokens();

    if (typeof window !== 'undefined' && window.electronAPI?.saveSecureSession && this.currentUser) {
      const res = await window.electronAPI.saveSecureSession({
        token: accessToken,
        refreshToken: this.currentRefreshToken || undefined,
        user: this.currentUser,
        terminal: this.currentTerminal,
        savedAt: new Date().toISOString(),
      });
      return !!res && res.success;
    }

    return true;
  }

  /**
   * تحميل الجلسة من التخزين المشفر واستعادتها في الذاكرة الحية
   */
  public async loadSession(): Promise<PosSessionData | null> {
    // 1. محاولة القراءة من مخزن Electron safeStorage المشفر
    if (typeof window !== 'undefined' && window.electronAPI?.loadSecureSession) {
      try {
        const secureData = await window.electronAPI.loadSecureSession();
        if (secureData && secureData.token) {
          this.currentAccessToken = secureData.token;
          this.currentRefreshToken = secureData.refreshToken || null;
          this.currentUser = secureData.user;
          this.currentTerminal = secureData.terminal || null;
          this.cleanseLegacyTokens();
          return secureData;
        }
      } catch (err) {
        console.warn('[SessionService] Error loading secure session from Electron:', err);
      }
    }

    // 2. إذا كانت هناك جلسة بالذاكرة الحية
    if (this.currentAccessToken && this.currentUser) {
      return {
        token: this.currentAccessToken,
        refreshToken: this.currentRefreshToken || undefined,
        user: this.currentUser,
        terminal: this.currentTerminal,
      };
    }

    // 3. الترحيل التلقائي لتوكن قديم من localStorage إن وُجد
    if (typeof localStorage !== 'undefined') {
      try {
        const legacyToken = localStorage.getItem('pos_token');
        const legacyUserRaw = localStorage.getItem('pos_user');
        const legacyTerminalRaw = localStorage.getItem('pos_terminal');

        if (legacyToken) {
          const legacyUser = legacyUserRaw ? JSON.parse(legacyUserRaw) : null;
          const legacyTerminal = legacyTerminalRaw ? JSON.parse(legacyTerminalRaw) : null;

          this.currentAccessToken = legacyToken;
          this.currentUser = legacyUser;
          this.currentTerminal = legacyTerminal;

          // إذا كان safeStorage متاحاً في Electron، قم بحفظه مشفراً فوراً
          if (typeof window !== 'undefined' && window.electronAPI?.saveSecureSession && legacyUser) {
            await window.electronAPI.saveSecureSession({
              token: legacyToken,
              user: legacyUser,
              terminal: legacyTerminal,
              savedAt: new Date().toISOString(),
            });
          }

          // تطهير التوكن النصي غير المشفر من localStorage فوراً
          this.cleanseLegacyTokens();

          return {
            token: legacyToken,
            user: legacyUser,
            terminal: legacyTerminal,
          };
        }
      } catch {
        // تجاهل
      }
    }

    // Any legacy token without a valid user payload is discarded explicitly.
    this.cleanseLegacyTokens();
    return null;
  }

  /**
   * استعادة الجلسة عند إقلاع التطبيق (Startup Restoration)
   */
  public async restoreSession(): Promise<PosSessionData | null> {
    this.initializing = true;
    try {
      const session = await this.loadSession();
      return session;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * مسح الجلسة وتطهير كافة البيانات الحساسة كلياً
   */
  public async clearSession(): Promise<boolean> {
    this.currentAccessToken = null;
    this.currentRefreshToken = null;
    this.currentUser = null;
    this.currentTerminal = null;

    this.cleanseLegacyTokens();

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('pos_user');
        localStorage.removeItem('pos_terminal');
      } catch {}
    }

    if (typeof window !== 'undefined' && window.electronAPI) {
      if (window.electronAPI.clearSecureSession) {
        await window.electronAPI.clearSecureSession();
      }
      if (window.electronAPI.setAuthToken) {
        await window.electronAPI.setAuthToken(null);
      }
    }

    return true;
  }
}

export const sessionService = new SessionService();
export { SessionService };
