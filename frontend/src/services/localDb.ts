import { getApiCacheScope } from '../api/client';

const DB_NAME = 'BinAlAgoouzOfflineDB';
const DB_VERSION = 4;

let dbInstance: IDBDatabase | null = null;

/**
 * فتح قاعدة البيانات المحلية (IndexedDB) مع دعم الترقية التلقائية.
 * @returns {Promise<IDBDatabase>} مثيل قاعدة البيانات
 */
const getDb = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve: any, reject: any) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion as number;
      if (!db.objectStoreNames.contains('scoped_catalog')) {
        db.createObjectStore('scoped_catalog', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_sales')) {
        const salesStore = db.createObjectStore('offline_sales', { keyPath: 'offline_id' });
        salesStore.createIndex('status', 'sync_status', { unique: false });
      }

      if (oldVersion < 3 && db.objectStoreNames.contains('offline_sales')) {
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const cursorRequest = transaction.objectStore('offline_sales').openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const sale = cursor.value as LocalOfflineSale;
          if (sale.sale_type === 'branch') {
            cursor.update({ ...sale, sale_type: 'retail' });
          }
          cursor.continue();
        };
      }
    };

    request.onsuccess = (event: any) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      const opened = dbInstance!;
      opened.onversionchange = () => {
        opened.close();
        if (dbInstance === opened) dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event: any) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

/** سجل المنتج في قاعدة البيانات المحلية. */
export type LocalProduct = Record<string, any> & { id: number | string };

/** سجل العميل في قاعدة البيانات المحلية. */
export type LocalCustomer = Record<string, any> & { id: number | string };

