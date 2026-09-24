-- This shop has a retail sales channel, not a commercial branch channel.
-- Historical `branch` rows are all in-shop retail sales (see migration 004).
UPDATE sales
SET sale_type = 'retail'
WHERE sale_type = 'branch';
