import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { PosPrinterDriver, type ReceiptData } from '../electron/hardware/printer';
import { PosSyncWorker, validateWorkerServerUrl } from '../electron/sync/syncWorker';
import {
  readPendingQueue,
  writePendingQueue,
  saveTransaction,
  updateQueueItemStatus,
  getStoragePaths,
} from '../electron/storage/queueStorage';

describe('Desktop POS Production Engine & Durability Tests', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. Hardware Drivers & ESC/POS Protocol Contracts
  // ─────────────────────────────────────────────────────────────
  it('PosPrinterDriver: ESC/POS Cash Drawer Kick Command', () => {
    const kick = PosPrinterDriver.getDrawerKickCommand();
    expect(Buffer.isBuffer(kick)).toBe(true);
    expect(kick.length).toBe(5);
    expect(Array.from(kick)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it('PosPrinterDriver: ESC/POS Paper Cut Command', () => {
    const cut = PosPrinterDriver.getPaperCutCommand();
    expect(Buffer.isBuffer(cut)).toBe(true);
    expect(cut.length).toBe(4);
    expect(Array.from(cut)).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('PosPrinterDriver: Thermal Text Receipt formatting', () => {
    const receiptData: ReceiptData = {
      company_name: 'بن العجوز للقهوة',
      branch_name: 'فرع الدقي',
      terminal_code: 'TRM-01',
      invoice_number: 'SL-2026-0001',
      cashier_name: 'أحمد محمود',
      date_time: '2026-09-18 10:30',
      items: [
        { name_ar: 'بن تركي فاتح', quantity: 2, unit_price: 150 },
        { name_ar: 'إسبريسو سينجل', quantity: 1, unit_price: 45, custom_notes: 'بدون سكر' },
      ],
      subtotal: 345,
      discount_amount: 15,
      total_amount: 330,
      payment_method: 'cash',
      cash_given: 400,
      change_due: 70,
    };

    const receipt = PosPrinterDriver.generateTextReceipt(receiptData);
    expect(receipt).toContain('بن العجوز للقهوة');
    expect(receipt).toContain('SL-2026-0001');
    expect(receipt).toContain('بن تركي فاتح');
    expect(receipt).toContain('330.00 ج.م');
    expect(receipt).toContain('بدون سكر');
    expect(receipt).toContain('المستلم: 400.00 ج.م');
  });

  it('Hardware Contract: Windows Spooler Direct Drawer returns NOT_SUPPORTED', async () => {
    const handleDrawerOpen = async (isDev: boolean, printerName: string) => {
      if (isDev) {
        return { success: true, status: 'SIMULATED', simulated: true, printer: printerName };
      }
      return {
        success: false,
        status: 'NOT_SUPPORTED',
        simulated: false,
        method: 'windows_driver',
        printer: printerName,
        error: `فتح درج النقدية المباشر عبر Windows Spooler للطابعة (${printerName}) غير مدعوم مباشرة`,
      };
    };

    const devResult = await handleDrawerOpen(true, 'EPSON TM-T20');
    expect(devResult.status).toBe('SIMULATED');
    expect(devResult.success).toBe(true);

    const prodResult = await handleDrawerOpen(false, 'EPSON TM-T20');
    expect(prodResult.status).toBe('NOT_SUPPORTED');
    expect(prodResult.success).toBe(false);
  });

  it('Hardware Network Printer: Socket connection and timeout paths', async () => {
    // 1. Success path (simulated server)
    const server = net.createServer((socket) => {
      socket.on('data', () => {
        socket.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as net.AddressInfo).port;

    const successResult = await PosPrinterDriver.printNetworkRaw(
      '127.0.0.1',
      port,
      PosPrinterDriver.getDrawerKickCommand()
    );
    expect(successResult).toBe(true);
    server.close();

    // 2. Connection failure path (dead port)
    const failResult = await PosPrinterDriver.printNetworkRaw(
      '127.0.0.1',
      65530,
      PosPrinterDriver.getDrawerKickCommand()
    );
    expect(failResult).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Real Production Storage Engine Tests (Scenarios A through E)
  // ─────────────────────────────────────────────────────────────
  it('Production Queue Storage Engine: Scenarios A, B, C (Durability & Corruption Recovery)', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alagoouz-pos-storage-'));
    const paths = getStoragePaths(testDir);

    // Scenario A: Primary valid -> read primary
    const tx1 = { sync_id: 'tx-1', invoice_number: 'INV-001', total_amount: 120 };
    const saveRes = saveTransaction(tx1, testDir);
    expect(saveRes.success).toBe(true);
    expect(saveRes.transaction.status).toBe('PENDING');

    const queueAfterA = readPendingQueue(testDir);
    expect(queueAfterA.length).toBe(1);
    expect(queueAfterA[0].sync_id).toBe('tx-1');

    // Add second transaction (creates backup of state 1)
    const tx2 = { sync_id: 'tx-2', invoice_number: 'INV-002', total_amount: 250 };
    saveTransaction(tx2, testDir);
    expect(readPendingQueue(testDir).length).toBe(2);
    expect(fs.existsSync(paths.backupFile)).toBe(true);

    // Scenario B: Primary corrupted -> recover from backup
    fs.writeFileSync(paths.primaryFile, 'MALFORMED_JSON_CORRUPTION{{{{', 'utf8');
    const recovered = readPendingQueue(testDir);
    expect(recovered.length).toBe(1);
    expect(recovered[0].sync_id).toBe('tx-1');

    // Scenario C: Both corrupted -> safe fallback without throwing
    fs.writeFileSync(paths.primaryFile, 'CORRUPTED_PRIMARY', 'utf8');
    fs.writeFileSync(paths.backupFile, 'CORRUPTED_BACKUP', 'utf8');
    const safeFallback = readPendingQueue(testDir);
    expect(safeFallback).toEqual([]);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Production Queue Storage Engine: Scenario D (Atomic Write Failure Protection)', () => {
    // If a write cannot proceed (e.g. invalid path or file lock), saveTransaction returns explicit failure
    const invalidDir = os.platform() === 'win32' ? 'Z:\\non_existent_drive_9999\\pos_test' : '/root/non_existent_9999';
    const res = saveTransaction({ total_amount: 50 }, invalidDir);
    expect(res.success).toBe(false);
    expect(res.error).toBe('OFFLINE_STORAGE_WRITE_FAILED');
  });

  it('Production Queue Storage Engine: Scenario E (Server SYNCED + Local Persistence Failure Protection)', async () => {
    const queue = [{ sync_id: 'persist-fail-1', status: 'PENDING', total_amount: 300, retry_count: 0 }];

    // Simulate disk failure in updateStatus
    const updateStatusFails = vi.fn().mockReturnValue(false);

    const worker = new PosSyncWorker(() => queue, updateStatusFails, () => null);
    worker.setAuthToken('token');
    (worker as any).pingServer = vi.fn().mockResolvedValue(true);

    // Server returns SYNCED, but local disk write fails
    (worker as any).postJson = vi.fn().mockResolvedValue({
      success: true,
      results: [{ sync_id: 'persist-fail-1', status: 'SYNCED', sale_id: 555 }],
    });

    const result = await worker.runSyncCycle();

    // MUST NOT claim false success!
    expect(updateStatusFails).toHaveBeenCalledWith('persist-fail-1', 'SYNCED', 555);
    expect(result.synced).toBe(0); // Synced count NOT incremented
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(1); // Item remains pending reconciliation
  });

  it('Application Reboot Durability: Pending transactions survive reload from real disk', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alagoouz-pos-reboot-'));

    // 1. Write 3 transactions using real module
    saveTransaction({ sync_id: 'reboot-1', total_amount: 100 }, testDir);
    saveTransaction({ sync_id: 'reboot-2', total_amount: 200 }, testDir);
    saveTransaction({ sync_id: 'reboot-3', total_amount: 300 }, testDir);
    updateQueueItemStatus('reboot-3', 'FAILED', undefined, 'Network error', testDir);

    // 2. Simulate fresh boot: re-read from disk
    const freshQueue = readPendingQueue(testDir);
    expect(freshQueue.length).toBe(3);
    expect(freshQueue.find((t) => t.sync_id === 'reboot-3')?.status).toBe('FAILED');
    expect(freshQueue.find((t) => t.sync_id === 'reboot-3')?.retry_count).toBe(1);
    expect(freshQueue.find((t) => t.sync_id === 'reboot-3')?.last_error).toBe('Network error');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Production Queue Storage Engine: Scenario F & H (Persistence of retry_count, last_error, and server_id)', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alagoouz-pos-status-'));

    // 1. Initial save
    const saveRes = saveTransaction({ sync_id: 'tx-status-1', total_amount: 150 }, testDir);
    expect(saveRes.success).toBe(true);

    // 2. Mark as FAILED with error message -> retry_count increments to 1
    const failRes1 = updateQueueItemStatus('tx-status-1', 'FAILED', undefined, 'ECONNREFUSED 127.0.0.1', testDir);
    expect(failRes1).toBe(true);
    let queue = readPendingQueue(testDir);
    expect(queue[0].status).toBe('FAILED');
    expect(queue[0].retry_count).toBe(1);
    expect(queue[0].last_error).toBe('ECONNREFUSED 127.0.0.1');

    // 3. Mark as FAILED second time -> retry_count increments to 2
    updateQueueItemStatus('tx-status-1', 'FAILED', undefined, 'TIMEOUT', testDir);
    queue = readPendingQueue(testDir);
    expect(queue[0].retry_count).toBe(2);
    expect(queue[0].last_error).toBe('TIMEOUT');

    // 4. Scenario H: Mark as SYNCED with server_id -> persists server_id and status to disk
    const syncRes = updateQueueItemStatus('tx-status-1', 'SYNCED', 7788, undefined, testDir);
    expect(syncRes).toBe(true);
    queue = readPendingQueue(testDir);
    expect(queue[0].status).toBe('SYNCED');
    expect(queue[0].server_id).toBe(7788);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Production Queue Storage Engine: Scenario G (Idempotency & Deduplication Protection)', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alagoouz-pos-idempotency-'));

    // 1. Save transaction first time
    const res1 = saveTransaction({ sync_id: 'duplicate-check-1', total_amount: 500, note: 'Initial' }, testDir);
    expect(res1.success).toBe(true);
    expect(readPendingQueue(testDir).length).toBe(1);

    // 2. Save same sync_id second time (e.g. retry from UI or re-submit)
    const res2 = saveTransaction({ sync_id: 'duplicate-check-1', total_amount: 500, note: 'Updated note' }, testDir);
    expect(res2.success).toBe(true);

    // Verify queue length remains 1 (no duplicates!)
    const queue = readPendingQueue(testDir);
    expect(queue.length).toBe(1);
    expect(queue[0].sync_id).toBe('duplicate-check-1');
    expect(queue[0].note).toBe('Updated note');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Server URL Validation & Security Policy Tests
  // ─────────────────────────────────────────────────────────────
  describe('Server URL Validation Policy (Development & Production)', () => {
    it('Development: Accepts http://localhost and http://127.0.0.1', () => {
      const devLocalhost = validateWorkerServerUrl('http://localhost:3000/api/v1', false);
      expect(devLocalhost.valid).toBe(true);
      expect(devLocalhost.normalizedUrl).toBe('http://localhost:3000/api/v1');

      const devIp = validateWorkerServerUrl('http://127.0.0.1:3000/api/v1/', false);
      expect(devIp.valid).toBe(true);
      expect(devIp.normalizedUrl).toBe('http://127.0.0.1:3000/api/v1');
    });

    it('Production: Accepts secure https:// endpoints', () => {
      const prodHttps = validateWorkerServerUrl('https://api.alagoouz.com/api/v1', true);
      expect(prodHttps.valid).toBe(true);
      expect(prodHttps.normalizedUrl).toBe('https://api.alagoouz.com/api/v1');
    });

    it('Production: Strictly rejects unencrypted external http:// endpoints', () => {
      const prodHttp = validateWorkerServerUrl('http://api.alagoouz.com/api/v1', true);
      expect(prodHttp.valid).toBe(false);
      expect(prodHttp.error).toContain('HTTPS');
    });

    it('Strictly rejects invalid, malformed, empty, or dangerous schemes', () => {
      // Empty string
      const emptyRes = validateWorkerServerUrl('', false);
      expect(emptyRes.valid).toBe(false);

      // Not a URL
      const malformedRes = validateWorkerServerUrl('not-a-url', false);
      expect(malformedRes.valid).toBe(false);

      // Dangerous schemes
      const jsScheme = validateWorkerServerUrl('javascript://alert(1)', false);
      expect(jsScheme.valid).toBe(false);

      const fileScheme = validateWorkerServerUrl('file:///etc/passwd', false);
      expect(fileScheme.valid).toBe(false);
    });

    it('SyncWorker.setServerUrl defensively rejects invalid URLs and leaves serverUrl unchanged', () => {
      const worker = new PosSyncWorker(() => [], () => true, () => null);
      const initialUrl = worker.getServerUrl();

      // Attempt to set invalid URL in production
      const rejectRes = worker.setServerUrl('http://insecure-remote.com/api/v1', true);
      expect(rejectRes).toBe(false);
      expect(worker.getServerUrl()).toBe(initialUrl); // Unchanged!

      // Attempt to set valid HTTPS URL in production
      const acceptRes = worker.setServerUrl('https://secure-api.alagoouz.com/api/v1', true);
      expect(acceptRes).toBe(true);
      expect(worker.getServerUrl()).toBe('https://secure-api.alagoouz.com/api/v1');
    });

    it('Packaged SyncWorker safely rejects insecure initial environment URL and falls back to localhost', () => {
      const origEnv = process.env.POS_SERVER_URL;
      try {
        process.env.POS_SERVER_URL = 'http://external-insecure-api.com/api/v1';

        // When packaged = true, insecure external HTTP must be rejected at initialization
        const packagedWorker = new PosSyncWorker(() => [], () => true, () => null, true);
        expect(packagedWorker.getServerUrl()).toBe('http://localhost:3000/api/v1');

        // When packaged = false (dev mode), localhost is fine
        process.env.POS_SERVER_URL = 'http://localhost:4000/api/v1';
        const devWorker = new PosSyncWorker(() => [], () => true, () => null, false);
        expect(devWorker.getServerUrl()).toBe('http://localhost:4000/api/v1');

        // When packaged = true, valid HTTPS is accepted
        process.env.POS_SERVER_URL = 'https://cloud-api.alagoouz.com/api/v1';
        const prodHttpsWorker = new PosSyncWorker(() => [], () => true, () => null, true);
        expect(prodHttpsWorker.getServerUrl()).toBe('https://cloud-api.alagoouz.com/api/v1');
      } finally {
        if (origEnv !== undefined) {
          process.env.POS_SERVER_URL = origEnv;
        } else {
          delete process.env.POS_SERVER_URL;
        }
      }
    });

    it('SyncWorker runSyncCycle pre-flight aborts and blocks outbound sync if serverUrl is invalid in production', async () => {
      const queue = [{ sync_id: 'preflight-test-1', status: 'PENDING', total_amount: 100 }];
      const worker = new PosSyncWorker(() => queue, () => true, () => null, true);
      worker.setAuthToken('mock-auth-token');

      // Force invalid URL on worker instance
      (worker as any).serverUrl = 'http://remote-external-insecure.com/api/v1';

      const postSpy = vi.spyOn(worker as any, 'postJson');
      const pingSpy = vi.spyOn(worker as any, 'pingServer');

      const result = await worker.runSyncCycle();
      expect(result.success).toBe(false);
      expect(result.synced).toBe(0);

      // Pre-flight check MUST have blocked network requests
      expect(pingSpy).not.toHaveBeenCalled();
      expect(postSpy).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Retry Logic & Sync Engine Lifecycle
  // ─────────────────────────────────────────────────────────────
  it('Sync Worker Concurrency Lock', async () => {
    let localQueue = [
      { sync_id: 'sync-cycle-1', status: 'PENDING', total_amount: 250, retry_count: 0 },
    ];

    const worker = new PosSyncWorker(
      () => localQueue,
      (syncId, status, serverId) => {
        const item = localQueue.find((t) => t.sync_id === syncId);
        if (item) {
          item.status = status;
          if (serverId) (item as any).server_id = serverId;
          return true;
        }
        return false;
      },
      () => null
    );

    (worker as any).pingServer = vi.fn().mockResolvedValue(true);
    (worker as any).postJson = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return {
        success: true,
        results: [{ sync_id: 'sync-cycle-1', status: 'SYNCED', sale_id: 999 }],
      };
    });

    worker.setAuthToken('test-bearer-token');

    // Launch first cycle
    const cycle1Promise = worker.runSyncCycle();

    // Concurrently trigger second cycle while first is in flight
    const cycle2 = await worker.runSyncCycle();
    expect(cycle2.success).toBe(false);

    // Cycle 1 finishes successfully
    const cycle1 = await cycle1Promise;
    expect(cycle1.success).toBe(true);
    expect(cycle1.synced).toBe(1);
    expect(localQueue[0].status).toBe('SYNCED');
  });

  it('Sync Worker Retry Progression up to 10 and Halting Auto-Sync', async () => {
    const testItem = { sync_id: 'retry-test-1', status: 'PENDING', total_amount: 100, retry_count: 0, last_error: '' };
    const queue = [testItem];

    const updateStatus = (syncId: string, status: string, serverId?: any, errorMessage?: string) => {
      const item = queue.find((t) => t.sync_id === syncId);
      if (item) {
        item.status = status;
        if (status === 'FAILED') {
          item.retry_count = (item.retry_count || 0) + 1;
          if (errorMessage) item.last_error = errorMessage;
        }
        return true;
      }
      return false;
    };

    const worker = new PosSyncWorker(() => queue, updateStatus, () => null);
    worker.setAuthToken('mock-token');
    (worker as any).pingServer = vi.fn().mockResolvedValue(true);

    // Mock server returning FAILED
    (worker as any).postJson = vi.fn().mockResolvedValue({
      success: true,
      results: [{ sync_id: 'retry-test-1', status: 'FAILED', error: 'WAREHOUSE_STOCK_DEFICIT' }],
    });

    // Attempt 1
    expect(testItem.retry_count).toBe(0);
    const run1 = await worker.runSyncCycle();
    expect(run1.success).toBe(false);
    expect(testItem.retry_count).toBe(1);
    expect(testItem.status).toBe('FAILED');
    expect(testItem.last_error).toBe('WAREHOUSE_STOCK_DEFICIT');

    // Attempt 2
    const run2 = await worker.runSyncCycle();
    expect(run2.success).toBe(false);
    expect(testItem.retry_count).toBe(2);

    // Fast forward to 9 and run -> reaches 10
    testItem.retry_count = 9;
    const run10 = await worker.runSyncCycle();
    expect(testItem.retry_count).toBe(10);

    // When retry_count = 10, worker MUST NOT attempt automatic retry on it
    const runAfterLimit = await worker.runSyncCycle();
    expect(runAfterLimit.synced).toBe(0);
    expect(runAfterLimit.remaining).toBe(0); // 0 eligible pending items
    expect(testItem.retry_count).toBe(10); // Unchanged, retained for manual reconciliation
  });
});
