import { getServerUrl } from './serverUrlPolicy';
import { sessionService } from './sessionService';

export const getBrowserQueueContext = (): string => {
  const userId = Number(sessionService.getUser()?.id);
  return `${getServerUrl()}::${Number.isInteger(userId) && userId > 0 ? userId : 'anonymous'}`;
};

const queueKey = (context: string) => `pos_offline_sales:${encodeURIComponent(context)}`;

export const getBrowserQueueRetentionSummary = (
  storage: Storage = localStorage,
  context = getBrowserQueueContext(),
) => {
  const currentKey = queueKey(context);
  let unknownCount = 0;
  let otherContextCount = 0;
  let unreadable = false;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (
      !key ||
      (key !== 'pos_offline_sales' && !key.startsWith('pos_offline_sales:')) ||
      key === currentKey
    )
      continue;
    try {
      const rows = JSON.parse(storage.getItem(key) || '[]');
      if (!Array.isArray(rows)) {
        unreadable = true;
        continue;
      }
      const retainedCount = rows.filter((row: any) => row?.status !== 'SYNCED').length;
      if (key === 'pos_offline_sales') unknownCount += retainedCount;
      else otherContextCount += retainedCount;
    } catch {
      unreadable = true;
    }
  }
  return { success: !unreadable, unknownCount, otherContextCount };
};

/** Capture raw queue values without assigning owners or changing localStorage. */
export const getBrowserQueueRecoverySnapshot = (storage: Storage = localStorage) => {
  const queues: Array<{ key: string; raw: string; recordCount: number | null }> = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key || (key !== 'pos_offline_sales' && !key.startsWith('pos_offline_sales:'))) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    let recordCount: number | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) recordCount = parsed.length;
    } catch {
      // Keep unreadable bytes in the recovery file so a later review can recover them.
    }
    queues.push({ key, raw, recordCount });
  }
  if (!queues.length) throw new Error('لا توجد طوابير فواتير محلية للتصدير');
  return {
    format: 'alagoouz-pos-queue-recovery',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    note: 'Contains raw local POS queues which may include customer and financial data. No records were reassigned, synchronized, or removed.',
    queues,
  };
};

export const readBrowserQueue = (context = getBrowserQueueContext()): any[] => {
  if (context.endsWith('::anonymous') || context !== getBrowserQueueContext()) return [];
  const raw = localStorage.getItem(queueKey(context));
  if (!raw) return [];
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows))
    throw new Error('تعذر قراءة طابور الفواتير المحلية؛ البيانات محفوظة للمراجعة');
  return rows;
};

export const writeBrowserQueue = (rows: any[], context = getBrowserQueueContext()) => {
  if (context.endsWith('::anonymous') || context !== getBrowserQueueContext()) {
    throw new Error('تغير الحساب أو السيرفر أثناء حفظ الطابور');
  }
  localStorage.setItem(queueKey(context), JSON.stringify(rows));
};

export const saveBrowserSale = (sale: any) => {
  const context = getBrowserQueueContext();
  const rows = readBrowserQueue(context);
  const syncId =
    sale.sync_id ||
    (typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
          const value = Math.floor(Math.random() * 16);
          return (character === 'x' ? value : (value & 3) | 8).toString(16);
        }));
  const existing = rows.find((row) => row.sync_id === syncId);
  if (existing) return existing;
  const record = {
    ...sale,
    sale_type: sale.sale_type === 'branch' ? 'retail' : sale.sale_type,
    sync_id: syncId,
    status: 'PENDING',
    retry_count: 0,
    created_at: sale.created_at || new Date().toISOString(),
  };
  rows.push(record);
  writeBrowserQueue(rows, context);
  return record;
};
