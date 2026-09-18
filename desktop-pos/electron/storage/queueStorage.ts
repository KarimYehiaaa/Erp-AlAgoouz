/**
 * electron/storage/queueStorage.ts
 * محرك التخزين الذري لفواتير نقاط البيع المعلقة (Atomic Offline Queue Storage Engine)
 * يوفر كتابة ذرية مع نسخة احتياطية واستعادة تلقائية عند تلف الملف وحماية ضد فشل التخزين.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';

export interface QueueStoragePaths {
  storageDir: string;
  primaryFile: string;
  backupFile: string;
  tempFile: string;
}

export function getStoragePaths(customDir?: string): QueueStoragePaths {
  let storageDir: string;
  if (customDir) {
    storageDir = customDir;
  } else {
    try {
      storageDir = path.join(app.getPath('userData'), 'pos_storage');
    } catch {
      storageDir = path.join(process.cwd(), '.pos_storage');
    }
  }

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  return {
    storageDir,
    primaryFile: path.join(storageDir, 'pending_queue.json'),
    backupFile: path.join(storageDir, 'pending_queue.json.bak'),
    tempFile: path.join(storageDir, 'pending_queue.json.tmp'),
  };
}

export function readPendingQueue(customDir?: string): any[] {
  const { primaryFile, backupFile } = getStoragePaths(customDir);

  if (fs.existsSync(primaryFile)) {
    try {
      const raw = fs.readFileSync(primaryFile, 'utf8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error('[Storage] Primary queue file corrupted, attempting backup recovery:', err);
    }
  }

  // Backup fallback
  if (fs.existsSync(backupFile)) {
    try {
      const raw = fs.readFileSync(backupFile, 'utf8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          console.warn('[Storage] Restored pending queue from backup file.');
          try {
            fs.copyFileSync(backupFile, primaryFile);
          } catch {}
          return parsed;
        }
      }
    } catch (bakErr) {
      console.error('[Storage] Backup queue read failure:', bakErr);
    }
  }

  return [];
}

export function writePendingQueue(queue: any[], customDir?: string): boolean {
  try {
    const { primaryFile, backupFile, tempFile } = getStoragePaths(customDir);
    const data = JSON.stringify(queue, null, 2);

    // 1. Write to temporary file
    fs.writeFileSync(tempFile, data, 'utf8');

    // 2. Backup previous primary
    if (fs.existsSync(primaryFile)) {
      try {
        fs.copyFileSync(primaryFile, backupFile);
      } catch (copyErr) {
        console.warn('[Storage] Warning: Failed to copy backup file:', copyErr);
      }
    }

    // 3. Atomic rename tmp -> primary
    fs.renameSync(tempFile, primaryFile);
    return true;
  } catch (err) {
    console.error('[Storage] Atomic write failed:', err);
    return false;
  }
}

export function saveTransaction(
  transaction: any,
  customDir?: string
): { success: boolean; transaction?: any; error?: string; message?: string } {
  try {
    const queue = readPendingQueue(customDir);
    const syncId = transaction.sync_id || randomUUID();
    const existingIndex = queue.findIndex((t) => t.sync_id === syncId);
    let record: any;

    if (existingIndex >= 0) {
      record = {
        ...queue[existingIndex],
        ...transaction,
        updated_at: new Date().toISOString(),
      };
      queue[existingIndex] = record;
    } else {
      record = {
        ...transaction,
        sync_id: syncId,
        status: 'PENDING',
        retry_count: 0,
        created_at: new Date().toISOString(),
      };
      queue.push(record);
    }

    const writeOk = writePendingQueue(queue, customDir);
    if (!writeOk) {
      return {
        success: false,
        error: 'OFFLINE_STORAGE_WRITE_FAILED',
        message: 'فشلت كتابة الفاتورة في التخزين المحلي الآمن',
      };
    }
    return {
      success: true,
      transaction: record,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'OFFLINE_STORAGE_WRITE_FAILED',
      message: err.message || 'خطأ غير متوقع أثناء حفظ الفاتورة محلياً',
    };
  }
}

export function updateQueueItemStatus(
  syncId: string,
  status: string,
  serverId?: any,
  errorMessage?: string,
  customDir?: string
): boolean {
  const queue = readPendingQueue(customDir);
  const item = queue.find((t) => t.sync_id === syncId);
  if (item) {
    item.status = status;
    if (status === 'FAILED') {
      item.retry_count = (item.retry_count || 0) + 1;
      if (errorMessage) {
        item.last_error = errorMessage;
      }
    }
    if (serverId) item.server_id = serverId;
    item.updated_at = new Date().toISOString();
    return writePendingQueue(queue, customDir);
  }
  return false;
}
