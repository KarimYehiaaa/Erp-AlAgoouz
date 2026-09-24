-- ==============================================================================
-- 078_drop_manager_override_fkeys.sql
-- بن العجوز ERP — إسقاط قيود المفتاح الأجنبي لتوكنات تجاوز المدير المؤقتة
-- للسماح بتسجيل توكنات الكاشير الوهمية في الاختبارات والعمليات العنقودية دون تعارض
-- ==============================================================================

ALTER TABLE manager_override_tokens DROP CONSTRAINT IF EXISTS manager_override_tokens_manager_user_id_fkey;
ALTER TABLE manager_override_tokens DROP CONSTRAINT IF EXISTS manager_override_tokens_cashier_user_id_fkey;
