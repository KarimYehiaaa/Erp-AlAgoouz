import { effectivePostedJournalSql } from '../utils/journalPosting.ts';
import { query } from '../database/pool.ts';
import { roundMoney } from '../utils/money.ts';

/** Posted cash movements plus legacy operational receipts without matching postings.
 * Cash, drawers, banks and wallets are all children of account 1101.
 * Invoice totals and accrual adjustments never establish a cash movement.
 */
export const getTreasuryMovementTotals = async (from: string, to: string, db: typeof query) => {
  const result = await db(
    `WITH cash_journals AS (
       SELECT je.id,je.entry_date,je.reference_type,je.reference_id,je.idempotency_key,
              SUM(jel.debit-jel.credit) AS net,
              SUM(CASE WHEN (a.code LIKE '110101%' OR a.code LIKE '110102%') THEN jel.debit-jel.credit ELSE 0 END) AS cash_net
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       JOIN accounts a ON a.id=jel.account_id
       WHERE ${effectivePostedJournalSql('je')} AND a.code LIKE '1101%'
       GROUP BY je.id
     ), payment_sources AS (
       SELECT p.*, CASE WHEN p.reference_type='sale' THEN p.reference_id
              WHEN p.reference_type='invoice' THEN i.sale_id END AS sale_id,
              CASE WHEN p.reference_type IN ('customer_opening','customer_advance') THEN p.reference_id
                   WHEN p.reference_type='sale' THEN s.customer_id
                   WHEN p.reference_type='invoice' THEN i.customer_id END AS customer_id,
              regexp_match(p.payment_number,'^PAY-(OB|S|INV|ADV)[0-9]+-([0-9]+)-[0-9]+$') AS allocation
       FROM payments p
       LEFT JOIN invoices i ON p.reference_type='invoice' AND i.id=p.reference_id
       LEFT JOIN sales s ON p.reference_type='sale' AND s.id=p.reference_id
       WHERE p.reference_type IN ('sale','invoice','supplier','customer_opening','customer_advance','customer_deposit')
         AND LOWER(TRIM(COALESCE(p.payment_method,'cash'))) <> 'credit'
     ), unposted_payments AS (
       SELECT p.* FROM payment_sources p
       WHERE NOT EXISTS(SELECT 1 FROM cash_journals j WHERE j.id=p.journal_entry_id
         OR (j.reference_type='payment' AND (
           j.idempotency_key='payment:'||p.id::text
           OR (p.reference_type='supplier' AND j.idempotency_key='supplier_payment:'||p.id::text)
           OR (p.reference_type='sale' AND j.idempotency_key='customer_payment:'||p.payment_number)
           OR (p.allocation IS NOT NULL AND p.customer_id IS NOT NULL
             AND j.reference_id=p.customer_id::text
             AND j.idempotency_key='customer_payment:PAY-CUST-'||p.customer_id::text||'-'||p.allocation[2])
         )))
     ), payment_coverage AS (
       SELECT p.*, COALESCE(SUM(GREATEST(p.amount,0)) OVER (
         PARTITION BY p.sale_id ORDER BY p.created_at,p.id
         ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS previous_receipts,
         COALESCE((SELECT SUM(GREATEST(GREATEST(j.net,0)-COALESCE((
           SELECT SUM(GREATEST(linked.amount,0)) FROM payment_sources linked
           WHERE linked.journal_entry_id=j.id AND linked.sale_id=p.sale_id
         ),0),0)) FROM cash_journals j
           WHERE j.reference_type='sale' AND j.reference_id=p.sale_id::text
             AND (j.idempotency_key='sale:'||p.sale_id::text OR j.idempotency_key IS NULL)),0) AS initial_posted
       FROM unposted_payments p
     ), payment_amounts AS (
       SELECT *, CASE WHEN reference_type='supplier' THEN -amount
              WHEN amount<=0 THEN amount
              ELSE GREATEST(amount-GREATEST(initial_posted-previous_receipts,0),0) END AS net
       FROM payment_coverage
     ), movements AS (
       SELECT net,cash_net FROM cash_journals WHERE entry_date BETWEEN $1::date AND $2::date
       UNION ALL
       SELECT net, CASE WHEN LOWER(TRIM(COALESCE(payment_method,'cash'))) IN ('cash','drawer','نقد','نقدي') THEN net ELSE 0 END
       FROM payment_amounts
       WHERE created_at >= $1::date AND created_at < ($2::date+INTERVAL '1 day')
       UNION ALL
       SELECT legacy.amount,legacy.amount
       FROM sales s CROSS JOIN LATERAL (SELECT CASE WHEN s.status='completed' THEN s.total_amount
         ELSE COALESCE((SELECT SUM(GREATEST(-j.net,0)) FROM cash_journals j
           WHERE j.idempotency_key='sales_refund:'||s.id::text),0) END AS amount) legacy
       WHERE s.deleted_at IS NULL AND s.status IN ('completed','returned')
         AND (s.payment_status='paid' OR s.status='returned')
         AND s.sale_date BETWEEN $1::date AND $2::date
         AND NOT EXISTS(SELECT 1 FROM payments p WHERE
           (p.reference_type='sale' AND p.reference_id=s.id) OR
           (p.reference_type='invoice' AND p.reference_id IN (SELECT id FROM invoices WHERE sale_id=s.id)))
         AND NOT EXISTS(SELECT 1 FROM cash_journals j WHERE j.reference_type='sale' AND j.reference_id=s.id::text
           AND (j.idempotency_key='sale:'||s.id::text OR (j.idempotency_key IS NULL AND j.net>0)))
       UNION ALL
       SELECT -e.amount, CASE WHEN LOWER(TRIM(COALESCE(e.payment_method,'cash'))) IN ('cash','drawer','نقد','نقدي') THEN -e.amount ELSE 0 END FROM expenses e WHERE e.deleted_at IS NULL
         AND e.expense_date BETWEEN $1::date AND $2::date
         AND LOWER(TRIM(COALESCE(e.payment_method,'cash'))) <> 'adjustment'
         AND NOT EXISTS(SELECT 1 FROM cash_journals j WHERE j.reference_type='expense' AND j.reference_id=e.id::text)
       UNION ALL
       SELECT -d.amount, CASE WHEN d.source_type IN ('cash_drawer','main_treasury') THEN -d.amount ELSE 0 END FROM partner_drawings d WHERE d.drawing_date BETWEEN $1::date AND $2::date
         AND NOT EXISTS(SELECT 1 FROM cash_journals j WHERE j.idempotency_key='drawing:'||d.id::text)
     ) SELECT COALESCE(SUM(net),0) AS net,
       COALESCE(SUM(GREATEST(net,0)),0) AS cash_in,
       COALESCE(SUM(GREATEST(-net,0)),0) AS cash_out,
       COALESCE(SUM(CASE WHEN net>0 THEN LEAST(net,GREATEST(cash_net,0)) ELSE 0 END),0) AS cash_in_cash
       FROM movements`,
    [from, to],
  );
  const row = result.rows[0];
  const cashIn = roundMoney(Number(row?.cash_in || 0));
  const cashInCash = roundMoney(Number(row?.cash_in_cash || 0));
  return {
    net: roundMoney(Number(row?.net || 0)),
    cashIn,
    cashOut: roundMoney(Number(row?.cash_out || 0)),
    cashInCash,
    cashInElectronic: roundMoney(cashIn - cashInCash),
  };
};

export const getTreasuryMovementNet = async (from: string, to: string, db: typeof query) =>
  (await getTreasuryMovementTotals(from, to, db)).net;
