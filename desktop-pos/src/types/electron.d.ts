export interface ElectronAPI {
  printReceipt: (
    invoiceData: any,
    printerName?: string
  ) => Promise<{ success: boolean; simulated?: boolean; printer?: string; error?: string }>;
  openCashDrawer: (
    printerName?: string
  ) => Promise<{ success: boolean; simulated?: boolean; printer?: string; message?: string; error?: string }>;
  getPrinters: () => Promise<Array<{ name: string; isDefault: boolean; status: number }>>;
  saveOfflineTransaction: (
    data: any
  ) => Promise<{ success: boolean; transaction?: any; error?: string; message?: string }>;
  getPendingTransactions: () => Promise<any[]>;
  updateTransactionStatus: (syncId: string, status: string, serverId?: any) => Promise<boolean>;
  getServerUrl: () => Promise<string>;
  setServerUrl: (url: string) => Promise<boolean>;
  setAuthToken: (token: string | null, serverUrl?: string) => Promise<boolean>;
  triggerManualSync: () => Promise<{ success: boolean; synced: number; remaining: number }>;
  getDeviceInfo: () => Promise<{ hostname: string; platform: string; arch: string; appVersion: string; terminalCode: string }>;
  onBarcodeScan: (callback: (barcode: string) => void) => void;
  onSyncUpdated: (callback: (info: { synced: number; remaining: number }) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
