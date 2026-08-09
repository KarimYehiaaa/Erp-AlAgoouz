-- Migration: 036_account_lockout.sql
-- Add fields for brute-force protection (Account Lockout)

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
