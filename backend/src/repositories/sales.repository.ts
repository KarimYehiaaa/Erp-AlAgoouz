import { BaseRepository } from './base.repository.ts';
import { query } from '../database/pool.ts';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.ts';
/**
 * عمليات المبيعات: القائمة مع الترقيم والتصفية.
 */
class SalesRepository extends BaseRepository {
  tableName = 'sales';
  /**
   * قائمة المبيعات مع بيانات العميل والمستخدم والمخزن (مع ترقيم وتصفية).
   * @param {Record<string, any>} [filters] عوامل التصفية (sale_type، entry_mode، from_date، to_date، status، page، limit)
   * @returns {Promise<{ data: Array<Record<string, any>>, meta: Record<string, any> }>} النتائج مع بيانات الترقيم
   */
  async getSalesList(filters: Record<string, any> = {}) {
    const { page, limit, offset } = getPaginationParams(filters);
    let sql = `SELECT s.*, c.name_ar as customer_name, c.code as customer_code, u.full_name as user_name,
      w.name_ar as warehouse_name,
      (SELECT id FROM invoices WHERE sale_id = s.id LIMIT 1) as invoice_id,
      (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as items_count,
      COUNT(*) OVER() as full_count
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.deleted_at IS NULL`;
    const params: any[] = [];
    let idx = 1;
    if (filters.sale_type) {
      sql += ` AND s.sale_type = $${idx++}`;
      params.push(filters.sale_type);
    }
    if (filters.entry_mode) {
      sql += ` AND s.entry_mode = $${idx++}`;
      params.push(filters.entry_mode);
    }
    if (filters.from_date) {
      sql += ` AND s.sale_date >= $${idx++}`;
      params.push(filters.from_date);
    }
    if (filters.to_date) {
      sql += ` AND s.sale_date <= $${idx}`;
      params.push(filters.to_date);
    }
    if (filters.status) {
      sql += ` AND s.status = $${params.length + 1}`;
      params.push(filters.status);
    }
    if (filters.warehouse_id) {
      sql += ` AND s.warehouse_id = $${params.length + 1}`;
      params.push(Number(filters.warehouse_id));
    }
    if (Array.isArray(filters.warehouse_ids)) {
      sql += ` AND s.warehouse_id = ANY($${params.length + 1}::int[])`;
      params.push(filters.warehouse_ids.map(Number));
    }
    sql += ` ORDER BY s.sale_date DESC, s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const rows = (await query(sql, params)).rows;
    const total = rows.length > 0 ? rows[0].full_count : 0;
    const cleanRows = rows.map((r) => {
      const { full_count, ...rest } = r;
      void full_count;
      return rest;
    });
    return { data: cleanRows, meta: buildPaginationMeta(total, page, limit) };
  }
}
const salesRepository = new SalesRepository();
export { SalesRepository, salesRepository };
