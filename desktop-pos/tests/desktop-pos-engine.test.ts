import { describe, it, expect } from 'vitest';
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

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });
});
