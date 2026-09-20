import { app, BrowserWindow, ipcMain, shell } from 'electron';
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
import {
  validateIpcSender,
  validateSessionPayload,
  validateTransactionPayload,
  sanitizeIpcError,
} from './security/ipcSecurity';

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
  resetQueueItemRetry,
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
      sandbox: true,
    },
  });

  // 1. تأمين فتح النوافذ الجديدة (Window Open Policy)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      // فتح الروابط الخارجية في متصفح النظام الافتراضي فقط
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // 2. تأمين التنقل (Navigation Security Policy)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
      try {
        const allowedOrigin = new URL(devUrl).origin;
        const targetOrigin = new URL(navigationUrl).origin;
        if (targetOrigin === allowedOrigin) return;
      } catch {}
    } else if (navigationUrl.startsWith('file://')) {
      const normalized = navigationUrl.replace(/\\/g, '/');
      if (normalized.includes('/dist/index.html')) return;
    }

    console.warn(`[Window Security] Blocked unauthorized navigation to: ${navigationUrl}`);
    event.preventDefault();
  });

  // 3. منع إرفاق عناصر webview غير الموثوقة
  mainWindow.webContents.on('will-attach-webview', (event) => {
    console.warn('[Window Security] Denied webview attachment');
    event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // إخفاء القائمة الافتراضية لمنح مساحة كاملة لشاشة الكاشير
  mainWindow.setMenuBarVisibility(false);
}

// ═══════════════════ IPC HANDLERS ═══════════════════

// 1. Device Info
ipcMain.handle('app:get-device-info', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    throw new Error('تم رفض الطلب: مرسل غير مصرح له');
  }
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    appVersion: app.getVersion(),
    terminalCode: process.env.POS_TERMINAL_CODE || 'TRM-MAIN-01',
  };
});

// 2. Hardware: Printers
ipcMain.handle('hardware:get-printers', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    throw new Error('تم رفض الطلب: مرسل غير مصرح له');
  }
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err: any) {
    console.error('[Hardware] Error fetching printers:', sanitizeIpcError(err));
    return [];
  }
});

// 3. Hardware: Cash Drawer Kick
ipcMain.handle('hardware:open-drawer', async (event, printerNameOrIp?: string) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return { success: false, status: 'FAILED', simulated: false, error: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (!mainWindow) {
    return { success: false, status: 'FAILED', simulated: false, error: 'نافذة التطبيق غير متاحة' };
  }

  try {
    return await handleOpenCashDrawer(printerNameOrIp, {
      isDev: !!process.env.VITE_DEV_SERVER_URL,
      getPrintersAsync: () => mainWindow!.webContents.getPrintersAsync(),
    });
  } catch (err: any) {
    return { success: false, status: 'FAILED', simulated: false, error: sanitizeIpcError(err) };
  }
});

// 4. Hardware: Print Receipt
ipcMain.handle('hardware:print-receipt', async (event, invoiceData: any, printerNameOrIp?: string) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return { success: false, status: 'FAILED', simulated: false, error: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (!mainWindow) {
    return { success: false, status: 'FAILED', simulated: false, error: 'نافذة التطبيق غير متاحة' };
  }

  try {
    return await handlePrintReceipt(invoiceData, printerNameOrIp, {
      isDev: !!process.env.VITE_DEV_SERVER_URL,
      getPrintersAsync: () => mainWindow!.webContents.getPrintersAsync(),
      printFn: (options, callback) => mainWindow!.webContents.print(options, callback),
    });
  } catch (err: any) {
    return { success: false, status: 'FAILED', simulated: false, error: sanitizeIpcError(err) };
  }
});

// 5. Storage: Offline Transactions with Durability & Write Failure Protection
ipcMain.handle('storage:save-transaction', (event, transaction) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return { success: false, error: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  const validation = validateTransactionPayload(transaction);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'بيانات العملية غير صالحة' };
  }
  return saveTransaction(transaction);
});

ipcMain.handle('storage:get-pending', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return [];
  }
  return readPendingQueue().filter((t) => t.status === 'PENDING' || t.status === 'FAILED');
});

ipcMain.handle(
  'storage:update-status',
  (event, syncId: string, status: string, serverId?: any, errorMessage?: string) => {
    if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
      return false;
    }
    if (typeof syncId !== 'string' || typeof status !== 'string') {
      return false;
    }
    return updateQueueItemStatus(syncId, status, serverId, errorMessage);
  }
);

ipcMain.handle('storage:reset-retry', (event, syncId: string) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) return false;
  if (typeof syncId !== 'string' || syncId.length > 128) return false;
  return resetQueueItemRetry(syncId);
});

// 6. Central Configuration & Server URL Bridge
ipcMain.handle('config:get-server-url', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return 'http://localhost:3000/api/v1';
  }
  return syncWorker ? syncWorker.getServerUrl() : (process.env.POS_SERVER_URL || 'http://localhost:3000/api/v1');
});

ipcMain.handle('config:set-server-url', (event, url: string) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return { success: false, error: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (!syncWorker) {
    return { success: false, error: 'محرك المزامنة غير مهيأ' };
  }
  if (typeof url !== 'string') {
    return { success: false, error: 'عنوان الخادم غير صالح' };
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
ipcMain.handle('auth:set-session', (event, token: string | null, serverUrl?: string) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return { success: false, error: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (!syncWorker) {
    return { success: false, error: 'محرك المزامنة غير مهيأ' };
  }
  if (token !== null && typeof token !== 'string') {
    return { success: false, error: 'رمز الجلسة غير صالح' };
  }
  if (serverUrl) {
    if (typeof serverUrl !== 'string') {
      return { success: false, error: 'عنوان الخادم غير صالح' };
    }
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
ipcMain.handle('session:save', async (event, sessionData: any) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return { success: false, error: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (!secureSessionStore) {
    return { success: false, error: 'مخزن الجلسة المشفر غير مهيأ' };
  }
  const validation = validateSessionPayload(sessionData);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'حمولة الجلسة غير صالحة' };
  }
  try {
    return await secureSessionStore.saveSession(sessionData);
  } catch (err) {
    return { success: false, error: sanitizeIpcError(err) };
  }
});

ipcMain.handle('session:load', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return null;
  }
  if (!secureSessionStore) return null;
  try {
    return await secureSessionStore.loadSession();
  } catch (err) {
    console.error('[Session IPC] Failed to load session:', sanitizeIpcError(err));
    return null;
  }
});

ipcMain.handle('session:clear', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return false;
  }
  if (!secureSessionStore) return true;
  try {
    return await secureSessionStore.clearSession();
  } catch (err) {
    console.error('[Session IPC] Failed to clear session:', sanitizeIpcError(err));
    return false;
  }
});

ipcMain.handle('session:has', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return false;
  }
  if (!secureSessionStore) return false;
  try {
    return await secureSessionStore.hasSession();
  } catch {
    return false;
  }
});

ipcMain.handle('sync:trigger-now', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL)) {
    return { success: false, message: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (syncWorker) {
    return await syncWorker.runSyncCycle();
  }
  return { success: false, message: 'محرك المزامنة غير مهيأ' };
});

// ═══════════════════ LIFECYCLE ═══════════════════

app.whenReady().then(() => {
  createWindow();

  // تهيئة مخزن الجلسات المشفر عبر safeStorage
  secureSessionStore = new SecureSessionStore();

  // تهيئة وبدء محرك المزامنة الخلفي
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
