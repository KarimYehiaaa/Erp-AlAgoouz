-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 041b: إصلاح trigger الفترات المحاسبية (أعمدة تاريخ غير موجودة)
-- ═════════════════════════════════════════════════════════════════════════════
-- الهجرة 040 أنشأت دالة تشير إلى أعمدة غير موجودة:
--   payments: NEW.payment_date (الجدول لا يحتوي على payment_date — انظر 001_schema.sql)
--   invoices: NEW.invoice_date (العمود الصحيح هو issued_at)
-- مما يفشل أي INSERT/UPDATE على الجداول المتأثرة بالخطأ:
--   record "new" has no field "payment_date"
-- هذه الهجرة تستبدل الدالة بنسخة صحيحة (تعمل أيضاً على القواعد الجديدة).

CREATE OR REPLACE FUNCTION prevent_closed_period_modification()
RETURNS TRIGGER AS $$
DECLARE
  record_date DATE;
  locked_period RECORD;
BEGIN
  -- تحديد تاريخ السجل
  IF TG_TABLE_NAME = 'sales' THEN
    record_date := COALESCE(NEW.sale_date, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    record_date := COALESCE(NEW.expense_date, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    record_date := COALESCE(NEW.issued_at::DATE, NEW.created_at::DATE);
  ELSE
    -- payments وجميع الجداول الأخرى: لا يوجد عمود تاريخ مخصص
    record_date := NEW.created_at::DATE;
  END IF;

  -- البحث عن فترة مغلقة تشمل هذا التاريخ
  SELECT * INTO locked_period
  FROM financial_periods
  WHERE status IN ('closed', 'locked')
    AND record_date BETWEEN period_start AND period_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'لا يمكن تعديل سجل في فترة محاسبية مغلقة (% إلى %)',
      locked_period.period_start, locked_period.period_end;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