const saveCatalog = async (kind: 'products' | 'customers', rows: Record<string, any>[]) => {
  const scope = getApiCacheScope();
  if (scope.endsWith('::anonymous')) throw new Error('يلزم حساب مسجل لحفظ البيانات المحلية');
  const db = await getDb();
  if (scope !== getApiCacheScope()) throw new Error('تغير الحساب أو السيرفر أثناء حفظ البيانات');
  const snapshot = JSON.parse(JSON.stringify(rows.filter((row) => row && row.id)));
  return new Promise<boolean>((resolve, reject) => {
    const transaction = db.transaction('scoped_catalog', 'readwrite');
    transaction.objectStore('scoped_catalog').put({ key: `${scope}::${kind}`, rows: snapshot });
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
};

const getCatalog = async (kind: 'products' | 'customers'): Promise<Record<string, any>[]> => {
  const scope = getApiCacheScope();
  if (scope.endsWith('::anonymous')) return [];
  const db = await getDb();
  if (scope !== getApiCacheScope()) return [];
  return new Promise((resolve, reject) => {
    const request = db
      .transaction('scoped_catalog', 'readonly')
      .objectStore('scoped_catalog')
      .get(`${scope}::${kind}`);
    request.onsuccess = () =>
      resolve(scope === getApiCacheScope() ? request.result?.rows || [] : []);
    request.onerror = () => reject(request.error);
  });
};

/** سجل المبيعة غير المتصلة بالإنترنت. */
export type LocalOfflineSale = Record<string, any> & {
  offline_id: string;
  sync_id?: string;
  sale_number: string;
  created_at: string;
  sync_status?: 'PENDING' | 'SYNCING' | 'FAILED' | 'QUARANTINED';
  retry_count?: number;
  last_error?: string;
};

/**
 * قاعدة بيانات محلية (IndexedDB) للعمل دون اتصال: منتجات وعملاء ومبيعات معلّقة.
 * تُستخدم لمزامنة البيانات عند عودة الاتصال.
 */
export const localDb = {
  /** مسح وحفظ قائمة المنتجات محليًا. */
  saveProducts: async (products: LocalProduct[]): Promise<boolean> => {
    return saveCatalog('products', products);
  },

  /** جلب قائمة المنتجات المحفوظة محليًا. */
  getProducts: async (): Promise<LocalProduct[]> => {
    return getCatalog('products') as Promise<LocalProduct[]>;
  },

  /** مسح وحفظ قائمة العملاء محليًا. */
  saveCustomers: async (customers: LocalCustomer[]): Promise<boolean> => {
    return saveCatalog('customers', customers);
  },

  /** جلب قائمة العملاء المحفوظين محليًا. */
  getCustomers: async (): Promise<LocalCustomer[]> => {
    return getCatalog('customers') as Promise<LocalCustomer[]>;
  },

  /** حفظ مبيعة غير متصلة بالإنترنت مع معرّف محلي ورقم مؤقت. */
  saveOfflineSale: async (sale: Record<string, any>): Promise<LocalOfflineSale> => {
    const originContext = getApiCacheScope();
    if (originContext.endsWith('::anonymous')) throw new Error('يلزم حساب مسجل لحفظ فاتورة معلقة');
    const db = await getDb();
    if (originContext !== getApiCacheScope())
      throw new Error('تغير الحساب أو السيرفر أثناء حفظ الفاتورة');
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');

      const offline_id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      const record: LocalOfflineSale = {
        ...sale,
        origin_context: originContext,
        offline_id,
        // الحفاظ على نفس sync_id من المحاولة الأولى (online) حتى يتعرف عليه الخادم عند المزامنة
        sync_id: sale.sync_id || offline_id,
        sale_number: sale.sale_number || 'PENDING-' + Date.now().toString().slice(-6),
        created_at: sale.created_at || new Date().toISOString(),
        sync_status: 'PENDING',
        retry_count: 0,
      };

      const request = store.put(record);

      transaction.oncomplete = () => resolve(record);
      transaction.onabort = () =>
        reject(transaction.error || new Error('تعذر حفظ الفاتورة المحلية'));
      request.onerror = () => reject(request.error);
    });
  },

  /** تحديث حالة مبيعة معلقة. */
  updateOfflineSale: async (
    offline_id: string,
    updates: Partial<LocalOfflineSale>,
  ): Promise<boolean> => {
    const scope = getApiCacheScope();
    const db = await getDb();
    if (scope !== getApiCacheScope() || scope.endsWith('::anonymous')) return false;
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');
      const getReq = store.get(offline_id);

      getReq.onsuccess = () => {
        if (!getReq.result) return resolve(false);
        if (scope !== getApiCacheScope() || getReq.result.origin_context !== scope)
          return resolve(false);
        const updated = {
          ...getReq.result,
          ...updates,
          offline_id: getReq.result.offline_id,
          origin_context: getReq.result.origin_context,
        };
        const putReq = store.put(updated);
        transaction.oncomplete = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error('تعذر تحديث الفاتورة المحلية'));
    });
  },

  /** جلب قائمة المبيعات المعلقة محليًا. */
  getOfflineSales: async (): Promise<LocalOfflineSale[]> => {
    const scope = getApiCacheScope();
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readonly');
      const store = transaction.objectStore('offline_sales');
      const request = store.getAll();

      request.onsuccess = () =>
        resolve(
          scope === getApiCacheScope() && !scope.endsWith('::anonymous')
            ? (request.result || []).filter(
                (sale: LocalOfflineSale) => sale.origin_context === scope,
              )
            : [],
        );
      request.onerror = () => reject(request.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error('تعذر قراءة الفواتير المحلية'));
    });
  },

  /** حذف مبيعة معلقة حسب معرّفها المحلي. */
  deleteOfflineSale: async (offline_id: string): Promise<boolean> => {
    const scope = getApiCacheScope();
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');
      const request = store.get(offline_id);
      request.onsuccess = () => {
        if (
          scope !== getApiCacheScope() ||
          scope.endsWith('::anonymous') ||
          request.result?.origin_context !== scope
        )
          return resolve(false);
        const removal = store.delete(offline_id);
        removal.onerror = () => reject(removal.error);
        transaction.oncomplete = () => resolve(true);
      };
      request.onerror = () => reject(request.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error('تعذر حذف الفاتورة المحلية'));
    });
  },

  /** مسح المبيعات المعلقة التابعة للسياق الحالي فقط. */
  clearOfflineSales: async (): Promise<boolean> => {
    const scope = getApiCacheScope();
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (scope !== getApiCacheScope()) {
          transaction.abort();
          return;
        }
        if (!scope.endsWith('::anonymous') && cursor.value.origin_context === scope)
          cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onabort = () => reject(transaction.error || new Error('تغير سياق الجلسة'));
      request.onerror = () => reject(request.error);
    });
  },
};
