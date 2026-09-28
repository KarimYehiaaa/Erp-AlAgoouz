-- Migration: 084_seed_missing_automations_and_workflows.sql
-- Description: استعادة وإعادة زرع كافة وكلاء الأتمتة (19 وكيلاً) وعقد وروابط سير العمليات بعد التصفير، وضمان ديمومتها.

-- 1. إعادة زرع وتحديث كافة وكلاء الأتمتة الـ 19 القياسيين
INSERT INTO automations (key, name_ar, description_ar, category, trigger_type, cron_expression, is_enabled, channels, config)
VALUES
(
  'daily_sales_report',
  'تقرير الإغلاق والملخص المالي اليومي',
  'تجميع تلقائي لإجمالي مبيعات المحل، الأرباح، المصروفات، وأعلى الأصناف مبيعاً وإرسالها للمالك ليلاً.',
  'sales',
  'cron',
  '30 23 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"include_top_items": true, "include_expenses": true}'::jsonb
),
(
  'low_stock_alert',
  'إنذار نقص المخزون وخامات البن',
  'رصد الأصناف وخامات التحميص التي وصلت لحد إعادة الطلب وإرسال تنبيه للمسؤولين.',
  'inventory',
  'cron',
  '0 10,18 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"threshold_multiplier": 1.0}'::jsonb
),
(
  'void_invoice_alert',
  'كشف إلغاء الفواتير والعمليات الملغاة',
  'رصد فوري لأي فاتورة يتم إلغاؤها بعد إصدارها وإرسال تنبيه للإدارة لمكافحة التلاعب والاحتيال.',
  'security',
  'event',
  NULL,
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"min_amount_trigger": 0}'::jsonb
),
(
  'anti_fraud_sentinel',
  'كشف ومراقبة التلاعب المالي (Anti-Fraud)',
  'فحص دوري يومي للعمليات والفواتير الملغاة والخصومات الاستثنائية لآخر 24 ساعة لحماية إيرادات المحل.',
  'security',
  'cron',
  '0 23 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"max_discount_pct": 15}'::jsonb
),
(
  'large_discount_alert',
  'تنبيه الخصومات المرتفعة الاستثنائية',
  'مراقبة فورية لأي خصم يتجاوز 15% على المبيعات وتنبيه الإدارة للتحقق من هوامش الربح وصلاحيات الخصم.',
  'security',
  'event',
  NULL,
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"max_discount_pct": 15}'::jsonb
),
(
  'warehouse_balancing',
  'المناقلات الذكية وتوازن مخزون المحل',
  'تحليل السحب بين مخازن المحل واقتراح مناقلات البضاعة من المخزن ذي الفائض إلى المخزن المحتاج.',
  'inventory',
  'cron',
  '0 9 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"min_deficit_days": 3, "min_surplus_days": 15}'::jsonb
),
(
  'system_health',
  'فحص سلامة النظام وقاعدة البيانات',
  'فحص دوري لسرعة استجابة قاعدة البيانات واستقرار خدمات الخادم والتنبيه عند أي تأخير أو عطل.',
  'system',
  'cron',
  '0 */4 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{}'::jsonb
),
(
  'daily_backup_reminder',
  'فحص النسخ الاحتياطي وسلامة السيرفر',
  'مراقبة دورية لعمر آخر نسخة احتياطية والتأكد من قابلية الاستعادة ووجود ملفات النسخ السليمة.',
  'system',
  'cron',
  '0 22 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{}'::jsonb
),
(
  'supplier_payment_due_alert',
  'منبه استحقاق دفعات فواتير الموردين',
  'فحص ذكي لفواتير مشتريات البن والمستلزمات الآجلة وتنبيه الإدارة قبل موعد استحقاق الدفعات بـ 3 أيام لحماية السمعة الائتمانية والسيولة.',
  'sales',
  'cron',
  '0 11 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"days_before_due": 3}'::jsonb
),
(
  'daily_profit_margin_anomaly',
  'كاشف تراجع هوامش الأرباح اليومية',
  'مراقبة فورية لمتوسط هامش الربح الإجمالي اليومي وإرسال إنذار إذا انخفض الهامش عن النسبة المستهدفة بسبب الخصومات أو ارتفاع تكلفة الخامات.',
  'sales',
  'cron',
  '45 23 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"min_target_margin_pct": 28.0}'::jsonb
),
(
  'cashflow_risk_shield',
  'درع حماية السيولة والتدفقات النقدية',
  'تنبؤ استباقي بالرصيد النقدي والالتزامات القادمة لـ 30 يوماً وتنبيه الإدارة مبكراً عند توقع أي عجز في السيولة.',
  'sales',
  'cron',
  '0 10 * * 1',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"warning_threshold_days": 14}'::jsonb
),
(
  'shift_handover_reconciliation',
  'مطابقة عهدة الكاشير وإغلاق الورديات',
  'مطابقة النقدية المستلمة في درج الكاشير مع مبيعات الوردية المسجلة وتنبيه الإدارة عند وجود أي عجز أو زيادة نقدية.',
  'security',
  'event',
  NULL,
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"alert_threshold_egp": 10}'::jsonb
),
(
  'roastery_recipe_waste_guard',
  'حارس الهدر والفاقد لخامات التحميص والبار',
  'متابعة استهلاك خامات البن والحليب والمستلزمات ورصد حركات التالف والهدر غير الطبيعي لحماية التكاليف.',
  'inventory',
  'cron',
  '0 21 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"max_allowed_waste_pct": 3.0}'::jsonb
),
(
  'customer_loyalty_dormant_winback',
  'حملة استعادة وتنشيط العملاء المنقطعين',
  'رصد عملاء المحل الدائمين المنقطعين عن الشراء لأكثر من 30 يوماً واقتراح عروض نقاط ولاء لتشجيع عودتهم.',
  'sales',
  'cron',
  '0 14 * * 4',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"inactive_days_threshold": 30, "suggested_discount_pct": 10}'::jsonb
),
(
  'ai_copilot_assistant',
  'المساعد التحليلي الذكي Gemini Copilot',
  'تحليل ذكي يومي لمؤشرات أداء المبيعات والمخزون وتقديم توصيات تنفيذية سريعة لمدير المحل.',
  'system',
  'cron',
  '0 9 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"model": "gemini-flash"}'::jsonb
),
(
  'error_tracker_alert',
  'كاشف الأخطاء والإنذارات البرمجية',
  'رصد فوري للأخطاء البرمجية واستثناءات قاعدة البيانات وإرسال ملخص تشخيصي فوري لحماية استقرار السيرفر.',
  'security',
  'event',
  NULL,
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"severity_threshold": "MEDIUM"}'::jsonb
),
(
  'scheduled_cron_task',
  'مدير المهام والجدولة الزمنية',
  'إدارة ومتابعة كافة المهام الدورية المجدولة والتحقق من نبض وعمل محرك الجدولة التلقائي.',
  'system',
  'cron',
  '0 8 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{}'::jsonb
),
(
  'telegram_notifier',
  'وكيل إشعارات تليجرام الفوري',
  'فحص قنوات الإشعارات الفورية والتأكد من اتصال بوت تليجرام وجاهزيته لإرسال التقارير لشات المالك.',
  'system',
  'cron',
  '0 10 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{}'::jsonb
),
(
  'webhook_listener',
  'مستمع الـ Webhook للطلبات الخارجية',
  'مراقبة مسارات استقبال الطلبات والأحداث الخارجية وتأكيد جاهزية نقاط الـ Webhook الآمنة.',
  'system',
  'cron',
  '0 12 * * *',
  TRUE,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"secret_token_from_env": true}'::jsonb
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

