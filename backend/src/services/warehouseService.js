import { query } from '../database/pool.js';

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

export const getDefaultWarehouseId = async (db = query) => {
  const result = await db(`SELECT value FROM settings WHERE key = 'default_warehouse'`);
  const settingId = parseWarehouseId(result.rows[0]?.value);
  if (settingId) return settingId;

  const fallback = await db(
    `SELECT id
     FROM warehouses
     WHERE deleted_at IS NULL AND is_active = TRUE
     ORDER BY id ASC
     LIMIT 1`
  );
  return Number(fallback.rows[0]?.id || 0) || null;
};

export const getWarehouseIdByCode = async (code, db = query) => {
  const result = await db(
    `SELECT id
     FROM warehouses
     WHERE code = $1 AND deleted_at IS NULL AND is_active = TRUE
     LIMIT 1`,
    [code]
  );
  return Number(result.rows[0]?.id || 0) || null;
};

export const getMainWarehouseId = async (db = query) => {
  const byCode = await getWarehouseIdByCode('MAIN', db);
  if (byCode) return byCode;
  const result = await db(`SELECT id FROM warehouses WHERE (type = 'main' OR code = 'MAIN') AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`);
  return Number(result.rows[0]?.id || 0) || await getDefaultWarehouseId(db);
};

export const getStoreWarehouseId = async (db = query) => {
  const byCode = await getWarehouseIdByCode('STORE', db);
  if (byCode) return byCode;
  const result = await db(`SELECT id FROM warehouses WHERE (type = 'store' OR code = 'STORE') AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`);
  return Number(result.rows[0]?.id || 0) || await getDefaultWarehouseId(db);
};

