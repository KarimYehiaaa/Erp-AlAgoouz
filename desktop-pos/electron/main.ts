import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// Local JSON File-backed Fallback / Persistence Storage
const getStorageDir = () => {
  const dir = path.join(app.getPath('userData'), 'pos_storage');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getPendingQueueFile = () => path.join(getStorageDir(), 'pending_queue.json');

const readPendingQueue = (): any[] => {
  try {
    const file = getPendingQueueFile();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading pending queue:', err);
  }
  return [];
};

const writePendingQueue = (queue: any[]) => {
  try {
    fs.writeFileSync(getPendingQueueFile(), JSON.stringify(queue, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing pending queue:', err);
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
  return await mainWindow.webContents.getPrintersAsync();
});

// 3. Hardware: Cash Drawer Kick
ipcMain.handle('hardware:open-drawer', async () => {
  console.log('[Hardware] Opening Cash Drawer via ESC/POS kick pulse...');
  // In native setup, sends 0x1B, 0x70, 0x00, 0x19, 0xFA to default printer
  return { success: true, message: 'تم إرسال إشارة فتح الدرج' };
});

// 4. Hardware: Print Receipt
ipcMain.handle('hardware:print-receipt', async (_event, invoiceData) => {
  console.log('[Hardware] Printing receipt for invoice:', invoiceData?.sale_number || invoiceData?.invoice_number);
  return { success: true };
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

import { PosSyncWorker } from './sync/syncWorker.ts';
import { PosPrinterDriver } from './hardware/printer.ts';

let syncWorker: PosSyncWorker | null = null;

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
