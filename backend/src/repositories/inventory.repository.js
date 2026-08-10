import { BaseRepository } from "./base.repository.js";
import { query } from "../database/pool.js";
import { sanitizeLimit } from "../utils/money.js";
class InventoryRepository extends BaseRepository {
  tableName = "inventory";
  /**
   * Fetches inventory summary with product and warehouse details.
   */
  async getInventoryList(warehouseId) {
    const params = [];
    let sql = `
      SELECT DISTINCT ON (p.id)
        COALESCE(i.id, 0) AS id,
        p.id AS product_id,
        w.id AS warehouse_id,
        COALESCE(i.quantity, 0) AS quantity,
        COALESCE(inv_summary.total_stock, 0) AS total_quantity,
        COALESCE(inv_summary.main_stock, 0) AS main_quantity,
        COALESCE(inv_summary.branch_stock, 0) AS branch_quantity,
        COALESCE(inv_summary.breakdown, '[]'::json) AS warehouse_breakdown,
        i.batch_number,
        i.updated_at,
        p.sku,
        p.name_ar,
        p.min_stock,
        p.sale_price,
        EXISTS (
          SELECT 1
          FROM product_recipes r
          WHERE r.product_id = p.id
            AND r.deleted_at IS NULL
            AND r.is_active = TRUE
        ) AS has_active_recipe,
        w.name_ar AS warehouse_name,
        CASE WHEN COALESCE(inv_summary.total_stock, 0) <= p.min_stock THEN TRUE ELSE FALSE END AS is_low
      FROM products p
      JOIN warehouses w
        ON w.deleted_at IS NULL
        AND w.is_active = TRUE
        AND (
          p.primary_warehouse_id = w.id
          OR (
            p.primary_warehouse_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM inventory ix
              WHERE ix.product_id = p.id
                AND ix.warehouse_id = w.id
            )
          )
        )
      LEFT JOIN inventory i
        ON i.product_id = p.id
        AND i.warehouse_id = w.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(inv2.quantity), 0) AS total_stock,
          COALESCE(SUM(CASE WHEN wh2.type = 'main' OR wh2.code = 'MAIN' THEN inv2.quantity ELSE 0 END), 0) AS main_stock,
          COALESCE(SUM(CASE WHEN wh2.type != 'main' AND wh2.code != 'MAIN' THEN inv2.quantity ELSE 0 END), 0) AS branch_stock,
          json_agg(json_build_object(
            'warehouse_id', wh2.id,
            'warehouse_name', wh2.name_ar,
            'warehouse_type', wh2.type,
            'quantity', COALESCE(inv2.quantity, 0)
          )) AS breakdown
        FROM inventory inv2
        JOIN warehouses wh2 ON wh2.id = inv2.warehouse_id AND wh2.deleted_at IS NULL AND wh2.is_active = TRUE
        WHERE inv2.product_id = p.id
      ) inv_summary ON TRUE
      WHERE p.deleted_at IS NULL
        AND p.is_active = TRUE
    `;
    if (warehouseId) {
      sql += ` AND w.id = $1`;
      params.push(warehouseId);
    }
    sql += ` ORDER BY p.id, p.name_ar`;
    return (await query(sql, params)).rows;
  }
  /**
   * Fetches stock movements.
   */
  async getStockMovements(filters = {}) {
    let sql = `SELECT sm.*, p.name_ar as product_name, u.full_name as user_name,
      fw.name_ar as from_warehouse, tw.name_ar as to_warehouse
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.user_id = u.id
      LEFT JOIN warehouses fw ON sm.from_warehouse_id = fw.id
      LEFT JOIN warehouses tw ON sm.to_warehouse_id = tw.id WHERE 1=1`;
    const params = [];
    let i = 1;
    if (filters.product_id) {
      sql += ` AND sm.product_id = $${i++}`;
      params.push(filters.product_id);
    }
    if (filters.warehouse_id) {
      sql += ` AND (sm.from_warehouse_id = $${i} OR sm.to_warehouse_id = $${i})`;
      params.push(filters.warehouse_id);
      i++;
    }
    sql += ` ORDER BY sm.created_at DESC LIMIT ${sanitizeLimit(filters.limit)}`;
    return (await query(sql, params)).rows;
  }
}
const inventoryRepository = new InventoryRepository();
export {
  InventoryRepository,
  inventoryRepository
};
