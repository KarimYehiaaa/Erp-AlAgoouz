import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import axios from 'axios';
import { ADMIN_ROLES } from '../../shared/permissions.js';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { PosSyncWorker } from './sync/syncWorker';
import { handleOpenCashDrawer, handlePrintReceipt } from './hardware/hardwareService';
import { validateServerUrl } from '../src/services/serverUrlPolicy';
import { SecureSessionStore } from './security/secureSessionStore';
import { hasTrustedUpdatePublisher } from './security/updatePolicy';
import { isAllowedExternalUrl } from './security/rendererSecurityPolicy';
import { readFileSync } from 'node:fs';
import {
  validateIpcSender,
  isTrustedAppEntryUrl,
  validateSessionPayload,
  validateTransactionPayload,
  sanitizeIpcError,
} from './security/ipcSecurity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appEntryPath = path.join(__dirname, '../dist/index.html');

// An unpackaged smoke test must never load the cashier's real vault or queue.
const smokeTest =
  !app.isPackaged && process.env.NODE_ENV === 'test' && process.env.POS_SMOKE_TEST === '1';
if (smokeTest) {
  if (!process.env.POS_SMOKE_USER_DATA) throw new Error('Smoke test requires an isolated profile');
  app.setPath('userData', path.resolve(process.env.POS_SMOKE_USER_DATA));
}

let mainWindow: BrowserWindow | null = null;
let syncWorker: PosSyncWorker | null = null;
let secureSessionStore: SecureSessionStore | null = null;
let updateCheckTimer: NodeJS.Timeout | null = null;
let autoUpdatesEnabled = false;
let latestUpdateStatus: {
  state: string;
  version?: string;
  message?: string;
  percent?: number;
} = { state: 'idle' };

function publishUpdateStatus(status: {
  state: string;
  version?: string;
  message?: string;
  percent?: number;
}) {
  latestUpdateStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status);
  }
}

async function checkForUpdates() {
  if (!autoUpdatesEnabled) {
    publishUpdateStatus({
      state: 'error',
      message: 'التحديث التلقائي متوقف لأن هذا الإصدار لا يحمل توقيع ناشر موثوقًا.',
    });
    return;
  }

  try {
    publishUpdateStatus({ state: 'checking' });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = sanitizeIpcError(error);
    publishUpdateStatus({ state: 'error', message });
    console.warn('[Updater] Update check failed:', message);
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;

  const updateMetadataPath = path.join(process.resourcesPath, 'app-update.yml');
  let updateMetadata = '';
  try {
    updateMetadata = readFileSync(updateMetadataPath, 'utf8');
  } catch {
    // A missing updater manifest is equivalent to an unsigned/untrusted build.
  }
  if (!hasTrustedUpdatePublisher(updateMetadata)) {
    publishUpdateStatus({
      state: 'error',
      message: 'التحديث التلقائي متوقف لأن هذا الإصدار لا يحمل توقيع ناشر موثوقًا.',
    });
    console.warn('[Updater] Disabled: signed publisher metadata is missing');
    return;
  }

  autoUpdatesEnabled = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates');
    publishUpdateStatus({ state: 'checking' });
  });
  autoUpdater.on('update-not-available', () => {
    publishUpdateStatus({ state: 'current', message: 'أنت تعمل بأحدث إصدار رسمي بالفعل' });
  });
  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] Update available: ${info.version}`);
    publishUpdateStatus({ state: 'available', version: info.version });
  });
  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`[Updater] Download progress: ${Math.round(progressObj.percent)}%`);
    publishUpdateStatus({
      state: 'downloading',
      percent: Math.round(progressObj.percent),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[Updater] Update downloaded: ${info.version}; it will install on next restart`);
    publishUpdateStatus({ state: 'downloaded', version: info.version });
  });
  autoUpdater.on('error', (error) => {
    const message = sanitizeIpcError(error);
    publishUpdateStatus({ state: 'error', message });
    console.warn('[Updater] Update check failed:', message);
  });

  // First check shortly after startup, then retry periodically so a temporary
  // network failure or a release still being published does not strand the POS.
  setTimeout(() => void checkForUpdates(), 10_000);
  updateCheckTimer = setInterval(() => void checkForUpdates(), 30 * 60 * 1000);
}

