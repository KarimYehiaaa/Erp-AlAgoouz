-- =====================================================
-- Migration 057: Add opening_balance to suppliers table
-- =====================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00;
