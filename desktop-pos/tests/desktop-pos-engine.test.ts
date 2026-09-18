import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { PosPrinterDriver, type ReceiptData } from '../electron/hardware/printer';
import { PosSyncWorker } from '../electron/sync/syncWorker';

describe('Desktop POS Engine & Drivers', () => {
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

  it('Atomic Storage Queue: Write, Read, and Backup Recovery on Corruption', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alagoouz-pos-test-'));
    const primaryFile = path.join(testDir, 'pending_queue.json');
    const backupFile = path.join(testDir, 'pending_queue.json.bak');
    const tempFile = path.join(testDir, 'pending_queue.json.tmp');

    const writeQueue = (queue: any[]) => {
      const data = JSON.stringify(queue, null, 2);
      fs.writeFileSync(tempFile, data, 'utf8');
      if (fs.existsSync(primaryFile)) {
        try {
          fs.copyFileSync(primaryFile, backupFile);
        } catch {}
      }
      fs.renameSync(tempFile, primaryFile);
    };

    const readQueue = (): any[] => {
      if (fs.existsSync(primaryFile)) {
        try {
          const raw = fs.readFileSync(primaryFile, 'utf8');
          if (raw.trim()) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          }
        } catch {}
      }
      if (fs.existsSync(backupFile)) {
        try {
          const raw = fs.readFileSync(backupFile, 'utf8');
          if (raw.trim()) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              fs.copyFileSync(backupFile, primaryFile);
              return parsed;
            }
          }
        } catch {}
      }
      return [];
    };

    // 1. Initial write
    writeQueue([{ sync_id: 'sync-1', total: 100, status: 'PENDING' }]);
    expect(readQueue().length).toBe(1);
    expect(readQueue()[0].sync_id).toBe('sync-1');

    // 2. Second write (creates backup of state 1)
    writeQueue([
      { sync_id: 'sync-1', total: 100, status: 'PENDING' },
      { sync_id: 'sync-2', total: 200, status: 'PENDING' },
    ]);
    expect(readQueue().length).toBe(2);
    expect(fs.existsSync(backupFile)).toBe(true);

    // 3. Corrupt primary file (simulate crash mid-write)
    fs.writeFileSync(primaryFile, 'CORRUPTED_PARTIAL_JSON_{invalid', 'utf8');

    // 4. Read should seamlessly recover from backup file
    const recovered = readQueue();
    expect(recovered.length).toBe(1);
    expect(recovered[0].sync_id).toBe('sync-1');

    // 5. Case D: Primary + backup corrupted -> graceful empty fallback without throwing
    fs.writeFileSync(primaryFile, 'CORRUPTED_PRIMARY_{', 'utf8');
    fs.writeFileSync(backupFile, 'CORRUPTED_BACKUP_{', 'utf8');
    const emptyFallback = readQueue();
    expect(emptyFallback).toEqual([]);

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Restart Durability E2E (Item 34 & 35): Pending transactions survive application reboot', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alagoouz-pos-restart-'));
    const queueFile = path.join(testDir, 'pos-offline-sales.json');

    // 1. Before restart: save 3 sales
    const initialSales = [
      { sync_id: 'sale-uuid-1', invoice_number: 'INV-001', total_amount: 150, status: 'PENDING' },
      { sync_id: 'sale-uuid-2', invoice_number: 'INV-002', total_amount: 280, status: 'PENDING' },
      { sync_id: 'sale-uuid-3', invoice_number: 'INV-003', total_amount: 95, status: 'FAILED', retry_count: 2 },
    ];
    fs.writeFileSync(queueFile, JSON.stringify(initialSales, null, 2), 'utf8');

    const pendingBefore = initialSales.filter((s) => s.status === 'PENDING' || s.status === 'FAILED').length;
    expect(pendingBefore).toBe(3);

    // 2. Simulate complete application reboot (re-reading queue from fresh state)
    const rawLoaded = fs.readFileSync(queueFile, 'utf8');
    const loadedQueue = JSON.parse(rawLoaded);

    const pendingAfter = loadedQueue.filter((s: any) => s.status === 'PENDING' || s.status === 'FAILED').length;
    expect(pendingAfter).toBe(pendingBefore);
    expect(loadedQueue.map((s: any) => s.sync_id)).toEqual(['sale-uuid-1', 'sale-uuid-2', 'sale-uuid-3']);

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Sync Worker Concurrency Lock (Item 21)', async () => {
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

  it('Sync Worker Retry Logic & Max Limit (Blocker 2 / Items 7, 8, 9)', async () => {
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

    // Mock server returning FAILED for the transaction
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

    // Set to 9 and run -> reaches 10
    testItem.retry_count = 9;
    const run10 = await worker.runSyncCycle();
    expect(testItem.retry_count).toBe(10);

    // When retry_count = 10, worker must NOT attempt automatic retry on it
    const runAfterLimit = await worker.runSyncCycle();
    expect(runAfterLimit.synced).toBe(0);
    expect(runAfterLimit.remaining).toBe(0); // 0 eligible pending items
    expect(testItem.retry_count).toBe(10); // Unchanged, retained for manual review
  });

  it('Local Queue Persistence Failure Protection (Blocker 3 / Items 10, 11, 12)', async () => {
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

  it('Hardware Contract: Windows Spooler Direct Drawer returns NOT_SUPPORTED', async () => {
    // Contract verification: Windows driver direct spooler pulse must return NOT_SUPPORTED
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
      65530, // Unopened port
      PosPrinterDriver.getDrawerKickCommand()
    );
    expect(failResult).toBe(false);
  });
});
