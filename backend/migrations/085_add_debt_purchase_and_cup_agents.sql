-- Migration: 085_add_debt_purchase_and_cup_agents.sql
-- Description: إضافة 3 وكلاء أذكياء متخصصين: وكيل المديونيات والائتمان، وكيل المشتريات وتوريد المخزن، ومدقق استهلاك الأكواب وأكياس البن.

-- 1. تسجيل الوكلاء الثلاثة في جدول automations
INSERT INTO automations (key, name_ar, description_ar, category, trigger_type, cron_expression, is_enabled, channels, config)
VALUES
(
  'debt_credit_sentinel',
  'حارس المديونيات والائتمان لعملاء وموردي المحل',
  'مراقبة مديونيات عملاء الجملة والتجزئة، ورصد العملاء المتجاوزين للحد الائتماني، وفحص فواتير الموردين المستحقة لحماية التدفقات النقدية.',
  'sales',
  'cron',
  '0 12 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"check_credit_limits": true, "overdue_days_threshold": 30}'::jsonb
),
(
  'purchase_stock_ingestion_guard',
  'حارس المشتريات وتوريد المخزن وتغير التكلفة',
  'التأكد من ترحيل فواتير المشتريات إلى رصيد وحركات المخزن آلياً، ومراقبة تغير أسعار شراء الخامات والبن وتنبيه الإدارة عند ارتفاع التكلفة.',
  'inventory',
  'cron',
  '0 15 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"cost_spike_threshold_pct": 5.0}'::jsonb
),
(
  'coffee_bags_cups_reconciler',
  'مدقق استهلاك الأكواب ومبيعات أكياس البن',
  'مطابقة عدد الأكواب الورقية والبلاستيكية المصروفة من المخزن مع عدد المشروبات المباعة في الكاشير، وتدقيق مبيعات أكياس البن بالكيلو لمنع الهدر والتسريب.',
  'production',
  'cron',
  '0 22 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"max_cup_variance_pct": 5.0}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  category = EXCLUDED.category,
  trigger_type = EXCLUDED.trigger_type,
  cron_expression = EXCLUDED.cron_expression,
  is_enabled = EXCLUDED.is_enabled,
  channels = EXCLUDED.channels,
  config = EXCLUDED.config,
  updated_at = NOW();

-- 2. إضافة العقد الثلاث في خريطة سير العمليات (workflows_nodes)
INSERT INTO workflows_nodes (id, type, label, label_ar, group_name, settings, position_x, position_y, is_active)
VALUES
  (13, 'agent', 'Debt & Credit Sentinel',      'وكيل المديونيات والائتمان',      'sales',      '{"icon": "credit-card", "color": "#f59e0b"}'::jsonb, -220,   60, true),
  (14, 'agent', 'Purchase Ingestion Guard',    'وكيل المشتريات وتوريد المخزن',  'inventory',  '{"icon": "truck",       "color": "#10b981"}'::jsonb,    0,  -60, true),
  (15, 'agent', 'Coffee Bags & Cups Counter',  'وكيل أكياس البن ومطابقة الأكواب','production', '{"icon": "coffee",      "color": "#8b5cf6"}'::jsonb,  220,   60, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_ar = EXCLUDED.label_ar,
  group_name = EXCLUDED.group_name,
  settings = EXCLUDED.settings,
  position_x = EXCLUDED.position_x,
  position_y = EXCLUDED.position_y,
  is_active = EXCLUDED.is_active;

SELECT setval('workflows_nodes_id_seq', (SELECT COALESCE(MAX(id), 1) FROM workflows_nodes));

-- 3. إضافة الروابط التشغيلية للوكلاء الجدد في خريطة العمليات (workflows_edges)
INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
VALUES
  (8, 13, 'is_credit = true', 'بيع آجل / فواتير جملة'),
  (13, 6, 'limit_breached', 'تنبيه تجاوز الائتمان'),
  (14, 2, NULL, 'تحديث رصيد المخزن آلياً'),
  (14, 6, 'on_cost_increase', 'إنذار ارتفاع سعر التكلفة'),
  (1, 15, NULL, 'مبيعات الكاشير (مشروبات + أكياس)'),
  (15, 2, NULL, 'مطابقة المنصرف من الأكواب والبن'),
  (15, 6, 'variance > 5%', 'إنذار هدر الأكواب/البن')
ON CONFLICT (source_node_id, target_node_id) DO NOTHING;
