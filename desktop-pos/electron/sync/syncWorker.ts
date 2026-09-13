/**
 * electron/sync/syncWorker.ts — محرك المزامنة التلقائي في الخلفية
 * يفحص الاتصال بالسيرفر كل 15 ثانية، ويرحل الفواتير المعلقة دون أي تدخل يدوي
 */
import http from 'http';
import { BrowserWindow } from 'electron';

export interface SyncConfig {
  serverUrl: string;
  checkIntervalMs: number;
}

export class PosSyncWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private serverUrl = 'http://localhost:3000/api/v1';

  constructor(
    private readQueue: () => any[],
    private updateStatus: (syncId: string, status: string, serverId?: any) => boolean,
    private getMainWindow: () => BrowserWindow | null
  ) {}

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
    console.log('[SyncWorker] Background sync worker stopped.');
  }

  public async runSyncCycle() {
    const queue = this.readQueue();
    const pendingItems = queue.filter((item) => item.status === 'PENDING' || item.status === 'FAILED');

    if (pendingItems.length === 0) return;

    console.log(`[SyncWorker] Found ${pendingItems.length} pending items. Attempting sync...`);

    // Check server health
    const isOnline = await this.pingServer();
    if (!isOnline) {
      console.log('[SyncWorker] Central server offline. Will retry on next cycle.');
      return;
    }

    // Send batch
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
            this.updateStatus(res.sync_id, 'SYNCED', res.sale_id);
            syncedCount++;
          }
        }
        console.log(`[SyncWorker] Batch sync completed successfully. Synced: ${syncedCount}/${pendingItems.length}`);

        // Notify Vue renderer
        const win = this.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('sync:updated', {
            synced: syncedCount,
            remaining: pendingItems.length - syncedCount,
          });
        }
      }
    } catch (err: any) {
      console.error('[SyncWorker] Error during batch sync:', err.message);
    }
  }

  private pingServer(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`${this.serverUrl}/sync/status`, { timeout: 3000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private postJson(url: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const postData = JSON.stringify(data);

      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 80,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 6000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve({ success: false });
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
    });
  }
}
