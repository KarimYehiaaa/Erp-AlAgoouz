-- Migration: 034_fixed_expenses.sql
-- Add is_fixed column to expense_categories and expenses tables to distinguish fixed overhead vs variable expenses

ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN DEFAULT FALSE;

-- Mark common fixed categories as fixed
UPDATE expense_categories
SET is_fixed = TRUE
WHERE slug IN ('rent', 'salaries', 'utilities')
   OR name_ar LIKE '%إيجار%'
   OR name_ar LIKE '%مرتبات%'
   OR name_ar LIKE '%أجور%'
   OR name_ar LIKE '%كهرباء%'
   OR name_ar LIKE '%مرافق%'
   OR name_ar LIKE '%اشتراك%';

-- Inherit is_fixed flag from expense_categories for existing expenses
UPDATE expenses e
SET is_fixed = ec.is_fixed
FROM expense_categories ec
WHERE e.category_id = ec.id AND ec.is_fixed = TRUE;
