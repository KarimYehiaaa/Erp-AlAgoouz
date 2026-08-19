-- Migration: 044_advanced_automations.sql
-- Description: إضافة أتمتة المناقلات الذكية بين الفروع ودرع حماية التدفقات النقدية

INSERT INTO automations (key, name_ar, description_ar, category, trigger_type, cron_expression, is_enabled, channels, config)
VALUES
(
  'branch_stock_balancing',
  'المناقلات الذكية وتوازن مخزون الفروع',
  'تحليل ذكي لسرعة مبيعات الأصناف في الفروع واقتراح مناقلات البضاعة من الفروع الراكدة إلى الفروع النشطة لتفادي الشراء الجديد.',
  'inventory',
  'cron',
  '0 9 * * *',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"min_deficit_days": 3, "min_surplus_days": 15}'::jsonb
),
(
  'cashflow_risk_shield',
  'درع حماية السيولة والتدفقات النقدية',
  'تنبؤ استباقي بالعجز المالي ومقارنة الالتزامات القادمة (موردين + رواتب + إيجارات) مع الإيرادات المتوقعة لـ 14 و 30 يوماً.',
  'sales',
  'cron',
  '0 10 * * 1',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"warning_threshold_days": 14}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  category = EXCLUDED.category;
