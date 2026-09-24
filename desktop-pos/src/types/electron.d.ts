export type HardwareStatus = 'SUCCESS' | 'SIMULATED' | 'FAILED' | 'NOT_SUPPORTED';

export interface HardwareResult {
  success: boolean;
  status: HardwareStatus;
  simulated?: boolean;
  method?: string;
  target?: string;
  printer?: string;
  message?: string;
  error?: string;
}

export interface OfflineSaleItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  custom_notes?: string;
}

export interface OfflineSaleTransaction {
  sync_id: string;
  invoice_number: string;
  warehouse_id: number;
  pos_shift_id?: number;
  customer_id?: number | null;
  items: OfflineSaleItem[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retry_count: number;
  last_error?: string;
  server_id?: number | string;
  created_at: string;
  updated_at?: string;
}

export interface SyncCycleResult {
  success: boolean;
  synced: number;
  remaining: number;
  message?: string;
}

export interface PrinterDevice {
  name: string;
  isDefault: boolean;
  status: number;
}

export interface DeviceInfo {
  hostname: string;
  platform: string;
  arch: string;
  appVersion: string;
  terminalCode: string;
}

export interface ServerUrlResult {
  success: boolean;
  error?: string;
}

export interface SessionResult {
  success: boolean;
  error?: string;
}

export interface PosSessionData {
  token: string;
  refreshToken?: string;
  user: any;
  terminal?: any;
  savedAt?: string;
}

export interface ElectronAPI {
  printReceipt: (invoiceData: any, printerName?: string) => Promise<HardwareResult>;
  openCashDrawer: (printerName?: string) => Promise<HardwareResult>;
  getPrinters: () => Promise<PrinterDevice[]>;
  saveOfflineTransaction: (
    data: Partial<OfflineSaleTransaction>
  ) => Promise<{ success: boolean; transaction?: OfflineSaleTransaction; error?: string; message?: string }>;
  getPendingTransactions: () => Promise<OfflineSaleTransaction[]>;
  updateTransactionStatus: (syncId: string, status: string, serverId?: any, errorMessage?: string) => Promise<boolean>;
  resetTransactionRetry: (syncId: string) => Promise<boolean>;
  getServerUrl: () => Promise<string>;
  setServerUrl: (url: string) => Promise<ServerUrlResult>;
  setAuthToken: (token: string | null, serverUrl?: string) => Promise<SessionResult>;
  triggerManualSync: () => Promise<SyncCycleResult>;
  saveSecureSession?: (sessionData: PosSessionData) => Promise<{ success: boolean; error?: string }>;
  loadSecureSession?: () => Promise<PosSessionData | null>;
  clearSecureSession?: () => Promise<boolean>;
  hasSecureSession?: () => Promise<boolean>;
  getDeviceInfo: () => Promise<DeviceInfo>;
  getUpdateStatus?: () => Promise<{ state: string; version?: string; message?: string }>;
  checkForUpdates?: () => Promise<{ success: boolean; message?: string }>;
  installUpdate?: () => Promise<{ success: boolean; message?: string }>;
  onUpdateStatus?: (callback: (status: { state: string; version?: string; message?: string }) => void) => void;
  onBarcodeScan: (callback: (barcode: string) => void) => void;
  onSyncUpdated: (callback: (info: { synced: number; remaining: number }) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
