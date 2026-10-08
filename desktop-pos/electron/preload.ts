import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware
  printReceipt: (invoiceData: any, printerName?: string) =>
    ipcRenderer.invoke('hardware:print-receipt', invoiceData, printerName),
  openCashDrawer: (printerName?: string) => ipcRenderer.invoke('hardware:open-drawer', printerName),
  getPrinters: () => ipcRenderer.invoke('hardware:get-printers'),

  // Offline / Storage Bridge
  saveOfflineTransaction: (data: any) => ipcRenderer.invoke('storage:save-transaction', data),
  getPendingTransactions: () => ipcRenderer.invoke('storage:get-pending'),
  getQueueRetentionSummary: () => ipcRenderer.invoke('storage:get-retention-summary'),
  exportQueueRecovery: () => ipcRenderer.invoke('storage:export-recovery'),
  updateTransactionStatus: (
    syncId: string,
    status: string,
    serverId?: any,
    errorMessage?: string,
  ) => ipcRenderer.invoke('storage:update-status', syncId, status, serverId, errorMessage),
  resetTransactionRetry: (syncId: string) => ipcRenderer.invoke('storage:reset-retry', syncId),

  // Session, Config & Sync Bridge
  getServerUrl: () => ipcRenderer.invoke('config:get-server-url'),
  setServerUrl: (url: string) => ipcRenderer.invoke('config:set-server-url', url),
  setAuthToken: (token: string | null, serverUrl?: string) =>
    ipcRenderer.invoke('auth:set-session', token, serverUrl),
  triggerManualSync: () => ipcRenderer.invoke('sync:trigger-now'),

  // Secure OS Session Storage (safeStorage)
  saveSecureSession: (sessionData: any) => ipcRenderer.invoke('session:save', sessionData),
  loadSecureSession: () => ipcRenderer.invoke('session:load'),
  clearSecureSession: () => ipcRenderer.invoke('session:clear'),
  hasSecureSession: () => ipcRenderer.invoke('session:has'),

  // App & Device Info
  getDeviceInfo: () => ipcRenderer.invoke('app:get-device-info'),
  getUpdateStatus: () =>
    ipcRenderer.invoke('app:get-update-status') as Promise<{
      state: string;
      version?: string;
      message?: string;
      percent?: number;
    }>,
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (
    callback: (status: {
      state: string;
      version?: string;
      message?: string;
      percent?: number;
    }) => void,
  ) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) =>
      callback(
        status as {
          state: string;
          version?: string;
          message?: string;
          percent?: number;
        },
      );
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.removeListener('updater:status', listener);
  },
  onBarcodeScan: (callback: (barcode: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, barcode: unknown) =>
      callback(barcode as string);
    ipcRenderer.on('barcode:scanned', listener);
    return () => ipcRenderer.removeListener('barcode:scanned', listener);
  },
  onSyncUpdated: (callback: (info: { synced: number; remaining: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: unknown) =>
      callback(info as { synced: number; remaining: number });
    ipcRenderer.on('sync:updated', listener);
    return () => ipcRenderer.removeListener('sync:updated', listener);
  },
});
