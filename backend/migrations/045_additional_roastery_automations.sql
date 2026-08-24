-- Migration: 045_additional_roastery_automations.sql
-- Description: إضافة مسارات أتمتة تشغيلية موسعة لنظام بن العجوز (مطابقة الشيفت، حارس الهدر، استحقاقات الموردين، استعادة العملاء، وهوامش الأرباح)

INSERT INTO automations (key, name_ar, description_ar, category, trigger_type, cron_expression, is_enabled, channels, config)
VALUES
(
  'shift_handover_reconciliation',
  'مطابقة عهدة الكاشير وإغلاق الشيفت اللحظي',
  'مطابقة فورية للنقدية المستلمة في درج الكاشير مع إجمالي مبيعات الشيفت، مع إرسال إنذار فوري للإدارة عند وجود أي عجز أو زيادة غير مبررة.',
  'security',
  'event',
  NULL,
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"alert_threshold_egp": 20}'::jsonb
),
(
  'roastery_recipe_waste_guard',
  'حارس الهدر والفاقد لخامات التحميص والبار',
  'مقارنة الاستهلاك الفعلي لخامات البن والحليب والمستلزمات مع الاستهلاك المعياري للوصفات، وإرسال تنبيه إذا تجاوزت نسبة الهدر 3%.',
  'inventory',
  'cron',
  '0 22 * * *',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"max_allowed_waste_pct": 3.0}'::jsonb
),
(
  'supplier_payment_due_alert',
  'منبه استحقاق دفعات فواتير الموردين',
  'فحص ذكي لفواتير مشتريات البن والمستلزمات الآجلة وتنبيه الإدارة قبل موعد استحقاق الدفعات بـ 3 أيام لحماية السمعة الائتمانية والسيولة.',
  'sales',
  'cron',
  '0 11 * * *',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"days_before_due": 3}'::jsonb
),
(
  'customer_loyalty_dormant_winback',
  'حملة استعادة وتنشيط العملاء المنقطعين',
  'رصد عملاء المبيعات والقهوة الذين لم يسجلوا أي حركة شراء خلال آخر 30 يوماً وتجهيز عروض ترويجية وخصومات حصرية لتشجيع عودتهم.',
  'sales',
  'cron',
  '0 12 * * 0',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"inactive_days_threshold": 30, "suggested_discount_pct": 10}'::jsonb
),
(
  'daily_profit_margin_anomaly',
  'كاشف تراجع هوامش الأرباح اليومية',
  'مراقبة فورية لمتوسط هامش الربح الإجمالي اليومي وإرسال إنذار إذا انخفض الهامش عن النسبة المستهدفة بسبب الخصومات أو ارتفاع تكلفة الخامات.',
  'sales',
  'cron',
  '30 23 * * *',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"min_target_margin_pct": 28.0}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  category = EXCLUDED.category;
