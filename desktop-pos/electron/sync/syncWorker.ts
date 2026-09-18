/**
 * electron/sync/syncWorker.ts — محرك المزامنة التلقائي في الخلفية
 * يفحص الاتصال بالسيرفر كل 15 ثانية، ويرحل الفواتير المعلقة دون أي تدخل يدوي
 */
import http from 'http';
import https from 'https';
import { BrowserWindow } from 'electron';

export interface SyncConfig {
  serverUrl: string;
  checkIntervalMs: number;
}

export function validateWorkerServerUrl(
  url: string,
  isPackaged = false
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
  const isProduction = isPackaged || process.env.NODE_ENV === 'production';

  if (isProduction && parsed.protocol === 'http:' && !isLocal) {
    return {
      valid: false,
      error: 'في بيئة الإنتاج، يجب استخدام بروتوكول مشفر وآمن (HTTPS) للاتصال بالخادم المركزي لحماية البيانات',
    };
  }

  const cleanUrl = url.trim().replace(/\/+$/, '');
  return { valid: true, normalizedUrl: cleanUrl };
}

export class PosSyncWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private serverUrl: string;
  private authToken: string | null = null;
  private syncInFlight = false;

  constructor(
    private readQueue: () => any[],
    private updateStatus: (syncId: string, status: string, serverId?: any, errorMessage?: string) => boolean,
    private getMainWindow: () => BrowserWindow | null,
    private isPackaged: boolean = false
  ) {
    const rawInitial = process.env.POS_SERVER_URL || 'http://localhost:3000/api/v1';
    const validation = validateWorkerServerUrl(rawInitial, this.isPackaged);
    if (validation.valid && validation.normalizedUrl) {
      this.serverUrl = validation.normalizedUrl;
    } else {
      console.warn(
        `[SyncWorker Security] Initial server URL (${rawInitial}) rejected for production environment: ${validation.error}. Falling back to default secure localhost.`
      );
      this.serverUrl = 'http://localhost:3000/api/v1';
    }
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public setAuthToken(token: string | null) {
    this.authToken = token;
    console.log('[SyncWorker] Auth token updated in background sync engine:', token ? 'ACTIVE' : 'CLEARED');
  }

  public setSession(
    token: string | null,
    serverUrl?: string,
    isPackaged?: boolean
  ): { success: boolean; error?: string } {
    const packaged = isPackaged !== undefined ? isPackaged : this.isPackaged;

    // Pre-validate serverUrl if provided. Reject ATOMICALLY without touching state if invalid.
    let validatedUrl: string | undefined;
    if (serverUrl) {
      const res = validateWorkerServerUrl(serverUrl, packaged);
      if (!res.valid || !res.normalizedUrl) {
        console.error('[SyncWorker Security] Session configuration rejected invalid URL:', serverUrl, res.error);
        return {
          success: false,
          error: res.error || 'عنوان الخادم غير صالح أو غير مسموح به في بيئة الإنتاج (يجب استخدام HTTPS)',
        };
      }
      validatedUrl = res.normalizedUrl;
    }

    // Atomic update
    if (validatedUrl) {
      this.serverUrl = validatedUrl;
      console.log('[SyncWorker] Central server URL atomically updated to:', this.serverUrl);
    }

    this.authToken = token;
    console.log('[SyncWorker] Auth session token atomically updated:', token ? 'ACTIVE' : 'CLEARED');

    return { success: true };
  }

  public setServerUrl(url: string, isPackaged?: boolean): boolean {
    const packaged = isPackaged !== undefined ? isPackaged : this.isPackaged;
    const res = validateWorkerServerUrl(url, packaged);
    if (!res.valid || !res.normalizedUrl) {
      console.error('[SyncWorker Security] Rejected invalid or unencrypted server URL:', url, 'Error:', res.error);
      return false;
    }
    this.serverUrl = res.normalizedUrl;
    console.log('[SyncWorker] Central server URL updated to:', this.serverUrl);
    return true;
  }

  public start(intervalMs = 15000) {
    if (this.isRunning) return;
    this.isRunning = true;

    // First check after 3 seconds
    setTimeout(() => this.runSyncCycle(), 3000);

    // Continuous loop
    this.intervalId = setInterval(() => {
      this.runSyncCycle();
    }, intervalMs);

    console.log('[SyncWorker] Background sync worker started. Interval:', intervalMs, 'ms');
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.syncInFlight = false;
    console.log('[SyncWorker] Background sync worker stopped.');
  }

  public async runSyncCycle(): Promise<{ success: boolean; synced: number; remaining: number }> {
    if (this.syncInFlight) {
      console.log('[SyncWorker] Sync cycle already in flight. Skipping overlapping run.');
      const queue = this.readQueue();
      const remaining = queue.filter(
        (item) => (item.status === 'PENDING' || item.status === 'FAILED') && (item.retry_count || 0) < 10
      ).length;
      return { success: false, synced: 0, remaining };
    }

    this.syncInFlight = true;
    try {
      const queue = this.readQueue();
      const pendingItems = queue.filter(
        (item) => (item.status === 'PENDING' || item.status === 'FAILED') && (item.retry_count || 0) < 10
      );

      if (pendingItems.length === 0) {
        return { success: true, synced: 0, remaining: 0 };
      }

      if (!this.authToken) {
        console.log('[SyncWorker] Pending items detected, but no active cashier session token. Waiting for login...');
        return { success: false, synced: 0, remaining: pendingItems.length };
      }

      console.log(`[SyncWorker] Found ${pendingItems.length} pending items. Attempting sync...`);

      // Pre-flight server URL security verification
      const urlCheck = validateWorkerServerUrl(this.serverUrl, this.isPackaged);
      if (!urlCheck.valid || !urlCheck.normalizedUrl) {
        console.error(
          `[SyncWorker Security] Blocked outbound sync: unencrypted or invalid URL in production (${this.serverUrl}): ${urlCheck.error}`
        );
        return { success: false, synced: 0, remaining: pendingItems.length };
      }

      // Check server health
      const isOnline = await this.pingServer();
      if (!isOnline) {
        console.log('[SyncWorker] Central server offline. Will retry on next cycle.');
        return { success: false, synced: 0, remaining: pendingItems.length };
      }

      try {
        const payload = {
          sales: pendingItems.map((item) => ({
            ...item,
            pos_shift_id: item.pos_shift_id || undefined,
          })),
        };

        const result = await this.postJson(`${this.serverUrl}/sales/batch-sync`, payload);
        if (result && result.success && Array.isArray(result.results)) {
          let syncedCount = 0;
          for (const res of result.results) {
            if (res.status === 'SYNCED') {
              const localUpdated = this.updateStatus(res.sync_id, 'SYNCED', res.sale_id);
              if (localUpdated) {
                syncedCount++;
              } else {
                console.error(
                  `[SyncWorker] CRITICAL PERSISTENCE FAILURE: Server confirmed SYNCED for transaction ${res.sync_id}, but local queue update failed to persist to disk! Retaining for local reconciliation.`
                );
              }
            } else if (res.status === 'FAILED') {
              this.updateStatus(res.sync_id, 'FAILED', undefined, res.error || 'SERVER_SYNC_REJECTED');
            }
          }
          console.log(`[SyncWorker] Batch sync completed. Locally persisted sync: ${syncedCount}/${pendingItems.length}`);

          const currentQueue = this.readQueue();
          const remaining = currentQueue.filter(
            (item) => (item.status === 'PENDING' || item.status === 'FAILED') && (item.retry_count || 0) < 10
          ).length;

          // Notify Vue renderer
          const win = this.getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('sync:updated', {
              synced: syncedCount,
              remaining,
            });
          }
          return { success: syncedCount > 0 && syncedCount === pendingItems.length, synced: syncedCount, remaining };
        }

        // Server returned failure or invalid result structure
        for (const item of pendingItems) {
          this.updateStatus(item.sync_id, 'FAILED', undefined, result?.message || 'INVALID_BATCH_RESPONSE');
        }
        const currentQueue = this.readQueue();
        const remaining = currentQueue.filter(
          (item) => (item.status === 'PENDING' || item.status === 'FAILED') && (item.retry_count || 0) < 10
        ).length;
        return { success: false, synced: 0, remaining };
      } catch (err: any) {
        console.error('[SyncWorker] Error during batch sync:', err.message);
        for (const item of pendingItems) {
          this.updateStatus(item.sync_id, 'FAILED', undefined, err.message || 'NETWORK_OR_SERVER_ERROR');
        }
        const currentQueue = this.readQueue();
        const remaining = currentQueue.filter(
          (item) => (item.status === 'PENDING' || item.status === 'FAILED') && (item.retry_count || 0) < 10
        ).length;
        return { success: false, synced: 0, remaining };
      }
    } finally {
      this.syncInFlight = false;
    }
  }

  private pingServer(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const parsedUrl = new URL(`${this.serverUrl}/sync/status`);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const req = client.get(
          parsedUrl.toString(),
          { timeout: 3000 },
          (res) => {
            resolve(res.statusCode === 200);
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  private postJson(url: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(url);
        const postData = JSON.stringify(data);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers: Record<string, string | number> = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        };

        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const req = client.request(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers,
            timeout: 8000,
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch {
                resolve({ success: false, statusCode: res.statusCode });
              }
            });
          }
        );

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
