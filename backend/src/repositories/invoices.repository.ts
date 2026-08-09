import { BaseRepository, BaseEntity } from './base.repository.js';
import { query } from '../database/pool.js';
import { sanitizeLimit } from '../utils/money.js';
import { AppError } from '../types/errors.js';

export interface InvoiceEntity extends BaseEntity {
  invoice_number: string;
  customer_id: number | null;
  sale_id: number | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_status: 'paid' | 'unpaid' | 'partial';
  notes?: string;
  invoice_date: Date;
  user_id: number;
}

export class InvoicesRepository extends BaseRepository<InvoiceEntity> {
  protected tableName = 'invoices';

  /**
   * Fetches invoices list.
   */
  async getInvoicesList(filters: any = {}): Promise<any[]> {
    let sql = `SELECT i.*, c.name_ar as customer_name, s.sale_number
      FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN sales s ON i.sale_id = s.id WHERE i.deleted_at IS NULL AND i.sale_id IS NULL`;
    const params: any[] = [];
    let idx = 1;
    if (filters.payment_status) { sql += ` AND i.payment_status = $${idx++}`; params.push(filters.payment_status); }
    if (filters.customer_id) { sql += ` AND i.customer_id = $${idx++}`; params.push(filters.customer_id); }
    sql += ` ORDER BY i.created_at DESC LIMIT ${sanitizeLimit(filters.limit)}`;
    return (await query(sql, params)).rows;
  }

  /**
   * Fetches an invoice by ID with all details.
   */
  async getInvoiceDetails(id: number): Promise<any> {
    const loadItemsJson = `COALESCE(
      (SELECT json_agg(json_build_object(
        'id', ii.id, 'product_id', ii.product_id, 'product_name', p.name_ar,
        'description', ii.description, 'quantity', ii.quantity, 'unit_price', ii.unit_price,
        'discount_amount', ii.discount_amount, 'total_amount', ii.total_amount
      ) ORDER BY ii.sort_order, ii.id)
       FROM invoice_items ii LEFT JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = i.id),
      '[]'::json
    ) as items`;

    const result = await query(
      `SELECT i.*, c.name_ar as customer_name, c.phone as customer_phone, c.address as customer_address,
        c.tax_number as customer_tax, s.sale_number, s.sale_type, u.full_name as issued_by,
        ${loadItemsJson}
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       LEFT JOIN sales s ON i.sale_id = s.id
       LEFT JOIN users u ON i.user_id = u.id
       WHERE i.id = $1 AND i.deleted_at IS NULL`,
      [id]
    );
    
    if (!result.rows[0]) throw new AppError('الفاتورة غير موجودة', 404);

    const settings = await query(`SELECT key, value FROM settings WHERE key IN ('company', 'tax')`);
    const company = settings.rows.find((r) => r.key === 'company')?.value || {};
    const tax = settings.rows.find((r) => r.key === 'tax')?.value || { rate: 14 };
    
    const inv = result.rows[0];
    return { ...inv, company, tax_settings: tax };
  }
}

export const invoicesRepository = new InvoicesRepository();
