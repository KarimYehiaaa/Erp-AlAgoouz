-- ============================================================================
-- Migration 054: Manager POS Security PIN
-- Add pos_pin_hash to users table for Manager Override authorization in POS
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS pos_pin_hash VARCHAR(255);
