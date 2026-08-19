const DB_NAME = 'BinAlAgoouzOfflineDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

/**
 * فتح قاعدة البيانات المحلية (IndexedDB) مرة واحدة وإعادة استخدامها.
 * @returns {Promise<IDBDatabase>} مثيل قاعدة البيانات
 */
const getDb = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve: any, reject: any) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_sales')) {
        db.createObjectStore('offline_sales', { keyPath: 'offline_id' });
      }
    };

    request.onsuccess = (event: any) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event: any) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

/** سجل المنتج في قاعدة البيانات المحلية. */
type LocalProduct = Record<string, any> & { id: number | string };

/** سجل العميل في قاعدة البيانات المحلية. */
type LocalCustomer = Record<string, any> & { id: number | string };

/** سجل المبيعة غير المتصلة بالإنترنت. */
type LocalOfflineSale = Record<string, any> & {
  offline_id: string;
  sale_number: string;
  created_at: string;
};

/**
 * قاعدة بيانات محلية (IndexedDB) للعمل دون اتصال: منتجات وعملاء ومبيعات معلّقة.\n * تُستخدم لمزامنة البيانات عند عودة الاتصال.
 */
export const localDb = {
  /** مسح وحفظ قائمة المنتجات محليًا. */
  saveProducts: async (products: LocalProduct[]): Promise<boolean> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('products', 'readwrite');
      const store = transaction.objectStore('products');

      store.clear();
      products.forEach((p: any) => {
        if (p && p.id) {
          store.put(p);
        }
      });

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  /** جلب قائمة المنتجات المحفوظة محليًا. */
  getProducts: async (): Promise<LocalProduct[]> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('products', 'readonly');
      const store = transaction.objectStore('products');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  /** مسح وحفظ قائمة العملاء محليًا. */
  saveCustomers: async (customers: LocalCustomer[]): Promise<boolean> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('customers', 'readwrite');
      const store = transaction.objectStore('customers');

      store.clear();
      customers.forEach((c: any) => {
        if (c && c.id) {
          store.put(c);
        }
      });

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  /** جلب قائمة العملاء المحفوظين محليًا. */
  getCustomers: async (): Promise<LocalCustomer[]> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('customers', 'readonly');
      const store = transaction.objectStore('customers');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  /** حفظ مبيعة غير متصلة بالإنترنت مع معرّف محلي ورقم مؤقت. */
  saveOfflineSale: async (sale: Record<string, any>): Promise<LocalOfflineSale> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');

      const offline_id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'off_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const record: LocalOfflineSale = {
        ...sale,
        offline_id,
        sale_number: 'PENDING-' + Date.now().toString().slice(-6),
        created_at: new Date().toISOString(),
      };

      const request = store.put(record);

      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  },

  /** جلب قائمة المبيعات المعلقة محليًا. */
  getOfflineSales: async (): Promise<LocalOfflineSale[]> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readonly');
      const store = transaction.objectStore('offline_sales');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  /** حذف مبيعة معلقة حسب معرّفها المحلي. */
  deleteOfflineSale: async (offline_id: string): Promise<boolean> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');
      const request = store.delete(offline_id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  /** مسح كل المبيعات المعلقة. */
  clearOfflineSales: async (): Promise<boolean> => {
    const db = await getDb();
    return new Promise((resolve: any, reject: any) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },
};
