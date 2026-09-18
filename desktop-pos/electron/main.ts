import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'url';
import { PosSyncWorker } from './sync/syncWorker';
import { PosPrinterDriver } from './hardware/printer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let syncWorker: PosSyncWorker | null = null;

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

  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  // 1. Network IP Receipt Printer via raw TCP 9100 ESC/POS
  const isIpAddress = printerNameOrIp && /^(\d{1,3}\.){3}\d{1,3}$/.test(printerNameOrIp);
  if (isIpAddress) {
    try {
      const pulseBuffer = PosPrinterDriver.getDrawerKickCommand();
      const networkSent = await PosPrinterDriver.printNetworkRaw(printerNameOrIp, 9100, pulseBuffer);
      if (networkSent) {
        return {
          success: true,
          status: 'SUCCESS',
          simulated: false,
          method: 'network_raw',
          target: printerNameOrIp,
          message: 'تم إرسال نبضة فتح درج النقدية بنجاح عبر طابعة الشبكة',
        };
      } else {
        return {
          success: false,
          status: 'FAILED',
          simulated: false,
          error: `تعذر إرسال أمر فتح الدرج لطابعة الشبكة (${printerNameOrIp}) على منفذ 9100`,
        };
      }
    } catch (err: any) {
      return { success: false, status: 'FAILED', simulated: false, error: err.message };
    }
  }

  // 2. Windows Driver / Local USB Printer
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();

    if (printers.length === 0) {
      if (isDev) {
        return {
          success: true,
          status: 'SIMULATED',
          simulated: true,
          message: 'تمت محاكاة فتح الدرج (وضع التطوير بدون طابعات)',
        };
      }
      return {
        success: false,
        status: 'FAILED',
        simulated: false,
        error: 'لا توجد طابعة متصلة لإرسال نبضة فتح الدرج',
      };
    }

    const selectedPrinter = printerNameOrIp
      ? printers.find((p) => p.name === printerNameOrIp) || printers[0]
      : printers.find((p) => p.isDefault) || printers[0];

    if (isDev) {
      return {
        success: true,
        status: 'SIMULATED',
        simulated: true,
        printer: selectedPrinter.name,
        message: `تمت محاكاة إرسال نبضة فتح الدرج للطابعة: ${selectedPrinter.name}`,
      };
    }

    // In Production: Windows Spooler cannot send raw binary ESC/POS pulses to generic printers without raw pass-through driver.
    // We strictly return NOT_SUPPORTED rather than fake success!
    return {
      success: false,
      status: 'NOT_SUPPORTED',
      simulated: false,
      method: 'windows_driver',
      printer: selectedPrinter.name,
      error: `فتح درج النقدية المباشر عبر Windows Spooler للطابعة (${selectedPrinter.name}) غير مدعوم مباشرة؛ يرجى استخدام طابعة شبكية (IP 9100) أو ضبط درايفر الطابعة للفتح التلقائي عند الطباعة (Cash Drawer via Driver Settings).`,
    };
  } catch (err: any) {
    return { success: false, status: 'FAILED', simulated: false, error: err.message };
  }
});

// 4. Hardware: Print Receipt
ipcMain.handle('hardware:print-receipt', async (_event, invoiceData: any, printerNameOrIp?: string) => {
  if (!mainWindow) {
    return { success: false, status: 'FAILED', simulated: false, error: 'نافذة التطبيق غير متاحة' };
  }

  const isDev = !!process.env.VITE_DEV_SERVER_URL;

  // 1. Network IP receipt printer support
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
        return {
          success: true,
          status: 'SUCCESS',
          simulated: false,
          method: 'network_raw',
          target: printerNameOrIp,
          message: 'تمت الطباعة الحرارية عبر طابعة الشبكة بنجاح',
        };
      } else {
        return {
          success: false,
          status: 'FAILED',
          simulated: false,
          error: `فشلت الطباعة عبر طابعة الشبكة (${printerNameOrIp})`,
        };
      }
    } catch (err: any) {
      return { success: false, status: 'FAILED', simulated: false, error: err.message };
    }
  }

  // 2. Windows Spooler / WebContents print
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();

    if (printers.length === 0) {
      if (isDev) {
        console.log('[Hardware Receipt Simulation]:\n', PosPrinterDriver.generateTextReceipt(invoiceData));
        return {
          success: true,
          status: 'SIMULATED',
          simulated: true,
          message: 'تمت محاكاة طباعة الإيصال بنجاح (وضع التطوير)',
        };
      }
      return { success: false, status: 'FAILED', simulated: false, error: 'لا توجد طابعة متصلة بالنظام' };
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
            resolve({
              success: true,
              status: 'SUCCESS',
              simulated: false,
              method: 'windows_spooler',
              printer: selectedPrinter.name,
            });
          } else {
            resolve({
              success: false,
              status: 'FAILED',
              simulated: false,
              error: failureReason || 'فشلت عملية الطباعة عبر Windows Spooler',
            });
          }
        }
      );
    });
  } catch (err: any) {
    return { success: false, status: 'FAILED', simulated: false, error: err.message };
  }
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
  const ok = syncWorker.setServerUrl(url, app.isPackaged);
  if (!ok) {
    return {
      success: false,
      error: 'عنوان الخادم غير صالح أو غير مسموح به في بيئة الإنتاج (يجب استخدام HTTPS)',
    };
  }
  return { success: true };
});

// 7. Session & Background Sync Bridge
ipcMain.handle('auth:set-session', (_event, token: string | null, serverUrl?: string) => {
  if (syncWorker) {
    syncWorker.setAuthToken(token);
    if (serverUrl) {
      syncWorker.setServerUrl(serverUrl, app.isPackaged);
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
    updateQueueItemStatus,
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
