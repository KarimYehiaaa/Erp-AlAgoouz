import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware
  printReceipt: (invoiceData: any) => ipcRenderer.invoke('hardware:print-receipt', invoiceData),
  openCashDrawer: () => ipcRenderer.invoke('hardware:open-drawer'),
  getPrinters: () => ipcRenderer.invoke('hardware:get-printers'),

  // Offline / Storage Bridge
  saveOfflineTransaction: (data: any) => ipcRenderer.invoke('storage:save-transaction', data),
  getPendingTransactions: () => ipcRenderer.invoke('storage:get-pending'),
  updateTransactionStatus: (syncId: string, status: string, serverId?: any) =>
    ipcRenderer.invoke('storage:update-status', syncId, status, serverId),

  // App & Device Info
  getDeviceInfo: () => ipcRenderer.invoke('app:get-device-info'),
  onBarcodeScan: (callback: (barcode: string) => void) => {
    ipcRenderer.on('barcode:scanned', (_event, barcode) => callback(barcode));
  },
});
