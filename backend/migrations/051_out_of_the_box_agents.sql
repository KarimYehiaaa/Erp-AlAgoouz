-- Migration: 051_out_of_the_box_agents.sql
-- Description: تسجيل كافة الوكلاء القياسيين (Error Tracker, Daily Summary, Webhook Listener, Cron Agent, Telegram Notifier, AI Copilot) وضبط بيانات تليجرام

INSERT INTO automations (key, name_ar, description_ar, category, trigger_type, cron_expression, is_enabled, channels, config)
VALUES
(
  'error_tracker_alert',
  'كاشف الأخطاء والإنذارات البرمجية',
  'وكيل رصد الأخطاء البرمجية واستثناءات قاعدة البيانات وإرسال تنبيه تشخيصي فوري.',
  'security',
  'event',
  NULL,
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"bot_token": "8903108709:AAGkPHf9zHkwdrzUR9d6uz-n4k4_F3LP_uI", "chat_id": "1092703744", "severity_threshold": "MEDIUM"}'::jsonb
),
(
  'daily_summary_report',
  'تقرير الإغلاق والملخص المالي اليومي',
  'وكيل تجميع إجمالي المبيعات، الأرباح، المصروفات، وتشغيل المحمصة وإرسالها ليلاً.',
  'sales',
  'cron',
  '30 23 * * *',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"bot_token": "8903108709:AAGkPHf9zHkwdrzUR9d6uz-n4k4_F3LP_uI", "chat_id": "1092703744", "include_top_items": true}'::jsonb
),
(
  'webhook_listener',
  'مستمع الـ Webhook للطلبات الخارجية',
  'وكيل استقبال الأحداث والطلبات من المتاجر الإلكترونية أو الأنظمة الخارجية ونقلها للـ ERP.',
  'system',
  'event',
  NULL,
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"bot_token": "8903108709:AAGkPHf9zHkwdrzUR9d6uz-n4k4_F3LP_uI", "chat_id": "1092703744", "secret_token": "alagoouz_wh_secret_2026"}'::jsonb
),
(
  'scheduled_cron_task',
  'مدير المهام والجدولة الزمنية',
  'وكيل إدارة وتنسيق المهام الدورية والتحقق من سلامة تشغيل المجدول التلقائي.',
  'system',
  'cron',
  '0 8 * * *',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"bot_token": "8903108709:AAGkPHf9zHkwdrzUR9d6uz-n4k4_F3LP_uI", "chat_id": "1092703744"}'::jsonb
),
(
  'telegram_notifier',
  'وكيل إشعارات تليجرام الفوري',
  'وكيل إرسال التقارير والرسائل المنسقة بصيغة HTML التفاعلية إلى شات المالك.',
  'system',
  'event',
  NULL,
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"bot_token": "8903108709:AAGkPHf9zHkwdrzUR9d6uz-n4k4_F3LP_uI", "chat_id": "1092703744"}'::jsonb
),
(
  'ai_copilot_assistant',
  'وكيل التدقيق والتحليل الذكي Gemini',
  'وكيل التحليل المالي واستخراج مؤشرات الأداء والرد على استفسارات المالك على تليجرام.',
  'system',
  'event',
  NULL,
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"bot_token": "8903108709:AAGkPHf9zHkwdrzUR9d6uz-n4k4_F3LP_uI", "chat_id": "1092703744", "model": "gemini-flash"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  config = EXCLUDED.config,
  channels = EXCLUDED.channels,
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  updated_at = NOW();

-- تحديث الـ Bot Token والـ Chat ID لكافة الأتمتة المسجلة لضمان الجاهزية التامة
UPDATE automations
SET config = jsonb_set(
  jsonb_set(COALESCE(config, '{}'::jsonb), '{bot_token}', '"8903108709:AAGkPHf9zHkwdrzUR9d6uz-n4k4_F3LP_uI"'::jsonb),
  '{chat_id}',
  '"1092703744"'::jsonb
)
WHERE config->>'bot_token' IS NULL OR config->>'bot_token' = '';
