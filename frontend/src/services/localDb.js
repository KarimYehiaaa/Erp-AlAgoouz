const DB_NAME = 'BinAlAgoouzOfflineDB';
const DB_VERSION = 1;

let dbInstance = null;

const getDb = () => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
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

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
};

export const localDb = {
  // Clear and save products
  saveProducts: async (products) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('products', 'readwrite');
      const store = transaction.objectStore('products');

      store.clear();
      products.forEach((p) => {
        if (p && p.id) {
          store.put(p);
        }
      });

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  getProducts: async () => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('products', 'readonly');
      const store = transaction.objectStore('products');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  // Clear and save customers
  saveCustomers: async (customers) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('customers', 'readwrite');
      const store = transaction.objectStore('customers');

      store.clear();
      customers.forEach((c) => {
        if (c && c.id) {
          store.put(c);
        }
      });

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  },

  getCustomers: async () => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('customers', 'readonly');
      const store = transaction.objectStore('customers');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  // Save offline sale
  saveOfflineSale: async (sale) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');

      const offline_id = 'off_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const record = {
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

  getOfflineSales: async () => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_sales', 'readonly');
      const store = transaction.objectStore('offline_sales');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  deleteOfflineSale: async (offline_id) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');
      const request = store.delete(offline_id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  clearOfflineSales: async () => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_sales', 'readwrite');
      const store = transaction.objectStore('offline_sales');
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },
};
