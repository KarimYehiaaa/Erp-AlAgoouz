-- Preserve the receipt event independently of its customer/document IDs.
-- Deferred validation supports backup restore orders that insert payments first.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER
  REFERENCES journal_entries(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS idx_payments_journal_entry_id ON payments(journal_entry_id);

WITH owners AS (
  SELECT p.*,
    CASE WHEN p.reference_type IN ('customer_opening','customer_advance') THEN p.reference_id
         WHEN p.reference_type='sale' THEN s.customer_id
         WHEN p.reference_type='invoice' THEN i.customer_id END AS customer_id,
    regexp_match(p.payment_number, '^PAY-(OB|S|INV|ADV)[0-9]+-([0-9]+)-[0-9]+$') AS allocation
  FROM payments p
  LEFT JOIN sales s ON p.reference_type='sale' AND s.id=p.reference_id
  LEFT JOIN invoices i ON p.reference_type='invoice' AND i.id=p.reference_id
), candidates AS (
  SELECT p.id AS payment_id, je.id AS journal_id
  FROM owners p JOIN journal_entries je ON je.reference_type='payment' AND (
    je.idempotency_key='payment:' || p.id::text
    OR (p.reference_type='supplier' AND je.idempotency_key='supplier_payment:' || p.id::text)
    OR (p.reference_type='sale' AND je.idempotency_key='customer_payment:' || p.payment_number)
    OR (p.allocation IS NOT NULL AND p.customer_id IS NOT NULL
        AND je.reference_id::text=p.customer_id::text
        AND je.idempotency_key='customer_payment:PAY-CUST-' || p.customer_id::text || '-' || p.allocation[2])
  )
), unique_sources AS (
  SELECT payment_id, MIN(journal_id) AS journal_id
  FROM candidates GROUP BY payment_id HAVING COUNT(DISTINCT journal_id)=1
)
UPDATE payments p SET journal_entry_id=u.journal_id FROM unique_sources u
WHERE p.id=u.payment_id AND p.journal_entry_id IS NULL;
