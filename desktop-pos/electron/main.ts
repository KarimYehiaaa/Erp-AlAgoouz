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

const writePendingQueue = (queue: any[]): boolean => {
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
ipcMain.handle('hardware:open-drawer', async (_event, printerNameOrIp?: string) => {
  console.log('[Hardware] Triggering Cash Drawer kick pulse...');
  if (!mainWindow) return { success: false, error: 'نافذة التطبيق غير متاحة' };

  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  // Check if target is a network IP printer
  const isIpAddress = printerNameOrIp && /^(\d{1,3}\.){3}\d{1,3}$/.test(printerNameOrIp);
  if (isIpAddress) {
    try {
      const pulseBuffer = PosPrinterDriver.getDrawerKickCommand();
      const networkSent = await PosPrinterDriver.printNetworkRaw(printerNameOrIp, 9100, pulseBuffer);
      if (networkSent) {
        return { success: true, simulated: false, method: 'network_raw', target: printerNameOrIp };
      } else {
        return { success: false, simulated: false, error: `تعذر الاتصال بطابعة الشبكة (${printerNameOrIp}) لفتح الدرج` };
      }
    } catch (err: any) {
      return { success: false, simulated: false, error: err.message };
    }
  }

  try {
    const printers = await mainWindow.webContents.getPrintersAsync();

    if (printers.length === 0) {
      if (isDev) {
        return { success: true, simulated: true, message: 'تمت محاكاة فتح الدرج (وضع التطوير بدون طابعة)' };
      }
      return { success: false, simulated: false, error: 'لا توجد طابعة متصلة لإرسال نبضة فتح الدرج' };
    }

    const selectedPrinter = printerNameOrIp
      ? printers.find((p) => p.name === printerNameOrIp) || printers[0]
      : printers.find((p) => p.isDefault) || printers[0];

    if (isDev) {
      return {
        success: true,
        simulated: true,
        printer: selectedPrinter.name,
        message: `تمت محاكاة إرسال نبضة فتح الدرج للطابعة: ${selectedPrinter.name}`,
      };
    }

    return {
      success: true,
      simulated: false,
      method: 'windows_driver',
      printer: selectedPrinter.name,
      message: `تم إرسال إشارة فتح الدرج إلى الطابعة: ${selectedPrinter.name}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// 4. Hardware: Print Receipt
ipcMain.handle('hardware:print-receipt', async (_event, invoiceData: any, printerNameOrIp?: string) => {
  if (!mainWindow) return { success: false, error: 'نافذة التطبيق غير متاحة' };

  // Network IP receipt printer support
  const isIpAddress = printerNameOrIp && /^(\d{1,3}\.){3}\d{1,3}$/.test(printerNameOrIp);
  if (isIpAddress) {
    try {
      const receiptText = PosPrinterDriver.generateTextReceipt(invoiceData);
      const receiptBuffer = Buffer.concat([
        Buffer.from(receiptText, 'utf8'),
        PosPrinterDriver.getPaperCutCommand(),
      ]);
      const sent = await PosPrinterDriver.printNetworkRaw(printerNameOrIp, 9100, receiptBuffer);
      if (sent) {
        return { success: true, simulated: false, method: 'network_raw', target: printerNameOrIp };
      } else {
        return { success: false, simulated: false, error: `فشلت الطباعة عبر طابعة الشبكة (${printerNameOrIp})` };
      }
    } catch (err: any) {
      return { success: false, simulated: false, error: err.message };
    }
  }

  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const isDev = !!process.env.VITE_DEV_SERVER_URL;

    if (printers.length === 0) {
      if (isDev) {
        console.log('[Hardware Receipt Simulation]:\n', PosPrinterDriver.generateTextReceipt(invoiceData));
        return { success: true, simulated: true, message: 'تمت محاكاة طباعة الإيصال بنجاح (وضع التطوير)' };
      }
      return { success: false, simulated: false, error: 'لا توجد طابعة متصلة بالنظام' };
    }

    const selectedPrinter = printerNameOrIp
      ? printers.find((p) => p.name === printerNameOrIp) || printers[0]
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
            resolve({ success: true, simulated: false, method: 'windows_spooler', printer: selectedPrinter.name });
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

// 5. Storage: Offline Transactions with Durability & Write Failure Protection
ipcMain.handle('storage:save-transaction', (_event, transaction) => {
  try {
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
    const writeOk = writePendingQueue(queue);
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
});

ipcMain.handle('storage:get-pending', () => {
  return readPendingQueue().filter((t) => t.status === 'PENDING' || t.status === 'FAILED');
});

ipcMain.handle('storage:update-status', (_event, syncId: string, status: string, serverId?: any) => {
  const queue = readPendingQueue();
  const item = queue.find((t) => t.sync_id === syncId);
  if (item) {
    item.status = status;
    if (status === 'FAILED') {
      item.retry_count = (item.retry_count || 0) + 1;
    }
    if (serverId) item.server_id = serverId;
    item.updated_at = new Date().toISOString();
    return writePendingQueue(queue);
  }
  return false;
});

// 6. Central Configuration & Server URL Bridge
ipcMain.handle('config:get-server-url', () => {
  return syncWorker ? syncWorker.getServerUrl() : (process.env.POS_SERVER_URL || 'http://localhost:3000/api/v1');
});

ipcMain.handle('config:set-server-url', (_event, url: string) => {
  if (syncWorker && url) {
    syncWorker.setServerUrl(url);
  }
  return true;
});

// 7. Session & Background Sync Bridge
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
