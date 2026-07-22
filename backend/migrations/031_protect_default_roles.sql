-- =====================================================
-- Migration 031: حماية المناصب الافتراضية لمنع تعطيل الـ API
-- =====================================================

-- دالة التريجر للتحقق ومنع حذف أو تعديل الأسماء الإنجليزية للأدوار الأساسية
CREATE OR REPLACE FUNCTION protect_default_roles_func()
RETURNS TRIGGER AS $$
BEGIN
    -- التحقق من الأدوار الحساسة المعتمد عليها الكود
    IF OLD.name IN ('admin', 'manager', 'cashier', 'warehouse') THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'لا يمكن حذف المناصب الافتراضية للنظام (admin, manager, cashier, warehouse) للمحافظة على سلامة تشغيل السيستم.';
        ELSIF TG_OP = 'UPDATE' AND NEW.name <> OLD.name THEN
            RAISE EXCEPTION 'لا يمكن تعديل الاسم الإنجليزي للمناصب الافتراضية للنظام لتجنب تعطل صلاحيات الـ API.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ربط التريجر بجدول الأدوار قبل الحذف أو التعديل
DROP TRIGGER IF EXISTS trg_protect_default_roles ON roles;
CREATE TRIGGER trg_protect_default_roles
BEFORE UPDATE OR DELETE ON roles
FOR EACH ROW EXECUTE FUNCTION protect_default_roles_func();
