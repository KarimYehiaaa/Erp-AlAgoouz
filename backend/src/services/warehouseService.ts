import { query } from '../database/pool.ts';

/**
 * تنفيذ استعلام عبر اتصال عادي (دالة query) أو داخل معاملة (PoolClient).
 */
const runQuery = (db: typeof query | import('pg').PoolClient, text: string, params?: unknown[]) =>
  typeof db === 'function' ? db(text, params) : db.query(text, params);

const parseWarehouseId = (rawValue) => {
  if (!rawValue) return null;
  if (typeof rawValue === 'object') return Number(rawValue.id) || null;
  try {
    const parsed = JSON.parse(rawValue);
    return Number(parsed?.id) || null;
  } catch {
    const num = Number(rawValue);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
};

/**
 * جلب معرف المخزن الافتراضي.
 * @param {typeof query | import('pg').PoolClient} [db] اتصال قاعدة البيانات
 * @returns {Promise<number | null>}
 */
export const getDefaultWarehouseId = async (db: typeof query | import('pg').PoolClient = query) => {
  const result = await runQuery(db, `SELECT value FROM settings WHERE key = 'default_warehouse'`);
  const settingId = parseWarehouseId(result.rows[0]?.value);
  if (settingId) return settingId;

  const fallback = await runQuery(
    db,
    `SELECT id
     FROM warehouses
     WHERE deleted_at IS NULL AND is_active = TRUE
     ORDER BY id ASC
     LIMIT 1`,
  );
  return Number(fallback.rows[0]?.id || 0) || null;
};

/**
 * جلب معرف المخزن حسب كوده.
 * @param {string} code كود المخزن
 * @param {typeof query | import('pg').PoolClient} [db] اتصال قاعدة البيانات
 * @returns {Promise<number | null>}
 */
export const getWarehouseIdByCode = async (
  code: string,
  db: typeof query | import('pg').PoolClient = query,
) => {
  const result = await runQuery(
    db,
    `SELECT id
     FROM warehouses
     WHERE code = $1 AND deleted_at IS NULL AND is_active = TRUE
     LIMIT 1`,
    [code],
  );
  return Number(result.rows[0]?.id || 0) || null;
};

/**
 * جلب معرف المخزن الرئيسي.
 * @param {typeof query | import('pg').PoolClient} [db] اتصال قاعدة البيانات
 * @returns {Promise<number | null>}
 */
export const getMainWarehouseId = async (db: typeof query | import('pg').PoolClient = query) => {
  const byCode = await getWarehouseIdByCode('MAIN', db);
  if (byCode) return byCode;
  const result = await runQuery(
    db,
    `SELECT id FROM warehouses WHERE (type = 'main' OR code = 'MAIN') AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`,
  );
  return Number(result.rows[0]?.id || 0) || (await getDefaultWarehouseId(db));
};

/**
 * جلب معرف مخزن المحل.
 * @param {typeof query | import('pg').PoolClient} [db] اتصال قاعدة البيانات
 * @returns {Promise<number | null>}
 */
export const getStoreWarehouseId = async (db: typeof query | import('pg').PoolClient = query) => {
  const byCode = await getWarehouseIdByCode('STORE', db);
  if (byCode) return byCode;
  const result = await runQuery(
    db,
    `SELECT id FROM warehouses WHERE (type = 'store' OR code = 'STORE') AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`,
  );
  return Number(result.rows[0]?.id || 0) || (await getDefaultWarehouseId(db));
};