import {
  readPendingQueue,
  saveTransaction,
  updateQueueItemStatus,
  resetQueueItemRetry,
  exportQueueRecoveryFiles,
} from './storage/queueStorage';

function createWindow() {
  mainWindow = new BrowserWindow({
    show: !smokeTest,
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'بن العجوز ERP — نقطة بيع الكاشير (Desktop POS)',
    backgroundColor: '#1c1917',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  // 1. تأمين فتح النوافذ الجديدة (Window Open Policy)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
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
      } catch {
        /* Malformed navigation URLs are denied below. */
      }
    } else if (isTrustedAppEntryUrl(navigationUrl, appEntryPath)) {
      return;
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
    mainWindow.loadFile(appEntryPath);
  }

  // إخفاء القائمة الافتراضية لمنح مساحة كاملة لشاشة الكاشير
  mainWindow.setMenuBarVisibility(false);
}

// ═══════════════════ IPC HANDLERS ═══════════════════

// 1. Device Info
ipcMain.handle('app:get-device-info', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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

ipcMain.handle('app:get-update-status', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return { state: 'idle' };
  }
  return latestUpdateStatus;
});

ipcMain.handle('app:check-for-updates', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return { success: false, message: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (!app.isPackaged) {
    publishUpdateStatus({
      state: 'current',
      message:
        'أنت في بيئة التطوير (v' +
        app.getVersion() +
        ') — التحديث التلقائي المباشر يعمل في النسخة المثبتة.',
    });
    return { success: true, message: 'بيئة تطوير' };
  }
  await checkForUpdates();
  return { success: true };
});

ipcMain.handle('app:install-update', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return { success: false, message: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  if (!app.isPackaged || latestUpdateStatus.state !== 'downloaded') {
    return { success: false, message: 'لا يوجد تحديث جاهز للتثبيت' };
  }
  autoUpdater.quitAndInstall(false, true);
  return { success: true };
});

// 2. Hardware: Printers
ipcMain.handle('hardware:get-printers', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return {
      success: false,
      status: 'FAILED',
      simulated: false,
      error: 'تم رفض الطلب: مرسل غير مصرح له',
    };
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
ipcMain.handle(
  'hardware:print-receipt',
  async (event, invoiceData: any, printerNameOrIp?: string) => {
    if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
      return {
        success: false,
        status: 'FAILED',
        simulated: false,
        error: 'تم رفض الطلب: مرسل غير مصرح له',
      };
    }
    if (!mainWindow) {
      return {
        success: false,
        status: 'FAILED',
        simulated: false,
        error: 'نافذة التطبيق غير متاحة',
      };
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
  },
);

// 5. Storage: Offline Transactions with Durability & Write Failure Protection
ipcMain.handle('storage:save-transaction', (event, transaction) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return { success: false, error: 'تم رفض الطلب: مرسل غير مصرح له' };
  }
  const validation = validateTransactionPayload(transaction);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'بيانات العملية غير صالحة' };
  }
  const context = syncWorker?.getQueueContext();
  if (!context) {
    return { success: false, error: 'يلزم وجود جلسة كاشير لتحديد مالك الفاتورة المحلية' };
  }
  return saveTransaction({ ...transaction, ...context });
});

ipcMain.handle('storage:get-pending', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return [];
  }
  return readPendingQueue().filter(
    (t) => (t.status === 'PENDING' || t.status === 'FAILED') && syncWorker?.ownsQueueItem(t),
  );
});

ipcMain.handle('storage:get-retention-summary', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return { success: false };
  }
  const retained = readPendingQueue().filter((item) => item.status !== 'SYNCED');
  const unknown = retained.filter((item) => !item.origin_server || !item.origin_user_id);
  return {
    success: true,
    unknownCount: unknown.length,
    otherContextCount: retained.filter(
      (item) => item.origin_server && item.origin_user_id && !syncWorker?.ownsQueueItem(item),
    ).length,
  };
});

