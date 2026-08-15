import { describe, it, expect, beforeAll } from 'vitest';
import { calculateDynamicOpeningBalance } from '../src/services/openingBalanceService.ts';
import { query } from '../src/database/pool.ts';

/**
 * يثبت أن التكرار الرجعي في calculateDynamicOpeningBalance يتوقف
 * (سقف 60 شهرًا) بدل التعليق بلا حدّ — كان يعلّق تقرير P&L لأبدًا
 * (30+ ثانية) على أي قاعدة بلا أرصدة افتتاح مخزنة.
 */
describe('opening balance recursion على قاعدة فارغة', () => {
  beforeAll(async () => {
    // ضمان عدم وجود أي رصيد افتتاح مخزّن — لإجبار مسار التكرار الكامل
    await query(`DELETE FROM settings WHERE key LIKE 'sales_opening_balance%'`);
  });

  it(
    'يتوقف خلال مهلة قصيرة ويعيد 0 على قاعدة بلا أرصدة',
    async () => {
      // تاريخ قديم (2005) يجعل نافذة الـ 60 شهرًا (2000–2005) خالية تمامًا
      // من أي بيانات — النتيجة الصحيحة حتمًا هي صفر.
      const start = Date.now();
      const result = await calculateDynamicOpeningBalance(new Date(2005, 0, 1));
      const elapsed = Date.now() - start;

      // قبل الإصلاح كان يستغرق 30+ ثانية (تكرار بلا حدّ) — الإصلاح ~0.5 ثانية.
      expect(elapsed).toBeLessThan(5000);
      expect(result).toBe(0);
    },
    10000, // مهلة صريحة: لو عاد التكرار اللانهائي يفشل الاختبار بالتأكيد
  );
});
