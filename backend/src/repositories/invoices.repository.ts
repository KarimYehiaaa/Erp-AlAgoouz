import { BaseRepository } from './base.repository.ts';
import { query } from '../database/pool.ts';
import { sanitizeLimit } from '../utils/money.ts';
import { AppError } from '../types/errors.ts';
/**
 * عمليات الفواتير: القائمة والتفاصيل الكاملة.
 */
class InvoicesRepository extends BaseRepository {
  tableName = 'invoices';
  /**
   * قائمة الفواتير مع بيانات العميل والمبيعة، مع التصفية حسب حالة الدفع والعميل.
   * @param {Record<string, any>} [filters] عوامل التصفية (payment_status، customer_id، limit)
   * @returns {Promise<Array<Record<string, any>>>} الفواتير
   */
  async getInvoicesList(filters: Record<string, any> = {}) {
    let sql = `SELECT i.*, c.name_ar as customer_name, s.sale_number
      FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN sales s ON i.sale_id = s.id WHERE i.deleted_at IS NULL`;
    const params: any[] = [];
    let idx = 1;
    if (filters.payment_status) {
      sql += ` AND i.payment_status = $${idx++}`;
      params.push(filters.payment_status);
    }
    if (filters.customer_id) {
      sql += ` AND i.customer_id = $${idx}`;
      params.push(filters.customer_id);
    }
    sql += ` ORDER BY i.created_at DESC LIMIT ${sanitizeLimit(filters.limit)}`;
    return (await query(sql, params)).rows;
  }
  /**
   * Fetches an invoice by ID with all details.
   */
  /**
   * تفاصيل فاتورة كاملة مع بنودها ومدفوعاتها.
   * @param {number} id معرّف الفاتورة
   * @returns {Promise<Record<string, any> | null>} الفاتورة أو null
   */
  async getInvoiceDetails(id) {
    const loadItemsJson = `COALESCE(
      (SELECT json_agg(json_build_object(
        'id', ii.id, 'product_id', ii.product_id, 'product_name', p.name_ar,
        'description', ii.description, 'quantity', ii.quantity, 'unit_price', ii.unit_price,
        'discount_amount', ii.discount_amount, 'total_amount', ii.total_amount
      ) ORDER BY ii.sort_order, ii.id)
       FROM invoice_items ii LEFT JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = i.id),
      (SELECT json_agg(json_build_object(
        'id', si.id, 'product_id', si.product_id, 'product_name', p.name_ar,
        'description', si.notes, 'quantity', si.quantity, 'unit_price', si.unit_price,
        'discount_amount', 0, 'total_amount', si.total_amount
      ) ORDER BY si.id)
       FROM sale_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id = i.sale_id),
      '[]'::json
    ) as items`;
    const result = await query(
      `SELECT i.*, s.warehouse_id, c.name_ar as customer_name, c.phone as customer_phone, c.address as customer_address,
        c.tax_number as customer_tax, s.sale_number, s.sale_type, u.full_name as issued_by,
        ${loadItemsJson}
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       LEFT JOIN sales s ON i.sale_id = s.id
       LEFT JOIN users u ON i.user_id = u.id
       WHERE (i.id = $1 OR i.sale_id = $1) AND i.deleted_at IS NULL
       ORDER BY (CASE WHEN i.id = $1 THEN 1 ELSE 2 END) LIMIT 1`,
      [id],
    );
    if (!result.rows[0])
      throw new AppError(
        '\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
        404,
      );
    const settings = await query(`SELECT key, value FROM settings WHERE key IN ('company', 'tax')`);
    const company = settings.rows.find((r) => r.key === 'company')?.value || {};
    const tax = settings.rows.find((r) => r.key === 'tax')?.value || { rate: 14 };
    const inv = result.rows[0];
    return { ...inv, company, tax_settings: tax };
  }
}
const invoicesRepository = new InvoicesRepository();
export { InvoicesRepository, invoicesRepository };
