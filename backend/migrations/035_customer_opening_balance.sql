-- Migration: 035_customer_opening_balance.sql
-- Add opening_balance and current_balance columns to customers table

ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS current_balance DECIMAL(12,2) DEFAULT 0;
