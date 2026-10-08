import { randomUUID } from 'node:crypto';
import { AppError } from '../types/errors.ts';
import { standalonePaymentSourceSql } from './paymentJournalSources.ts';

/** Reconcile an explicitly supplied receipt distribution inside the locked sale transaction. */
export async function settleSalePaymentAllocations(
  client: any,
  saleId: number,
  userId: number,
  allocations: Array<{ payment_method: string; amount: number }>,
) {
  const rows = (
    await client.query(
      `SELECT payments.id, payments.payment_method, payments.amount,
         ${standalonePaymentSourceSql('payments')} AS protected_source FROM payments
       WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'
         AND ((reference_type = 'sale' AND reference_id = $1)
          OR (reference_type = 'invoice' AND reference_id IN (SELECT id FROM invoices WHERE sale_id = $1)))
       ORDER BY id DESC FOR UPDATE`,
      [saleId],
    )
  ).rows;
  const desired = new Map<string, number>();
  for (const allocation of allocations) {
    const method = allocation.payment_method.trim().toLowerCase();
    desired.set(method, (desired.get(method) || 0) + Math.round(allocation.amount * 100));
  }
  const existing = new Map<string, Array<{ id: number; cents: number; protected: boolean }>>();
  for (const row of rows) {
    const amount = Number(row.amount);
    const cents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || cents < 0)
      throw new AppError('توجد دفعة محفوظة غير صالحة؛ يلزم مراجعتها قبل تعديل التوزيع', 409);
    const method = (row.payment_method || 'cash').trim().toLowerCase();
    const methodRows = existing.get(method) || [];
    methodRows.push({ id: row.id, cents, protected: row.protected_source });
    existing.set(method, methodRows);
  }
  for (const method of new Set([...existing.keys(), ...desired.keys()])) {
    const methodRows = existing.get(method) || [];
    const previous = methodRows.reduce((sum, row) => sum + row.cents, 0);
    const target = desired.get(method) || 0;
    const protectedAmount = methodRows
      .filter((row) => row.protected)
      .reduce((sum, row) => sum + row.cents, 0);
    if (target < protectedAmount)
      throw new AppError(
        'لا يمكن تغيير تحصيل مُرحّل من تعديل البيع؛ استخدم تسوية التحصيل أو المرتجع',
        409,
      );
    if (!Number.isSafeInteger(previous))
      throw new AppError('إجمالي الدفعات المحفوظة غير صالح', 409);
    if (target > previous) {
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
         VALUES ($1,'sale',$2,$3,$4,$5)`,
        [
          `PAY-${saleId}-${randomUUID().replaceAll('-', '')}`,
          saleId,
          (target - previous) / 100,
          method,
          userId,
        ],
      );
    } else {
      let excess = previous - target;
      for (const row of methodRows) {
        if (row.protected) continue;
        if (excess === 0) break;
        if (row.cents <= excess) {
          await client.query('DELETE FROM payments WHERE id=$1', [row.id]);
          excess -= row.cents;
        } else {
          await client.query('UPDATE payments SET amount=$1 WHERE id=$2', [
            (row.cents - excess) / 100,
            row.id,
          ]);
          excess = 0;
        }
      }
    }
  }
}
