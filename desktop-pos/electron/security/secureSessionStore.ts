/**
 * electron/security/secureSessionStore.ts
 * مخزن مشفر لجلسات المستخدمين على مستوى نظام التشغيل عبر Electron safeStorage
 * يدعم DPAPI على Windows و Keychain على macOS و Secret Service على Linux
 * مع Fallback آمن (Fail-closed) في الذاكرة الحية عند غياب تشفير النظام
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';

export interface PosSessionData {
  token: string;
  user: any;
  terminal?: any;
  savedAt?: string;
}

export interface EncryptionEngine {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
}

export class SecureSessionStore {
  private sessionFilePath: string;
  private inMemorySession: PosSessionData | null = null;
  private encryptionEngine: EncryptionEngine;

  constructor(
    customStorageDir?: string,
    customEngine?: EncryptionEngine
  ) {
    let baseDir: string;
    if (customStorageDir) {
      baseDir = customStorageDir;
    } else {
      try {
        baseDir = path.join(app.getPath('userData'), 'pos_security');
      } catch {
        baseDir = path.join(process.cwd(), '.pos_security');
      }
    }

    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
      } catch {}
    }

    this.sessionFilePath = path.join(baseDir, 'session.enc');

    this.encryptionEngine = customEngine || {
      isEncryptionAvailable: () => {
        try {
          return safeStorage.isEncryptionAvailable();
        } catch {
          return false;
        }
      },
      encryptString: (plain: string) => safeStorage.encryptString(plain),
      decryptString: (buf: Buffer) => safeStorage.decryptString(buf),
    };
  }

  /**
   * حفظ الجلسة مشفرة على مستوى نظام التشغيل
   */
  public async saveSession(session: PosSessionData): Promise<{ success: boolean; error?: string }> {
    if (!session || !session.token) {
      return { success: false, error: 'بيانات الجلسة أو التوكن غير متوفرة' };
    }

    this.inMemorySession = {
      ...session,
      savedAt: session.savedAt || new Date().toISOString(),
    };

    // فحص توفر التشفير على مستوى نظام التشغيل
    if (!this.encryptionEngine.isEncryptionAvailable()) {
      console.warn(
        '[SecureSessionStore] safeStorage encryption unavailable on host OS. Maintaining in-memory session only (fail-closed persistence).'
      );
      this.safeDeleteSessionFile();
      return { success: true };
    }

    try {
      const payloadString = JSON.stringify(this.inMemorySession);
      const encryptedBuffer = this.encryptionEngine.encryptString(payloadString);

      // كتابة ذرية مع ملف مؤقت وحصر الأذونات (0o600)
      const tempPath = `${this.sessionFilePath}.tmp`;
      fs.writeFileSync(tempPath, encryptedBuffer, { mode: 0o600 });
      fs.renameSync(tempPath, this.sessionFilePath);

      return { success: true };
    } catch (err: any) {
      console.error('[SecureSessionStore] Failed to write encrypted session to disk:', err);
      return { success: false, error: err.message || 'فشل تشفير وحفظ الجلسة' };
    }
  }

  /**
   * قراءة وفك تشفير الجلسة المخزنة
   */
  public async loadSession(): Promise<PosSessionData | null> {
    // 1. فحص الجلسة في الذاكرة الحية إن وجدت
    if (this.inMemorySession) {
      return this.inMemorySession;
    }

    // 2. إذا كان التشفير غير متاح، لا نقرأ من القرص (fail closed)
    if (!this.encryptionEngine.isEncryptionAvailable()) {
      return null;
    }

    if (!fs.existsSync(this.sessionFilePath)) {
      return null;
    }

    try {
      const encryptedBuffer = fs.readFileSync(this.sessionFilePath);
      if (!encryptedBuffer || encryptedBuffer.length === 0) {
        return null;
      }

      const decryptedJson = this.encryptionEngine.decryptString(encryptedBuffer);
      const session = JSON.parse(decryptedJson) as PosSessionData;

      if (session && session.token) {
        this.inMemorySession = session;
        return session;
      }
      return null;
    } catch (err) {
      console.error('[SecureSessionStore] Failed to decrypt session or file corrupted. Purging corrupt session file:', err);
      this.safeDeleteSessionFile();
      return null;
    }
  }

  /**
   * مسح وتطهير الجلسة تماماً من الذاكرة والقرص
   */
  public async clearSession(): Promise<boolean> {
    this.inMemorySession = null;
    this.safeDeleteSessionFile();
    return true;
  }

  /**
   * التحقق من وجود جلسة فعالة
   */
  public async hasSession(): Promise<boolean> {
    if (this.inMemorySession && !!this.inMemorySession.token) {
      return true;
    }
    if (!this.encryptionEngine.isEncryptionAvailable()) {
      return false;
    }
    return fs.existsSync(this.sessionFilePath);
  }

  private safeDeleteSessionFile() {
    try {
      if (fs.existsSync(this.sessionFilePath)) {
        fs.unlinkSync(this.sessionFilePath);
      }
    } catch (err) {
      console.warn('[SecureSessionStore] Failed to unlink session file:', err);
    }
  }
}