ipcMain.handle('storage:export-recovery', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return { success: false, error: 'مرسل غير مصرح له' };
  }
  const worker = syncWorker;
  const token = worker?.getAuthToken();
  const server = worker?.getServerUrl();
  const context = worker?.getQueueContext();
  if (!worker || !token || !server || !context)
    return { success: false, error: 'يلزم تسجيل دخول مسؤول لتصدير ملفات الاسترجاع' };
  const sessionUnchanged = () =>
    worker === syncWorker && token === worker.getAuthToken() && server === worker.getServerUrl();
  try {
    // Verify the current role with the server; renderer data and decoded JWT claims are not authorization.
    const verifyAdmin = async () => {
      const profile = await axios.get(`${server.replace(/\/$/, '')}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
        maxRedirects: 0,
        maxContentLength: 256 * 1024,
        proxy: false,
      });
      const user = profile.data?.data?.user;
      return (
        sessionUnchanged() &&
        profile.data?.success === true &&
        Number(user?.id) === context.origin_user_id &&
        ADMIN_ROLES.includes(user?.role_name)
      );
    };
    if (!(await verifyAdmin())) {
      return {
        success: false,
        error: 'تصدير ملفات الاسترجاع يتطلب جلسة مسؤول مؤكدة على السيرفر الحالي',
      };
    }
    const chosen = await dialog.showOpenDialog({
      title: 'حفظ نسخة ملفات الاسترجاع — قد تحتوي بيانات حسابات أخرى',
      buttonLabel: 'حفظ نسخة هنا',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (chosen.canceled || !chosen.filePaths[0]) return { success: false, canceled: true };
    if (!sessionUnchanged())
      return { success: false, error: 'تغير الحساب أو السيرفر؛ أعد طلب التصدير' };
    if (!(await verifyAdmin()))
      return { success: false, error: 'تعذر تأكيد صلاحية المسؤول؛ أعد تسجيل الدخول' };
    return { success: true, ...exportQueueRecoveryFiles(chosen.filePaths[0]) };
  } catch {
    return {
      success: false,
      error:
        'تعذر تصدير نسخة الاسترجاع. تأكد من اتصال المسؤول بالسيرفر وصلاحية مجلد الحفظ؛ الملفات الأصلية محفوظة.',
    };
  }
});

ipcMain.handle(
  'storage:update-status',
  (event, syncId: string, status: string, serverId?: any, errorMessage?: string) => {
    if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
      return false;
    }
    if (typeof syncId !== 'string' || typeof status !== 'string') {
      return false;
    }
    const item = readPendingQueue().find((t) => t.sync_id === syncId);
    if (!item || !syncWorker?.ownsQueueItem(item)) return false;
    return updateQueueItemStatus(syncId, status, serverId, errorMessage);
  },
);

ipcMain.handle('storage:reset-retry', (event, syncId: string) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath))
    return false;
  if (typeof syncId !== 'string' || syncId.length > 128) return false;
  const item = readPendingQueue().find((t) => t.sync_id === syncId);
  if (!item || !syncWorker?.ownsQueueItem(item)) return false;
  return resetQueueItemRetry(syncId);
});

// 6. Central Configuration & Server URL Bridge
ipcMain.handle('config:get-server-url', (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return 'http://localhost:3000/api/v1';
  }
  return syncWorker
    ? syncWorker.getServerUrl()
    : process.env.POS_SERVER_URL || 'http://localhost:3000/api/v1';
});

ipcMain.handle('config:set-server-url', (event, url: string) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
    return false;
  }
  syncWorker?.setAuthToken(null);
  if (!secureSessionStore) return true;
  try {
    return await secureSessionStore.clearSession();
  } catch (err) {
    console.error('[Session IPC] Failed to clear session:', sanitizeIpcError(err));
    return false;
  }
});

ipcMain.handle('session:has', async (event) => {
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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
  if (!validateIpcSender(event, app.isPackaged, process.env.VITE_DEV_SERVER_URL, appEntryPath)) {
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
    app.isPackaged,
  );
  syncWorker.start(15000);
  configureAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
