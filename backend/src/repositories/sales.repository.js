import { BaseRepository } from "./base.repository.js";
import { query } from "../database/pool.js";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination.js";
class SalesRepository extends BaseRepository {
  tableName = "sales";
  /**
   * Fetches sales list with related customer and user data (supports pagination).
   */
  async getSalesList(filters = {}) {
    const { page, limit, offset } = getPaginationParams(filters);
    let sql = `SELECT s.*, c.name_ar as customer_name, c.code as customer_code, u.full_name as user_name,
      w.name_ar as warehouse_name,
      (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as items_count,
      COUNT(*) OVER() as full_count
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.deleted_at IS NULL`;
    const params = [];
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
      sql += ` AND s.sale_date <= $${idx++}`;
      params.push(filters.to_date);
    }
    if (filters.status) {
      sql += ` AND s.status = $${idx++}`;
      params.push(filters.status);
    }
    sql += ` ORDER BY s.sale_date DESC, s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const rows = (await query(sql, params)).rows;
    const total = rows.length > 0 ? rows[0].full_count : 0;
    const cleanRows = rows.map((r) => {
      const { full_count, ...rest } = r;
      return rest;
    });
    return { data: cleanRows, meta: buildPaginationMeta(total, page, limit) };
  }
}
const salesRepository = new SalesRepository();
export {
  SalesRepository,
  salesRepository
};
