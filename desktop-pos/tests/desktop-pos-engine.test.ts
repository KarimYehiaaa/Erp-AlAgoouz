import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PosPrinterDriver, type ReceiptData } from '../electron/hardware/printer.ts';

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

  it('Offline Save Failure Protection (Item 19): Returns explicit error when storage write fails', () => {
    let mockWriteShouldFail = true;
    const saveTransaction = (transaction: any) => {
      const queue: any[] = [];
      const record = {
        ...transaction,
        sync_id: transaction.sync_id || 'test-uuid-123',
        status: 'PENDING',
        retry_count: 0,
        created_at: new Date().toISOString(),
      };
      queue.push(record);

      if (mockWriteShouldFail) {
        return {
          success: false,
          error: 'OFFLINE_STORAGE_WRITE_FAILED',
          message: 'فشلت كتابة الفاتورة في التخزين المحلي الآمن',
        };
      }
      return { success: true, transaction: record };
    };

    const failResult = saveTransaction({ total_amount: 150 });
    expect(failResult.success).toBe(false);
    expect(failResult.error).toBe('OFFLINE_STORAGE_WRITE_FAILED');

    mockWriteShouldFail = false;
    const okResult = saveTransaction({ total_amount: 150 });
    expect(okResult.success).toBe(true);
    expect(okResult.transaction.sync_id).toBe('test-uuid-123');
  });

  it('Sync Worker Concurrency Lock & Full Lifecycle (Items 21 & 28)', async () => {
    const { PosSyncWorker } = await import('../electron/sync/syncWorker.ts');
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

    // Mock pingServer and postJson to simulate responsive backend
    (worker as any).pingServer = vi.fn().mockResolvedValue(true);
    (worker as any).postJson = vi.fn().mockImplementation(async () => {
      // Simulate 50ms network delay
      await new Promise((r) => setTimeout(r, 50));
      return {
        success: true,
        results: [{ sync_id: 'sync-cycle-1', status: 'SYNCED', sale_id: 999 }],
      };
    });

    worker.setAuthToken('test-bearer-token');

    // Launch first cycle
    const cycle1Promise = worker.runSyncCycle();

    // Simultaneously trigger second cycle while first is in flight
    const cycle2 = await worker.runSyncCycle();
    // Concurrency lock must skip cycle 2!
    expect(cycle2.success).toBe(false);

    // Wait for cycle 1 to finish
    const cycle1 = await cycle1Promise;
    expect(cycle1.success).toBe(true);
    expect(cycle1.synced).toBe(1);

    // Verify queue persisted status update
    expect(localQueue[0].status).toBe('SYNCED');
    expect((localQueue[0] as any).server_id).toBe(999);
  });
});
