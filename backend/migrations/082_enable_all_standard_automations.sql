-- Migration: 082_enable_all_standard_automations.sql
-- Description: تفعيل وتوصيل كافة مهام ووكلاء الأتمتة المتبقية (error_tracker, scheduled_cron, telegram_notifier, webhook_listener)

-- 1. تنظيف أي أوصاف قديمة تحتوي على عبارة موقوف
UPDATE automations
SET description_ar = TRIM(
      REPLACE(
        REPLACE(description_ar, E'\nموقوف: لا يوجد معالج تنفيذ تلقائي موصول لهذه المهمة.', ''),
        'موقوف: لا يوجد معالج تنفيذ تلقائي موصول لهذه المهمة.',
        ''
      )
    ),
    updated_at = NOW()
WHERE description_ar LIKE '%موقوف: لا يوجد معالج تنفيذ تلقائي موصول لهذه المهمة.%';

-- 2. تحديث وتفعيل الوكلاء الأربعة
UPDATE automations
SET name_ar = 'كاشف الأخطاء والإنذارات البرمجية',
    description_ar = 'رصد فوري للأخطاء البرمجية واستثناءات قاعدة البيانات وإرسال ملخص تشخيصي فوري لحماية استقرار السيرفر.',
    category = 'security',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'error_tracker_alert';

UPDATE automations
SET name_ar = 'مدير المهام والجدولة الزمنية',
    description_ar = 'إدارة ومتابعة كافة المهام الدورية المجدولة والتحقق من نبض وعمل محرك الجدولة التلقائي.',
    category = 'system',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'scheduled_cron_task';

UPDATE automations
SET name_ar = 'وكيل إشعارات تليجرام الفوري',
    description_ar = 'فحص قنوات الإشعارات الفورية والتأكد من اتصال بوت تليجرام وجاهزيته لإرسال التقارير لشات المالك.',
    category = 'system',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'telegram_notifier';

UPDATE automations
SET name_ar = 'مستمع الـ Webhook للطلبات الخارجية',
    description_ar = 'مراقبة مسارات استقبال الطلبات والأحداث الخارجية وتأكيد جاهزية نقاط الـ Webhook الآمنة.',
    category = 'system',
    is_enabled = TRUE,
    updated_at = NOW()
WHERE key = 'webhook_listener';
