-- Migration: 051_out_of_the_box_agents.sql
-- Description: تسجيل الوكلاء القياسيين. بيانات الاعتماد تُقرأ وقت التشغيل من متغيرات البيئة فقط.

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
  '{"severity_threshold": "MEDIUM"}'::jsonb
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
  '{"include_top_items": true}'::jsonb
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
  '{"secret_token_from_env": true}'::jsonb
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
  '{}'::jsonb
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
  '{}'::jsonb
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
  '{"model": "gemini-flash"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  config = EXCLUDED.config,
  channels = EXCLUDED.channels,
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  updated_at = NOW();

-- Telegram credentials are intentionally not persisted in automation configs.
