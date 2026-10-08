-- Initial/edit receipts belong to the document posting, unlike standalone
-- collections linked by 099. Do not reinterpret unresolved FIFO allocations.
WITH documents AS (
  SELECT p.id AS payment_id,
    CASE WHEN p.reference_type='sale' THEN p.reference_id ELSE i.sale_id END AS sale_id
  FROM payments p LEFT JOIN invoices i ON p.reference_type='invoice' AND i.id=p.reference_id
  WHERE p.journal_entry_id IS NULL AND p.amount > 0
    AND LOWER(TRIM(COALESCE(p.payment_method,'cash'))) <> 'credit'
    AND (
      (p.reference_type='sale' AND p.payment_number ~ ('^PAY-' || p.reference_id::text || '-[0-9a-f]+$'))
      OR (p.reference_type='invoice' AND p.payment_number ~ ('^PAY-INV' || p.reference_id::text || '-[0-9]+$'))
    )
), sources AS (
  SELECT d.payment_id, MIN(je.id) AS journal_id
  FROM documents d JOIN journal_entries je
    ON je.reference_type='sale' AND je.reference_id::text=d.sale_id::text
    AND je.idempotency_key='sale:' || d.sale_id::text
  GROUP BY d.payment_id HAVING COUNT(DISTINCT je.id)=1
)
UPDATE payments p SET journal_entry_id=s.journal_id FROM sources s
WHERE p.id=s.payment_id AND p.journal_entry_id IS NULL;
