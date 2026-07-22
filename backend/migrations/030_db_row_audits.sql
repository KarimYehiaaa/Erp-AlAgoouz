-- =====================================================
-- Migration 030: نظام التدقيق التاريخي على مستوى الجداول (Row-Level Database Audits)
-- =====================================================

-- 1. إنشاء جدول سجل التدقيق التاريخي لقاعدة البيانات
CREATE TABLE IF NOT EXISTS db_row_audits (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    row_id INT,
    old_data JSONB,
    new_data JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء كشافات لتحسين أداء استرجاع سجلات التدقيق
CREATE INDEX IF NOT EXISTS idx_db_row_audits_table ON db_row_audits(table_name);
CREATE INDEX IF NOT EXISTS idx_db_row_audits_row ON db_row_audits(table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_db_row_audits_date ON db_row_audits(changed_at);

-- 2. دالة ومنع تعديل أو حذف سجلات التدقيق لحماية النزاهة المالية للمؤسسة
CREATE OR REPLACE FUNCTION protect_db_row_audits()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'يمنع منعاً باتاً تعديل أو حذف سجلات التدقيق التاريخية لحماية النزاهة المالية والتشغيلية للمؤسسة.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_db_row_audits ON db_row_audits;
CREATE TRIGGER trg_protect_db_row_audits
BEFORE UPDATE OR DELETE ON db_row_audits
FOR EACH ROW EXECUTE FUNCTION protect_db_row_audits();

-- 3. دالة معالجة التريجر العامة لتسجيل تغييرات الصفوف
CREATE OR REPLACE FUNCTION audit_row_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB := NULL;
    v_new JSONB := NULL;
    v_row_id INT := NULL;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        -- لتفادي تسجيل الحركات التي لم تغير أي بيانات
        IF (v_old = v_new) THEN
            RETURN NEW;
        END IF;
        
        -- استخراج معرف الصف إذا كان موجوداً
        BEGIN
            v_row_id := OLD.id;
        EXCEPTION WHEN OTHERS THEN
            v_row_id := NULL;
        END;
    ELSIF (TG_OP = 'DELETE') THEN
        v_old := to_jsonb(OLD);
        BEGIN
            v_row_id := OLD.id;
        EXCEPTION WHEN OTHERS THEN
            v_row_id := NULL;
        END;
    ELSIF (TG_OP = 'INSERT') THEN
        v_new := to_jsonb(NEW);
        BEGIN
            v_row_id := NEW.id;
        EXCEPTION WHEN OTHERS THEN
            v_row_id := NULL;
        END;
    END IF;

    INSERT INTO db_row_audits (table_name, action, row_id, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, TG_OP, v_row_id, v_old, v_new, current_user);

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. إعداد التريجرات على الجداول الحساسة والمالية
-- أ. المبيعات
DROP TRIGGER IF EXISTS trg_audit_sales ON sales;
CREATE TRIGGER trg_audit_sales
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

-- ب. تفاصيل الفواتير
DROP TRIGGER IF EXISTS trg_audit_sale_items ON sale_items;
CREATE TRIGGER trg_audit_sale_items
AFTER INSERT OR UPDATE OR DELETE ON sale_items
FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

-- ج. أسعار وتفاصيل المنتجات
DROP TRIGGER IF EXISTS trg_audit_products ON products;
CREATE TRIGGER trg_audit_products
AFTER INSERT OR UPDATE OR DELETE ON products
FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

-- د. كميات المخزون
DROP TRIGGER IF EXISTS trg_audit_inventory ON inventory;
CREATE TRIGGER trg_audit_inventory
AFTER INSERT OR UPDATE OR DELETE ON inventory
FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

-- هـ. دفعات الفواتير
DROP TRIGGER IF EXISTS trg_audit_payments ON payments;
CREATE TRIGGER trg_audit_payments
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION audit_row_changes();

-- و. المصروفات العامة
DROP TRIGGER IF EXISTS trg_audit_expenses ON expenses;
CREATE TRIGGER trg_audit_expenses
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION audit_row_changes();
