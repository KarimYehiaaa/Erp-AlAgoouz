-- Rename the saved shop stock-balancing task in place. Keeping its id retains
-- automation_logs relationships, schedule, enabled state and user settings.
-- If both keys exist, leave them untouched for manual conflict resolution.
UPDATE automations
SET key = 'warehouse_balancing',
    name_ar = 'المناقلات الذكية وتوازن مخزون المحل',
    description_ar = 'تحليل السحب بين مخازن المحل واقتراح مناقلات البضاعة من المخزن ذي الفائض إلى المخزن المحتاج.',
    updated_at = NOW()
WHERE key = 'branch_stock_balancing'
  AND NOT EXISTS (SELECT 1 FROM automations WHERE key = 'warehouse_balancing');

UPDATE automations
SET name_ar = 'المناقلات الذكية وتوازن مخزون المحل',
    description_ar = 'تحليل السحب بين مخازن المحل واقتراح مناقلات البضاعة من المخزن ذي الفائض إلى المخزن المحتاج.',
    updated_at = NOW()
WHERE key = 'warehouse_balancing'
  AND name_ar = 'المناقلات الذكية وتوازن مخزون الفروع';
