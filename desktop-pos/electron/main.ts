import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';
import { PosSyncWorker } from './sync/syncWorker';
import { PosPrinterDriver } from './hardware/printer';
import { handleOpenCashDrawer, handlePrintReceipt } from './hardware/hardwareService';
import { validateServerUrl } from '../src/services/serverUrlPolicy';
import { SecureSessionStore } from './security/secureSessionStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let syncWorker: PosSyncWorker | null = null;
let secureSessionStore: SecureSessionStore | null = null;

import {
  readPendingQueue,
  writePendingQueue,
  saveTransaction,
  updateQueueItemStatus,
} from './storage/queueStorage';

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
  if (!mainWindow) {
    return { success: false, status: 'FAILED', simulated: false, error: 'نافذة التطبيق غير متاحة' };
  }

  return await handleOpenCashDrawer(printerNameOrIp, {
    isDev: !!process.env.VITE_DEV_SERVER_URL,
    getPrintersAsync: () => mainWindow!.webContents.getPrintersAsync(),
  });
});

// 4. Hardware: Print Receipt
ipcMain.handle('hardware:print-receipt', async (_event, invoiceData: any, printerNameOrIp?: string) => {
  if (!mainWindow) {
    return { success: false, status: 'FAILED', simulated: false, error: 'نافذة التطبيق غير متاحة' };
  }

  return await handlePrintReceipt(invoiceData, printerNameOrIp, {
    isDev: !!process.env.VITE_DEV_SERVER_URL,
    getPrintersAsync: () => mainWindow!.webContents.getPrintersAsync(),
    printFn: (options, callback) => mainWindow!.webContents.print(options, callback),
  });
});

// 5. Storage: Offline Transactions with Durability & Write Failure Protection
ipcMain.handle('storage:save-transaction', (_event, transaction) => {
  return saveTransaction(transaction);
});

ipcMain.handle('storage:get-pending', () => {
  return readPendingQueue().filter((t) => t.status === 'PENDING' || t.status === 'FAILED');
});

ipcMain.handle('storage:update-status', (_event, syncId: string, status: string, serverId?: any, errorMessage?: string) => {
  return updateQueueItemStatus(syncId, status, serverId, errorMessage);
});

// 6. Central Configuration & Server URL Bridge
ipcMain.handle('config:get-server-url', () => {
  return syncWorker ? syncWorker.getServerUrl() : (process.env.POS_SERVER_URL || 'http://localhost:3000/api/v1');
});

ipcMain.handle('config:set-server-url', (_event, url: string) => {
  if (!syncWorker) {
    return { success: false, error: 'محرك المزامنة غير مهيأ' };
  }
  const validation = validateServerUrl(url, app.isPackaged);
  if (!validation.valid || !validation.normalizedUrl) {
    return {
      success: false,
      error: validation.error || 'عنوان الخادم غير موثوق به لهذا الجهاز',
    };
  }
  const ok = syncWorker.setServerUrl(validation.normalizedUrl, app.isPackaged);
  if (!ok) {
    return {
      success: false,
      error: 'عنوان الخادم غير موثوق به لهذا الجهاز',
    };
  }
  return { success: true };
});

// 7. Session & Background Sync Bridge (Atomic Configuration)
ipcMain.handle('auth:set-session', (_event, token: string | null, serverUrl?: string) => {
  if (!syncWorker) {
    return { success: false, error: 'محرك المزامنة غير مهيأ' };
  }
  if (serverUrl) {
    const validation = validateServerUrl(serverUrl, app.isPackaged);
    if (!validation.valid || !validation.normalizedUrl) {
      return {
        success: false,
        error: validation.error || 'عنوان الخادم غير موثوق به لهذا الجهاز',
      };
    }
  }
  return syncWorker.setSession(token, serverUrl, app.isPackaged);
});

// 8. Secure OS Session Storage (safeStorage)
ipcMain.handle('session:save', async (_event, sessionData: any) => {
  if (!secureSessionStore) {
    return { success: false, error: 'مخزن الجلسة المشفر غير مهيأ' };
  }
  return await secureSessionStore.saveSession(sessionData);
});

ipcMain.handle('session:load', async () => {
  if (!secureSessionStore) return null;
  return await secureSessionStore.loadSession();
});

ipcMain.handle('session:clear', async () => {
  if (!secureSessionStore) return true;
  return await secureSessionStore.clearSession();
});

ipcMain.handle('session:has', async () => {
  if (!secureSessionStore) return false;
  return await secureSessionStore.hasSession();
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

  // Initialize secure session storage
  secureSessionStore = new SecureSessionStore();

  // Initialize and start background sync engine
  syncWorker = new PosSyncWorker(
    readPendingQueue,
    updateQueueItemStatus,
    () => mainWindow,
    app.isPackaged
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
