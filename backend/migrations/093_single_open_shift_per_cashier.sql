-- 093_single_open_shift_per_cashier.sql
-- يمنع على مستوى قاعدة البيانات وجود أكثر من وردية مفتوحة لنفس الكاشير
-- (تكملة للقفل الاستشاري داخل posShiftService.openShift).
-- لا تُسجّل الهجرة كناجحة إذا بقيت ورديات مكررة؛ يجب تسويتها يدويًا قبل
-- إعادة المحاولة، لأن إغلاق وردية تاريخية تلقائيًا قد يفسد المطابقة النقدية.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT cashier_user_id
      FROM pos_shifts
      WHERE status = 'open'
      GROUP BY cashier_user_id
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Migration 093 blocked: reconcile cashiers with multiple open POS shifts, then retry.';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_shifts_one_open_per_cashier
    ON pos_shifts (cashier_user_id)
    WHERE status = 'open';
END;
$$;
