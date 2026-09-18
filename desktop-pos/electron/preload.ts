import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware
  printReceipt: (invoiceData: any, printerName?: string) =>
    ipcRenderer.invoke('hardware:print-receipt', invoiceData, printerName),
  openCashDrawer: (printerName?: string) =>
    ipcRenderer.invoke('hardware:open-drawer', printerName),
  getPrinters: () => ipcRenderer.invoke('hardware:get-printers'),

  // Offline / Storage Bridge
  saveOfflineTransaction: (data: any) => ipcRenderer.invoke('storage:save-transaction', data),
  getPendingTransactions: () => ipcRenderer.invoke('storage:get-pending'),
  updateTransactionStatus: (syncId: string, status: string, serverId?: any) =>
    ipcRenderer.invoke('storage:update-status', syncId, status, serverId),

  // Session, Config & Sync Bridge
  getServerUrl: () => ipcRenderer.invoke('config:get-server-url'),
  setServerUrl: (url: string) => ipcRenderer.invoke('config:set-server-url', url),
  setAuthToken: (token: string | null, serverUrl?: string) =>
    ipcRenderer.invoke('auth:set-session', token, serverUrl),
  triggerManualSync: () => ipcRenderer.invoke('sync:trigger-now'),

  // App & Device Info
  getDeviceInfo: () => ipcRenderer.invoke('app:get-device-info'),
  onBarcodeScan: (callback: (barcode: string) => void) => {
    ipcRenderer.on('barcode:scanned', (_event, barcode) => callback(barcode));
  },
  onSyncUpdated: (callback: (info: { synced: number; remaining: number }) => void) => {
    ipcRenderer.on('sync:updated', (_event, info) => callback(info));
  },
});