-- 2. إعادة زرع عقد خريطة سير العمليات (Workflows Nodes) إن كانت فارغة
INSERT INTO workflows_nodes (id, type, label, label_ar, group_name, settings, position_x, position_y, is_active)
VALUES
  (1, 'agent', 'Cashier POS',        'كاشير نقطة البيع',     'operations',   '{"icon": "monitor", "color": "#10b981"}'::jsonb,   -220, -120, true),
  (2, 'agent', 'Main Warehouse',     'المخزن الرئيسي',       'inventory',    '{"icon": "warehouse", "color": "#3b82f6"}'::jsonb,   220,  -60, true),
  (3, 'agent', 'Recipe Engine',      'محرك الوصفات',         'production',   '{"icon": "flask", "color": "#f59e0b"}'::jsonb,        0,   120, true),
  (4, 'agent', 'Telegram Bot',       'وكيل تليجرام',         'notifications', '{"icon": "send", "color": "#8b5cf6"}'::jsonb,        320,  160, true),
  (5, 'agent', 'AI Copilot (Gemini)','المساعد الذكي Gemini',  'ai',           '{"icon": "brain", "color": "#ec4899"}'::jsonb,       -320,  160, true),
  (6, 'agent', 'System Alerts',      'إشعارات النظام',       'notifications', '{"icon": "bell", "color": "#ef4444"}'::jsonb,         320, -160, true),
  (7, 'trigger', 'Manual Daily Entry',    'إدخال يومي يدوي',      'sales',      '{"icon": "edit", "color": "#6b7280", "rule": "RULE_1_MANUAL"}'::jsonb,      -420, -220, true),
  (8, 'trigger', 'Wholesale Invoice',     'فاتورة جملة',          'sales',      '{"icon": "file-text", "color": "#6b7280", "rule": "RULE_2_WHOLESALE"}'::jsonb,  -420,    0, true),
  (9, 'trigger', 'Cashier Report Import', 'استيراد تقرير الكاشير','sales',      '{"icon": "upload", "color": "#6b7280", "rule": "RULE_3_CASHIER"}'::jsonb,   -420,  220, true),
  (10, 'action', 'Direct Stock Deduction', 'خصم مخزون مباشر',      'inventory',  '{"icon": "minus-circle", "color": "#14b8a6"}'::jsonb,  0, -220, true),
  (11, 'action', 'Recipe Calculation',     'حساب الوصفات والتفكيك','production', '{"icon": "calculator", "color": "#f97316"}'::jsonb,    0,    0, true),
  (12, 'action', 'Warehouse Stock Update', 'تحديث مخزون المخزن',   'inventory',  '{"icon": "refresh-cw", "color": "#0ea5e9"}'::jsonb,   220,  220, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_ar = EXCLUDED.label_ar,
  group_name = EXCLUDED.group_name,
  settings = EXCLUDED.settings,
  position_x = EXCLUDED.position_x,
  position_y = EXCLUDED.position_y,
  is_active = EXCLUDED.is_active;

SELECT setval('workflows_nodes_id_seq', (SELECT COALESCE(MAX(id), 1) FROM workflows_nodes));

-- 3. إعادة زرع روابط سير العمليات (Workflows Edges) إن كانت مفقودة
INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
VALUES
  (7, 10, 'sale_type = manual', 'تسجيل عادي'),
  (10, 2, NULL, 'خصم من المخزن'),
  (8, 10, 'sale_type = wholesale', 'جملة → خصم مباشر'),
  (9, 11, 'sale_type = cashier_import', 'يمر عبر محرك الوصفات إلزامياً'),
  (11, 3, NULL, 'تفكيك وصفات ثم خصم'),
  (3, 12, NULL, 'تحديث رصيد المخزن'),
  (2, 6, 'on_low_stock', 'تنبيه نقص'),
  (6, 4, 'always', 'إشعار تليجرام'),
  (4, 5, 'command = /ai', 'استعلام ذكي'),
  (5, 2, 'read_only', 'قراءة بيانات المخزون')
ON CONFLICT (source_node_id, target_node_id) DO NOTHING;

-- 4. التأكد من منح صلاحيات الأتمتة للأدوار الإدارية
INSERT INTO permissions (code, name_ar, module) VALUES
  ('automation.view', 'عرض مركز الأتمتة وسجلات التشغيل', 'automation'),
  ('automation.manage', 'إدارة وتعديل وتشغيل مسارات الأتمتة', 'automation')
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  module = EXCLUDED.module;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('owner', 'admin', 'sys_admin', 'manager')
  AND p.module = 'automation'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, p.id
FROM permissions p
WHERE p.module = 'automation'
ON CONFLICT DO NOTHING;
