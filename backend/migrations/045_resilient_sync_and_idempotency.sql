-- =====================================================
-- Migration 045: Resilient Sync & Persistent Idempotency
-- =====================================================

-- 1. جدول تسجيل مفاتيح العمليات لمنع التكرار عبر بيئات الـ Serverless
CREATE TABLE IF NOT EXISTS idempotency_records (
    key VARCHAR(128) PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    request_path VARCHAR(255) NOT NULL,
    status_code INT NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);

-- 2. إضافة معرّف التزامن المقاوم للتعارض في جدول المبيعات
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sync_id UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_sync_id ON sales(sync_id);

-- 3. دالة تنظيف تلقائية للمفاتيح منتهية الصلاحية
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_records()
RETURNS void AS $$
BEGIN
    DELETE FROM idempotency_records WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
