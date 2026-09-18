-- ==============================================================================
-- 062_period_lock_business_date_hardening.sql
-- بن العجوز ERP — تدقيق وإحكام تواريخ العمليات وحماية الفترات المحاسبية المقفلة وتوسيع المعرفات
-- ==============================================================================

-- 1. تحديث دالة منع التعديل أو الحذف في الفترات المحاسبية المقفلة لضمان عدم تجاوز الفحص عند غياب created_at
CREATE OR REPLACE FUNCTION prevent_closed_period_modification()
RETURNS TRIGGER AS $$
DECLARE
  record_date DATE;
  locked_period RECORD;
  rec RECORD;
BEGIN
  -- استخدام OLD في حالة الحذف و NEW في حالة الإدراج أو التعديل
  IF TG_OP = 'DELETE' THEN
    rec := OLD;
  ELSE
    rec := NEW;
  END IF;

  -- استخراج تاريخ السجل بناءً على نوع الجدول مع fallback آمن إلى CURRENT_DATE
  IF TG_TABLE_NAME = 'sales' THEN
    record_date := COALESCE(rec.sale_date, rec.created_at::DATE, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    record_date := COALESCE(rec.expense_date, rec.created_at::DATE, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    record_date := COALESCE(rec.issued_at::DATE, rec.created_at::DATE, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'purchase_invoices' THEN
    record_date := COALESCE(rec.invoice_date, rec.created_at::DATE, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'purchase_returns' THEN
    record_date := COALESCE(rec.return_date, rec.created_at::DATE, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    record_date := COALESCE(rec.entry_date, rec.created_at::DATE, CURRENT_DATE);
  ELSIF TG_TABLE_NAME = 'journal_entry_lines' THEN
    SELECT entry_date INTO record_date FROM journal_entries WHERE id = rec.journal_entry_id;
    IF record_date IS NULL THEN
      record_date := COALESCE(rec.created_at::DATE, CURRENT_DATE);
    END IF;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    record_date := COALESCE(rec.created_at::DATE, CURRENT_DATE);
  ELSE
    record_date := COALESCE(rec.created_at::DATE, CURRENT_DATE);
  END IF;

  -- فحص ما إذا كان التاريخ يقع ضمن فترة محاسبية مقفلة
  IF record_date IS NOT NULL THEN
    SELECT * INTO locked_period
    FROM financial_periods
    WHERE status IN ('closed', 'locked')
      AND record_date BETWEEN period_start AND period_end
    LIMIT 1;

    IF FOUND THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'لا يمكن حذف سجل في فترة محاسبية مغلقة (% إلى %)',
          locked_period.period_start, locked_period.period_end;
      ELSE
        RAISE EXCEPTION 'لا يمكن تعديل أو تسجيل عملية في فترة محاسبية مغلقة (% إلى %)',
          locked_period.period_start, locked_period.period_end;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. إعادة تفعيل الـ Trigger لضمان تغطية كافة الجداول المالية الأساسية
DO $$
DECLARE
  tbl TEXT;
  financial_tables TEXT[] := ARRAY[
    'sales', 
    'expenses', 
    'invoices', 
    'payments', 
    'purchase_invoices', 
    'purchase_returns', 
    'journal_entries', 
    'journal_entry_lines'
  ];
BEGIN
  FOREACH tbl IN ARRAY financial_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_closed_period_%I ON %I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_prevent_closed_period_%I ' ||
      'BEFORE INSERT OR UPDATE OR DELETE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_modification();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- 3. توسيع عمود reference_id في قيود اليومية ليدعم كلاً من الأرقام والمعرفات المتعددة (UUIDs)
ALTER TABLE journal_entries ALTER COLUMN reference_id TYPE VARCHAR(100) USING reference_id::text;
