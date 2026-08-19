-- Migration: 043_automation_tables.sql
-- Description: إنشاء جداول محرك الأتمتة والتنبيهات وسجلات التشغيل الذكية

CREATE TABLE IF NOT EXISTS automations (
  id SERIAL PRIMARY KEY,
  key VARCHAR(64) UNIQUE NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  description_ar TEXT,
  category VARCHAR(32) NOT NULL DEFAULT 'general', -- sales, inventory, security, system
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'cron', -- cron, event
  cron_expression VARCHAR(64) DEFAULT '30 23 * * *',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  channels JSONB NOT NULL DEFAULT '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_status VARCHAR(32), -- success, failed, skipped
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_logs (
  id SERIAL PRIMARY KEY,
  automation_id INT REFERENCES automations(id) ON DELETE CASCADE,
  event_name VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL, -- success, failed, warning
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_key ON automations(key);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_auto_id ON automation_logs(automation_id);

-- بذور الأتمتة الأساسية لبن العجوز ERP
INSERT INTO automations (key, name_ar, description_ar, category, trigger_type, cron_expression, is_enabled, channels, config)
VALUES
(
  'daily_sales_report',
  'تقرير الإغلاق اليومي الذكي',
  'تجميع تلقائي لإجمالي مبيعات الفروع، الأرباح، المصروفات، وأعلى الأصناف مبيعاً وإرسالها للمالك ليلاً.',
  'sales',
  'cron',
  '30 23 * * *',
  true,
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
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"threshold_multiplier": 1.0}'::jsonb
),
(
  'void_invoice_alert',
  'كشف فوري لإلغاء الفواتير (Anti-Fraud)',
  'تنبيه فوري لمدير الفرع والمالك عند قيام أي كاشير بإلغاء فاتورة بعد إصدارها لمنع التلاعب.',
  'security',
  'event',
  NULL,
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"min_amount_trigger": 0}'::jsonb
),
(
  'large_discount_alert',
  'تنبيه الخصومات المرتفعة',
  'إشعار لحظي عند قيام موظف بتطبيق خصم يتجاوز النسبة المحددة على أي عملية بيع.',
  'security',
  'event',
  NULL,
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{"max_discount_pct": 15}'::jsonb
),
(
  'daily_backup_reminder',
  'فحص النسخ الاحتياطي وسلامة السيرفر',
  'مراقبة دورية لسلامة قاعدة البيانات وحالة السيرفر والنسخ الاحتياطي اليومي.',
  'system',
  'cron',
  '0 3 * * *',
  true,
  '{"telegram": true, "in_app": true, "whatsapp": false}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
