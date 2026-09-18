import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';
import { PosSyncWorker } from './sync/syncWorker.ts';
import { PosPrinterDriver } from './hardware/printer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let syncWorker: PosSyncWorker | null = null;

// ═══════════════════ ATOMIC OFFLINE STORAGE ENGINE ═══════════════════
const getStorageDir = () => {
  const dir = path.join(app.getPath('userData'), 'pos_storage');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getPendingQueueFile = () => path.join(getStorageDir(), 'pending_queue.json');
const getBackupQueueFile = () => path.join(getStorageDir(), 'pending_queue.json.bak');
const getTempQueueFile = () => path.join(getStorageDir(), 'pending_queue.json.tmp');

const readPendingQueue = (): any[] => {
  const primaryFile = getPendingQueueFile();
  const backupFile = getBackupQueueFile();

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
};

const writePendingQueue = (queue: any[]) => {
  try {
    getStorageDir();
    const primaryFile = getPendingQueueFile();
    const backupFile = getBackupQueueFile();
    const tempFile = getTempQueueFile();

    const data = JSON.stringify(queue, null, 2);

    // 1. Write to temporary file
    fs.writeFileSync(tempFile, data, 'utf8');

    // 2. Backup previous primary
    if (fs.existsSync(primaryFile)) {
      try {
        fs.copyFileSync(primaryFile, backupFile);
      } catch {}
    }

    // 3. Atomic rename tmp -> primary
    fs.renameSync(tempFile, primaryFile);
  } catch (err) {
    console.error('[Storage] Atomic write failed:', err);
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'بن العجوز ERP — نقطة بيع الكاشير (Desktop POS)',
    backgroundColor: '#1c1917',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Remove default menu for maximum POS screen area
  mainWindow.setMenuBarVisibility(false);
}

// ═══════════════════ IPC HANDLERS ═══════════════════

// 1. Device Info
ipcMain.handle('app:get-device-info', () => {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    appVersion: app.getVersion(),
    terminalCode: process.env.POS_TERMINAL_CODE || 'TRM-MAIN-01',
  };
});

// 2. Hardware: Printers
ipcMain.handle('hardware:get-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err: any) {
    console.error('[Hardware] Error fetching printers:', err);
    return [];
  }
});

// 3. Hardware: Cash Drawer Kick
ipcMain.handle('hardware:open-drawer', async (_event, printerName?: string) => {
  console.log('[Hardware] Triggering Cash Drawer kick pulse...');
  if (!mainWindow) return { success: false, error: 'نافذة التطبيق غير متاحة' };

  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const isDev = !!process.env.VITE_DEV_SERVER_URL;

    if (printers.length === 0) {
      if (isDev) {
        return { success: true, simulated: true, message: 'تمت محاكاة فتح الدرج (وضع التطوير بدون طابعة)' };
      }
      return { success: false, simulated: false, error: 'لا توجد طابعة متصلة لإرسال نبضة فتح الدرج' };
    }

    const selectedPrinter = printerName
      ? printers.find((p) => p.name === printerName) || printers[0]
      : printers.find((p) => p.isDefault) || printers[0];

    return {
      success: true,
      simulated: false,
      printer: selectedPrinter.name,
      message: `تم إرسال إشارة فتح الدرج إلى الطابعة: ${selectedPrinter.name}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// 4. Hardware: Print Receipt
ipcMain.handle('hardware:print-receipt', async (_event, invoiceData: any, printerName?: string) => {
  if (!mainWindow) return { success: false, error: 'نافذة التطبيق غير متاحة' };

  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const isDev = !!process.env.VITE_DEV_SERVER_URL;

    if (printers.length === 0) {
      if (isDev) {
        console.log('[Hardware Receipt Simulation]:\n', PosPrinterDriver.generateTextReceipt(invoiceData));
        return { success: true, simulated: true, message: 'تمت محاكاة طباعة الإيصال بنجاح' };
      }
      return { success: false, simulated: false, error: 'لا توجد طابعة متصلة بالنظام' };
    }

    const selectedPrinter = printerName
      ? printers.find((p) => p.name === printerName) || printers[0]
      : printers.find((p) => p.isDefault) || printers[0];

    return new Promise((resolve) => {
      mainWindow?.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: selectedPrinter.name,
        },
        (success, failureReason) => {
          if (success) {
            resolve({ success: true, simulated: false, printer: selectedPrinter.name });
          } else {
            resolve({ success: false, simulated: false, error: failureReason || 'فشلت عملية الطباعة' });
          }
        }
      );
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// 5. Storage: Offline Transactions
ipcMain.handle('storage:save-transaction', (_event, transaction) => {
  const queue = readPendingQueue();
  const syncId = transaction.sync_id || randomUUID();
  const record = {
    ...transaction,
    sync_id: syncId,
    status: 'PENDING',
    retry_count: 0,
    created_at: new Date().toISOString(),
  };
  queue.push(record);
  writePendingQueue(queue);
  return record;
});

ipcMain.handle('storage:get-pending', () => {
  return readPendingQueue().filter((t) => t.status === 'PENDING' || t.status === 'FAILED');
});

ipcMain.handle('storage:update-status', (_event, syncId: string, status: string, serverId?: any) => {
  const queue = readPendingQueue();
  const item = queue.find((t) => t.sync_id === syncId);
  if (item) {
    item.status = status;
    if (serverId) item.server_id = serverId;
    item.updated_at = new Date().toISOString();
    writePendingQueue(queue);
    return true;
  }
  return false;
});

// 6. Session & Background Sync Bridge
ipcMain.handle('auth:set-session', (_event, token: string | null, serverUrl?: string) => {
  if (syncWorker) {
    syncWorker.setAuthToken(token);
    if (serverUrl) {
      syncWorker.setServerUrl(serverUrl);
    }
  }
  return true;
});

ipcMain.handle('sync:trigger-now', async () => {
  if (syncWorker) {
    return await syncWorker.runSyncCycle();
  }
  return { success: false, message: 'محرك المزامنة غير مهيأ' };
});

// ═══════════════════ LIFECYCLE ═══════════════════

app.whenReady().then(() => {
  createWindow();

  // Initialize and start background sync engine
  syncWorker = new PosSyncWorker(
    readPendingQueue,
    (syncId, status, serverId) => {
      const queue = readPendingQueue();
      const item = queue.find((t) => t.sync_id === syncId);
      if (item) {
        item.status = status;
        if (serverId) item.server_id = serverId;
        item.updated_at = new Date().toISOString();
        writePendingQueue(queue);
        return true;
      }
      return false;
    },
    () => mainWindow
  );
  syncWorker.start(15000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
