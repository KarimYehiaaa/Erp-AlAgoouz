-- Migration: 083_automation_retry_dedup.sql
-- Description: إزالة ازدواج مهمة التقرير اليومي نهائيًا وإضافة أعمدة إعادة المحاولة للمجدول.

-- (أ) نقل أي إعدادات مخصصة من daily_summary_report إلى daily_sales_report قبل الحذف
-- (مفاتيح الصف القديم تُدمج فوق مفاتيح الصف الأساسي كي لا يُفقد أي تخصيص، مع الاحتفاظ
-- بآخر وقت تشغيل أحدث في الصف الأساسي كي لا يعيد المجدول إرسال التقرير مرتين).
UPDATE automations AS canonical
SET config = canonical.config || legacy.config,
    last_run_at = GREATEST(canonical.last_run_at, legacy.last_run_at),
    updated_at = NOW()
FROM automations AS legacy
WHERE legacy.key = 'daily_summary_report'
  AND canonical.key = 'daily_sales_report';

-- نقل سجل تنفيذ الصف القديم إلى الصف الأساسي حفاظًا على التاريخ (المرجع CASCADE وإلا فُقد).
UPDATE automation_logs AS log
SET automation_id = canonical.id
FROM automations AS legacy, automations AS canonical
WHERE legacy.key = 'daily_summary_report'
  AND canonical.key = 'daily_sales_report'
  AND log.automation_id = legacy.id;

-- حذف الصف المكرر ذاته (مشروط بوجود الصف الأساسي كي لا يُفقد التقرير كليًا).
DELETE FROM automations AS legacy
USING automations AS canonical
WHERE legacy.key = 'daily_summary_report'
  AND canonical.key = 'daily_sales_report';

-- (ب) أعمدة إعادة المحاولة: عدّاد المحاولات وموعد المحاولة التالية (يحدّثهما معالج الأتمتة عند الفشل،
-- ويقرأهما المجدول لإعادة تشغيل المهام الفاشلة حتى 3 محاولات).
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
