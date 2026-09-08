-- Migration: 054_payments_soft_void.sql
-- [AUDIT FIX M2] إبطال الدفعات بدل حذفها (Soft-void payments ledger)
-- المشكلة: كان تقليص المدفوع عند تعديل بيع يحذف صفوف الدفعات نهائياً،
-- فيفقد دفتر النقدية أثر حركة نقدية حقيقية حدثت فعلاً — ثغرة محاسبية ومساءلة.
-- الحل: نمط مطابق لـ stock_movements.voided_at (ميجريشن 047):
--   الدفعة الملغاة تبقى مع voided_at ولا تُحتسب في أي مجموع مالي.
-- كل استعلامات SUM في الكود تُحدَّث لتستثني voided_at IS NOT NULL.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

COMMENT ON COLUMN payments.voided_at IS
  'وقت إبطال الدفعة — الدفعات المبطلة لا تُحتسب في الأرصدة ولا التقارير، وتُحفظ لسجل التدقيق';

-- فهرس جزئي للأداء: أغلب القراءات المالية تخص حركات نشطة فقط
CREATE INDEX IF NOT EXISTS idx_payments_ref_active
  ON payments (reference_type, reference_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_created_active
  ON payments (created_at)
  WHERE voided_at IS NULL;

-- أي دفعات حُذفت سابقاً غير قابلة للاسترجاع؛ من الآن فصاعداً يُحفظ كامل السجل.
