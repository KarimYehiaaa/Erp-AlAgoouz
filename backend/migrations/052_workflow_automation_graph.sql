-- Migration: 052_workflow_automation_graph.sql
-- Description: إنشاء جداول الرسم البياني التفاعلي لمحرك الأتمتة (Workflow Graph)
--   - workflows_nodes: عقد الأتمتة (وكلاء، مشغلات، عمليات)
--   - workflows_edges: الروابط بين العقد (مع شروط اختيارية)
--   - telegram_logs: سجل محادثات بوت تليجرام والذكاء الاصطناعي

-- ══════════════════════════════════════════════════════════
-- 1. جدول العقد (Workflow Nodes)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workflows_nodes (
  id SERIAL PRIMARY KEY,
  type VARCHAR(32) NOT NULL CHECK (type IN ('agent', 'trigger', 'action')),
  label VARCHAR(255) NOT NULL,
  label_ar VARCHAR(255),
  group_name VARCHAR(64) NOT NULL DEFAULT 'general',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_nodes_type ON workflows_nodes(type);
CREATE INDEX IF NOT EXISTS idx_wf_nodes_group ON workflows_nodes(group_name);

-- ══════════════════════════════════════════════════════════
-- 2. جدول الروابط (Workflow Edges)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workflows_edges (
  id SERIAL PRIMARY KEY,
  source_node_id INT NOT NULL REFERENCES workflows_nodes(id) ON DELETE CASCADE,
  target_node_id INT NOT NULL REFERENCES workflows_nodes(id) ON DELETE CASCADE,
  condition TEXT,
  label VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_wf_edges_source ON workflows_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_wf_edges_target ON workflows_edges(target_node_id);

-- ══════════════════════════════════════════════════════════
-- 3. جدول سجلات تليجرام (Telegram Logs)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telegram_logs (
  id SERIAL PRIMARY KEY,
  chat_id VARCHAR(64) NOT NULL,
  direction VARCHAR(8) NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out')),
  message TEXT NOT NULL,
  ai_response TEXT,
  automation_key VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tg_logs_chat ON telegram_logs(chat_id);
CREATE INDEX IF NOT EXISTS idx_tg_logs_created ON telegram_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tg_logs_auto_key ON telegram_logs(automation_key);

-- ══════════════════════════════════════════════════════════
-- 4. بذور العقد الأساسية — تمثيل قواعد العمل الثلاث الصارمة
-- ══════════════════════════════════════════════════════════

-- === الوكلاء (Agents) ===
INSERT INTO workflows_nodes (type, label, label_ar, group_name, settings, position_x, position_y) VALUES
  ('agent', 'Cashier POS',        'كاشير نقطة البيع',     'operations',  '{"icon": "monitor", "color": "#10b981"}'::jsonb,  -200, -100),
  ('agent', 'Main Warehouse',     'المخزن الرئيسي',       'inventory',   '{"icon": "warehouse", "color": "#3b82f6"}'::jsonb,  200,  -50),
  ('agent', 'Recipe Engine',      'محرك الوصفات',         'production',  '{"icon": "flask", "color": "#f59e0b"}'::jsonb,       0,   100),
  ('agent', 'Telegram Bot',       'وكيل تليجرام',         'notifications','{"icon": "send", "color": "#8b5cf6"}'::jsonb,       300,  150),
  ('agent', 'AI Copilot (Gemini)','المساعد الذكي Gemini',  'ai',          '{"icon": "brain", "color": "#ec4899"}'::jsonb,      -300,  150),
  ('agent', 'System Alerts',      'إشعارات النظام',       'notifications','{"icon": "bell", "color": "#ef4444"}'::jsonb,        300, -150)
ON CONFLICT DO NOTHING;

-- === المشغلات (Triggers) ===
INSERT INTO workflows_nodes (type, label, label_ar, group_name, settings, position_x, position_y) VALUES
  ('trigger', 'Manual Daily Entry',     'إدخال يومي يدوي',         'sales',     '{"icon": "edit", "color": "#6b7280", "rule": "RULE_1_MANUAL"}'::jsonb,     -400, -200),
  ('trigger', 'Wholesale Invoice',      'فاتورة جملة',             'sales',     '{"icon": "file-text", "color": "#6b7280", "rule": "RULE_2_WHOLESALE"}'::jsonb, -400, 0),
  ('trigger', 'Cashier Report Import',  'استيراد تقرير الكاشير',   'sales',     '{"icon": "upload", "color": "#6b7280", "rule": "RULE_3_CASHIER"}'::jsonb,  -400, 200)
ON CONFLICT DO NOTHING;

-- === العمليات (Actions) ===
INSERT INTO workflows_nodes (type, label, label_ar, group_name, settings, position_x, position_y) VALUES
  ('action', 'Direct Stock Deduction',  'خصم مخزون مباشر',         'inventory', '{"icon": "minus-circle", "color": "#14b8a6"}'::jsonb, 0,  -200),
  ('action', 'Recipe Calculation',      'حساب الوصفات والتفكيك',   'production','{"icon": "calculator", "color": "#f97316"}'::jsonb,   0,    0),
  ('action', 'Branch Stock Update',     'تحديث مخزون الفرع',       'inventory', '{"icon": "refresh-cw", "color": "#0ea5e9"}'::jsonb,  200,  200)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════
-- 5. بذور الروابط — تمثيل سير العمل والقواعد الصارمة
-- ══════════════════════════════════════════════════════════

-- القاعدة 1: إدخال يومي → خصم مباشر → المخزن الرئيسي
INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, 'sale_type = manual', 'تسجيل عادي'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Manual Daily Entry' AND t.label = 'Direct Stock Deduction'
ON CONFLICT DO NOTHING;

INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, NULL, 'خصم من المخزن'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Direct Stock Deduction' AND t.label = 'Main Warehouse'
ON CONFLICT DO NOTHING;

-- القاعدة 2: فاتورة جملة → خصم مباشر من المخزن الرئيسي (بدون وصفات!)
INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, 'sale_type = wholesale', 'جملة → خصم مباشر'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Wholesale Invoice' AND t.label = 'Direct Stock Deduction'
ON CONFLICT DO NOTHING;

-- القاعدة 3: استيراد كاشير → محرك الوصفات (إلزامي!) → تحديث مخزون الفرع
INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, 'sale_type = cashier_import', 'يمر عبر محرك الوصفات إلزامياً'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Cashier Report Import' AND t.label = 'Recipe Calculation'
ON CONFLICT DO NOTHING;

INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, NULL, 'تفكيك وصفات ثم خصم'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Recipe Calculation' AND t.label = 'Recipe Engine'
ON CONFLICT DO NOTHING;

INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, NULL, 'تحديث رصيد الفرع'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Recipe Engine' AND t.label = 'Branch Stock Update'
ON CONFLICT DO NOTHING;

-- روابط إشعارات: كل العمليات ترسل إشعارات
INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, 'on_low_stock', 'تنبيه نقص'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Main Warehouse' AND t.label = 'System Alerts'
ON CONFLICT DO NOTHING;

INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, 'always', 'إشعار تليجرام'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'System Alerts' AND t.label = 'Telegram Bot'
ON CONFLICT DO NOTHING;

-- ربط AI Copilot بالتليجرام والمخزن
INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, 'command = /ai', 'استعلام ذكي'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'Telegram Bot' AND t.label = 'AI Copilot (Gemini)'
ON CONFLICT DO NOTHING;

INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
SELECT s.id, t.id, 'read_only', 'قراءة بيانات المخزون'
FROM workflows_nodes s, workflows_nodes t
WHERE s.label = 'AI Copilot (Gemini)' AND t.label = 'Main Warehouse'
ON CONFLICT DO NOTHING;
