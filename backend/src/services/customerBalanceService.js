import { query } from '../database/pool.js';

/**
 * يعيد حساب رصيد العميل من كل عمليات البيع المكتملة والمرتجعة.
 *
 * الإصلاح: كانت الدالة تتجاهل المبيعات المرتجعة (status='returned')
 * لأنها تفلتر على status='completed' فقط.
 * الآن تحسب الرصيد من المدفوعات الفعلية مقابل كل مبيعات العميل
 * (مكتملة + مرتجعة) مع استثناء المدفوع المسترد (refunded payments).
 */
export const recalculateCustomerBalance = async (db = query, customerId) => {
  await db(
    `
    UPDATE customers c
    SET balance = COALESCE(c.opening_balance, 0) + COALESCE((
      SELECT GREATEST(0, SUM(outstanding))
      FROM (
        SELECT
          CASE
            -- المبيعات المرتجعة: رصيدها صفر (تم الاسترداد)
            WHEN s.status = 'returned' THEN 0
            ELSE
              COALESCE(s.total_amount, 0) - COALESCE((
                SELECT SUM(amount)
                FROM payments p
                WHERE p.reference_type = 'sale'
                  AND p.reference_id = s.id
              ), 0)
          END AS outstanding
        FROM sales s
        WHERE s.customer_id = $1
          AND s.deleted_at IS NULL
          AND s.sale_type = 'wholesale'
          AND s.status IN ('completed', 'returned')

        UNION ALL

        SELECT
          COALESCE(i.total_amount, 0) - COALESCE((
            SELECT SUM(amount)
            FROM payments p
            WHERE p.reference_type = 'invoice'
              AND p.reference_id = i.id
          ), 0) AS outstanding
        FROM invoices i
        WHERE i.customer_id = $1
          AND i.sale_id IS NULL
          AND i.deleted_at IS NULL
      ) source
    ), 0),
    current_balance = COALESCE(c.opening_balance, 0) + COALESCE((
      SELECT GREATEST(0, SUM(outstanding))
      FROM (
        SELECT
          CASE
            WHEN s.status = 'returned' THEN 0
            ELSE
              COALESCE(s.total_amount, 0) - COALESCE((
                SELECT SUM(amount)
                FROM payments p
                WHERE p.reference_type = 'sale'
                  AND p.reference_id = s.id
              ), 0)
          END AS outstanding
        FROM sales s
        WHERE s.customer_id = $1
          AND s.deleted_at IS NULL
          AND s.sale_type = 'wholesale'
          AND s.status IN ('completed', 'returned')

        UNION ALL

        SELECT
          COALESCE(i.total_amount, 0) - COALESCE((
            SELECT SUM(amount)
            FROM payments p
            WHERE p.reference_type = 'invoice'
              AND p.reference_id = i.id
          ), 0) AS outstanding
        FROM invoices i
        WHERE i.customer_id = $1
          AND i.sale_id IS NULL
          AND i.deleted_at IS NULL
      ) source
    ), 0)
    WHERE c.id = $1
    `,
    [customerId]
  );
};
