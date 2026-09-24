-- Collapse historical channel-specific and date-range keys into one monthly
-- shop balance. Existing canonical monthly values always take precedence;
-- otherwise preserve the newest value the old reader would have returned.
WITH candidates AS (
  SELECT
    key,
    value,
    description,
    updated_by,
    updated_at,
    CASE
      WHEN key LIKE 'sales-opening-balance:branch:%'
        OR key LIKE 'sales-opening-balance:wholesale:%'
        THEN split_part(key, ':', 3)
      ELSE split_part(key, ':', 2)
    END AS from_date
  FROM settings
  WHERE key ~ '^sales[_-]opening[_-]balance:(branch:|wholesale:)?[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
), latest_per_month AS (
  SELECT DISTINCT ON (substring(from_date, 1, 7))
    substring(from_date, 1, 7) AS month,
    value,
    description,
    updated_by,
    updated_at
  FROM candidates
  ORDER BY substring(from_date, 1, 7), updated_at DESC, key DESC
)
INSERT INTO settings (key, value, description, updated_by, updated_at)
SELECT 'sales_opening_balance:' || month, value, description, updated_by, updated_at
FROM latest_per_month
ON CONFLICT (key) DO NOTHING;

DELETE FROM settings
WHERE key ~ '^sales[_-]opening[_-]balance:(branch:|wholesale:)?[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$';
