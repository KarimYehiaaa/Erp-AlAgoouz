-- Keep configured automation history, but never advertise unimplemented or
-- event-only stubs as active schedules. The scheduler keys below have real
-- execution handlers; all other enabled rows are retained and marked for review.
UPDATE automations
SET is_enabled = FALSE,
    last_status = 'warning',
    description_ar = CONCAT(
      COALESCE(description_ar, ''),
      CASE WHEN COALESCE(description_ar, '') = '' THEN '' ELSE E'\n' END,
      'موقوف: لا يوجد معالج تنفيذ تلقائي موصول لهذه المهمة.'
    ),
    updated_at = NOW()
WHERE is_enabled = TRUE
  AND NOT (
    trigger_type = 'cron'
    AND cron_expression IS NOT NULL
    AND key IN (
      'daily_sales_report',
      'low_stock_alert',
      'warehouse_balancing',
      'system_health',
      'daily_backup_reminder',
      'supplier_payment_due_alert',
      'daily_profit_margin_anomaly'
    )
  );
