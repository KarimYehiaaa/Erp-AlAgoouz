-- 038_payment_refund_tracking.sql
-- تتبع مدفوعات المرتجعات: عند إرجاع عملية بيع نُعلّم مدفوعاتها كمستردة (refunded_at)
-- بدل حذفها، للحفاظ على سجل الدفع والمرتجعات مع استبعادها من التقارير النقدية.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ NULL;

-- فهرس جزئي لتسريع استبعاد المدفوعات المستردة من التقارير
CREATE INDEX IF NOT EXISTS idx_payments_refunded_at
  ON payments(refunded_at)
  WHERE refunded_at IS NOT NULL;
