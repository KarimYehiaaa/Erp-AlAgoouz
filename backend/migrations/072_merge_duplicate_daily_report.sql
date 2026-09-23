-- The old daily_summary_report key invokes the same implementation as
-- daily_sales_report. Merge only when both cron schedules are identical;
-- a customized schedule needs a separate decision rather than silent loss.
-- Retain execution history by reparenting logs before deleting the duplicate.
UPDATE automation_logs AS log
SET automation_id = canonical.id
FROM automations AS legacy, automations AS canonical
WHERE legacy.key = 'daily_summary_report'
  AND canonical.key = 'daily_sales_report'
  AND legacy.trigger_type = 'cron'
  AND canonical.trigger_type = 'cron'
  AND legacy.cron_expression IS NOT DISTINCT FROM canonical.cron_expression
  AND log.automation_id = legacy.id;

DELETE FROM automations AS legacy
USING automations AS canonical
WHERE legacy.key = 'daily_summary_report'
  AND canonical.key = 'daily_sales_report'
  AND legacy.trigger_type = 'cron'
  AND canonical.trigger_type = 'cron'
  AND legacy.cron_expression IS NOT DISTINCT FROM canonical.cron_expression;
