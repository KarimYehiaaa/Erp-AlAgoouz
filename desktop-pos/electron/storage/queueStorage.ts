/**
 * electron/storage/queueStorage.ts
 * محرك التخزين الذري لفواتير نقاط البيع المعلقة (Atomic Offline Queue Storage Engine)
 * يوفر كتابة ذرية مع تشفير/تأمين سلامة البيانات (SHA-256 Checksum) ونسخ احتياطي واستعادة تلقائية.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { app, safeStorage } from 'electron';

export interface QueueStoragePaths {
  storageDir: string;
  primaryFile: string;
  backupFile: string;
  tempFile: string;
  checksumFile: string;
  backupChecksumFile: string;
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
    fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  }

  return {
    storageDir,
    primaryFile: path.join(storageDir, 'pending_queue.json'),
    backupFile: path.join(storageDir, 'pending_queue.json.bak'),
    tempFile: path.join(storageDir, 'pending_queue.json.tmp'),
    checksumFile: path.join(storageDir, 'pending_queue.sha256'),
    backupChecksumFile: path.join(storageDir, 'pending_queue.sha256.bak'),
  };
}

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encodeQueue(content: string): Buffer {
  return isEncryptionAvailable() ? safeStorage.encryptString(content) : Buffer.from(content, 'utf8');
}

function decodeQueue(raw: Buffer): string | null {
  const plainText = raw.toString('utf8');
  // Backward compatibility: migrate an old plaintext queue on the next write.
  if (plainText.trimStart().startsWith('[')) return plainText;
  if (!isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(raw);
  } catch {
    return null;
  }
}

function calculateSha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function readPendingQueue(customDir?: string): any[] {
  const { primaryFile, backupFile, checksumFile, backupChecksumFile } = getStoragePaths(customDir);

  if (fs.existsSync(primaryFile)) {
    try {
      const raw = fs.readFileSync(primaryFile);
      const decoded = decodeQueue(raw);
      if (decoded?.trim()) {
        let isChecksumValid = true;
        if (fs.existsSync(checksumFile)) {
          const expectedHash = fs.readFileSync(checksumFile, 'utf8').trim();
          const actualHash = calculateSha256(raw);
          if (expectedHash !== actualHash) {
            console.warn('[Storage Security] Primary queue checksum mismatch! Potential corruption or tampering.');
            isChecksumValid = false;
          }
        }

        if (isChecksumValid) {
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (err) {
      console.error('[Storage] Primary queue file corrupted, attempting backup recovery:', err);
    }
  }

  // Backup fallback
  if (fs.existsSync(backupFile)) {
    try {
      const raw = fs.readFileSync(backupFile);
      const decoded = decodeQueue(raw);
      if (decoded?.trim()) {
        let isBackupChecksumValid = true;
        if (fs.existsSync(backupChecksumFile)) {
          const expectedHash = fs.readFileSync(backupChecksumFile, 'utf8').trim();
          const actualHash = calculateSha256(raw);
          if (expectedHash !== actualHash) {
            console.warn('[Storage Security] Backup queue checksum mismatch!');
            isBackupChecksumValid = false;
          }
        }

        if (isBackupChecksumValid) {
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) {
            console.warn('[Storage] Restored pending queue from verified backup file.');
            try {
              fs.copyFileSync(backupFile, primaryFile);
              if (fs.existsSync(backupChecksumFile)) {
                fs.copyFileSync(backupChecksumFile, checksumFile);
              }
            } catch {}
            return parsed;
          }
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
    const { primaryFile, backupFile, tempFile, checksumFile, backupChecksumFile } = getStoragePaths(customDir);
    const data = JSON.stringify(queue, null, 2);
    const encodedData = encodeQueue(data);
    const hash = calculateSha256(encodedData);
    const tempChecksumFile = `${checksumFile}.tmp`;

    // 1. Write to temporary files with strict permissions (0o600)
    fs.writeFileSync(tempFile, encodedData, { mode: 0o600 });
    fs.writeFileSync(tempChecksumFile, hash, { encoding: 'utf8', mode: 0o600 });

    // 2. Backup previous primary and checksum
    if (fs.existsSync(primaryFile)) {
      try {
        fs.copyFileSync(primaryFile, backupFile);
        if (fs.existsSync(checksumFile)) {
          fs.copyFileSync(checksumFile, backupChecksumFile);
        }
      } catch (copyErr) {
        console.warn('[Storage] Warning: Failed to copy backup file:', copyErr);
      }
    }

    // 3. Atomic renames tmp -> primary
    fs.renameSync(tempFile, primaryFile);
    fs.renameSync(tempChecksumFile, checksumFile);
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

export function resetQueueItemRetry(syncId: string, customDir?: string): boolean {
  const queue = readPendingQueue(customDir);
  const item = queue.find((t) => t.sync_id === syncId);
  if (!item) return false;
  item.status = 'PENDING';
  item.retry_count = 0;
  item.last_error = undefined;
  item.updated_at = new Date().toISOString();
  return writePendingQueue(queue, customDir);
}
