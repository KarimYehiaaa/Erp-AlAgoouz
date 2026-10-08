import { query } from '../database/pool.ts';
import { sanitizeLimit } from '../utils/money.ts';
/**
 * عمليات المخزون: ملخص الأرصدة وحركات المخزون.
 */
class InventoryRepository {
  /**
   * ملخص أرصدة المخزون مع بيانات المنتج والمخزن.
   * @param {number} [warehouseId] معرف المخزن (أو المخزن الافتراضي عند الإغفال)
   * @returns {Promise<Array<Record<string, any>>>} الأرصدة
   */
  async getInventoryList(warehouseId, allowedWarehouseIds: number[]) {
    const params: any[] = [];
    if (warehouseId) params.push(warehouseId);
    params.push(allowedWarehouseIds);
    const scopeParam = `$${params.length}::int[]`;
    const whParam = warehouseId
      ? '$1'
      : `COALESCE((SELECT id FROM warehouses WHERE id = p.primary_warehouse_id
          AND id = ANY(${scopeParam}) AND deleted_at IS NULL AND is_active = TRUE),
          (SELECT id FROM warehouses WHERE id = ANY(${scopeParam})
          AND deleted_at IS NULL AND is_active = TRUE ORDER BY id ASC LIMIT 1))`;
    const sql = `
      SELECT
        COALESCE(i.id, 0) AS id,
        p.id AS product_id,
        w.id AS warehouse_id,
        COALESCE(i.quantity, 0) AS quantity,
        COALESCE(inv_summary.total_stock, 0) AS total_quantity,
        COALESCE(inv_summary.main_stock, 0) AS main_quantity,
        COALESCE(inv_summary.other_warehouses_stock, 0) AS other_warehouses_quantity,
        COALESCE(inv_summary.breakdown, '[]'::json) AS warehouse_breakdown,
        NULL::varchar AS batch_number,
        i.updated_at,
        p.sku,
        p.name_ar,
        p.min_stock,
        COALESCE(p.purchase_price, 0) AS purchase_price,
        p.sale_price,
        EXISTS (
          SELECT 1
          FROM product_recipes r
          WHERE r.product_id = p.id
            AND r.deleted_at IS NULL
            AND r.is_active = TRUE
        ) AS has_active_recipe,
        COALESCE(w.name_ar, 'المخزن') AS warehouse_name,
        CASE WHEN COALESCE(inv_summary.total_stock, 0) <= p.min_stock THEN TRUE ELSE FALSE END AS is_low
      FROM products p
      LEFT JOIN warehouses w
        ON w.deleted_at IS NULL
        AND w.is_active = TRUE
        AND w.id = ${whParam}
      LEFT JOIN LATERAL (
        SELECT MIN(inv.id) AS id, SUM(inv.quantity) AS quantity, MAX(inv.updated_at) AS updated_at
        FROM inventory inv WHERE inv.product_id = p.id AND inv.warehouse_id = ${whParam}
          AND inv.warehouse_id = ANY(${scopeParam})
      ) i ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(inv2.quantity), 0) AS total_stock,
          COALESCE(SUM(CASE WHEN wh2.type = 'main' OR wh2.code = 'MAIN' THEN inv2.quantity ELSE 0 END), 0) AS main_stock,
          COALESCE(SUM(CASE WHEN wh2.type != 'main' AND wh2.code != 'MAIN' THEN inv2.quantity ELSE 0 END), 0) AS other_warehouses_stock,
          json_agg(json_build_object(
            'warehouse_id', wh2.id,
            'warehouse_name', wh2.name_ar,
            'warehouse_type', wh2.type,
            'quantity', COALESCE(inv2.quantity, 0)
          )) AS breakdown
        FROM (
          SELECT product_id, warehouse_id, SUM(quantity) AS quantity FROM inventory
          WHERE product_id = p.id AND warehouse_id = ANY(${scopeParam})
          GROUP BY product_id, warehouse_id
        ) inv2
        JOIN warehouses wh2 ON wh2.id = inv2.warehouse_id AND wh2.deleted_at IS NULL AND wh2.is_active = TRUE
        WHERE inv2.product_id = p.id
      ) inv_summary ON TRUE
      WHERE p.deleted_at IS NULL
        AND p.is_active = TRUE
      ORDER BY p.id ASC
    `;
    return (await query(sql, params)).rows;
  }
  /**
   * Fetches stock movements.
   */
  /**
   * حركات المخزون (داخل/خارج/تحويل) مع التصفية حسب المنتج والمخزن والنوع.
   * @param {Record<string, any>} [filters] عوامل التصفية (product_id، warehouse_id، movement_type، limit)
   * @returns {Promise<Array<Record<string, any>>>} الحركات
   */
  async getStockMovements(filters: Record<string, any>, allowedWarehouseIds: number[]) {
    let sql = `SELECT sm.*, p.name_ar as product_name, p.sku as product_sku, p.unit as product_unit, u.full_name as user_name,
      fw.name_ar as from_warehouse, tw.name_ar as to_warehouse
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.user_id = u.id
      LEFT JOIN warehouses fw ON sm.from_warehouse_id = fw.id
      LEFT JOIN warehouses tw ON sm.to_warehouse_id = tw.id WHERE 1=1`;
    const params: any[] = [allowedWarehouseIds];
    sql += ` AND (sm.from_warehouse_id IS NULL OR sm.from_warehouse_id = ANY($1::int[]))
      AND (sm.to_warehouse_id IS NULL OR sm.to_warehouse_id = ANY($1::int[]))
      AND (sm.from_warehouse_id = ANY($1::int[]) OR sm.to_warehouse_id = ANY($1::int[]))`;
    let i = 2;
    if (filters.product_id) {
      sql += ` AND sm.product_id = $${i++}`;
      params.push(filters.product_id);
    }
    if (filters.warehouse_id) {
      sql += ` AND (sm.from_warehouse_id = $${i} OR sm.to_warehouse_id = $${i})`;
      params.push(filters.warehouse_id);
      i++;
    }
    if (filters.movement_type) {
      sql += ` AND sm.movement_type = $${i}`;
      params.push(filters.movement_type);
    }
    sql += ` ORDER BY sm.created_at DESC LIMIT ${sanitizeLimit(filters.limit)}`;
    return (await query(sql, params)).rows;
  }
}
const inventoryRepository = new InventoryRepository();
export { InventoryRepository, inventoryRepository };
