-- Allow payroll to represent half-days and paid/unpaid leave accurately.

ALTER TABLE payroll_items
  ALTER COLUMN worked_days TYPE DECIMAL(8,2) USING worked_days::DECIMAL,
  ALTER COLUMN absent_days TYPE DECIMAL(8,2) USING absent_days::DECIMAL;
