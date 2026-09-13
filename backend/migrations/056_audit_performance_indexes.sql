-- ============================================================================
-- Migration: 056_audit_performance_indexes.sql
-- Description: Add missing performance indexes identified in Technical Audit Report
-- ============================================================================

-- 1. Index on refresh_tokens(user_id) for fast token revocation during logout
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- 2. Index on sale_items(product_id) for rapid sales analysis & inventory reporting
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- 3. Composite Index on stock_movements(to_warehouse_id, created_at)
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_wh_date ON stock_movements(to_warehouse_id, created_at DESC);

-- 4. Composite Index on payments(user_id, created_at)
CREATE INDEX IF NOT EXISTS idx_payments_user_date ON payments(user_id, created_at DESC);
