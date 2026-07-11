-- Convert paid_installments to DECIMAL to support fractional/partial advance installments.
ALTER TABLE employee_advances ALTER COLUMN paid_installments TYPE DECIMAL(12,4);
