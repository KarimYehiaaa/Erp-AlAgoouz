import { query } from '../database/pool.ts';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.ts';
/**
 * عمليات المبيعات: القائمة مع الترقيم والتصفية.
 */
class SalesRepository {
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
      LEFT JOIN warehouses w ON s.warehouse_id = w.id`;
    let filterSql = ` WHERE s.deleted_at IS NULL`;
    const params: any[] = [];
    if (filters.sale_type) {
      params.push(filters.sale_type);
      filterSql += ` AND s.sale_type = $${params.length}`;
    }
    if (filters.entry_mode) {
      params.push(filters.entry_mode);
      filterSql += ` AND s.entry_mode = $${params.length}`;
    }
    if (filters.from_date) {
      params.push(filters.from_date);
      filterSql += ` AND s.sale_date >= $${params.length}`;
    }
    if (filters.to_date) {
      params.push(filters.to_date);
      filterSql += ` AND s.sale_date <= $${params.length}`;
    }
    if (filters.status) {
      params.push(filters.status);
      filterSql += ` AND s.status = $${params.length}`;
    }
    if (filters.warehouse_id) {
      params.push(Number(filters.warehouse_id));
      filterSql += ` AND s.warehouse_id = $${params.length}`;
    }
    if (Array.isArray(filters.warehouse_ids)) {
      params.push(filters.warehouse_ids.map(Number));
      filterSql += ` AND s.warehouse_id = ANY($${params.length}::int[])`;
    }
    sql += filterSql;
    const countParams = [...params];
    params.push(limit, offset);
    sql += ` ORDER BY s.sale_date DESC, s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = (await query(sql, params)).rows;
    const total =
      rows.length > 0
        ? rows[0].full_count
        : (await query(`SELECT COUNT(*)::int AS total FROM sales s${filterSql}`, countParams))
            .rows[0].total;
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
