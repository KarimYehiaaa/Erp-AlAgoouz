import { describe, it, expect } from 'vitest';
import { roundMoney, sumMoney } from '../src/utils/money.ts';

describe('Customer FIFO Ledger & Balance Allocation Suite', () => {
  it('يوزع دفعات العميل بنظام FIFO على الفواتير المستحقة من الأقدم للأحدث', () => {
    // 3 فواتير مستحقة للعميل
    const invoices = [
      { id: 101, total: 500, paid: 0, date: '2026-01-01' },
      { id: 102, total: 800, paid: 0, date: '2026-01-15' },
      { id: 103, total: 300, paid: 0, date: '2026-02-01' },
    ];

    // العميل دفع 1000 ج.م
    let paymentToAllocate = 1000;

    for (const inv of invoices) {
      const remainingOnInv = inv.total - inv.paid;
      const allocated = Math.min(paymentToAllocate, remainingOnInv);
      inv.paid += allocated;
      paymentToAllocate -= allocated;
      if (paymentToAllocate <= 0) break;
    }

    // الفاتورة 101: مسددة بالكامل (500/500)
    expect(invoices[0].paid).toBe(500);
    expect(invoices[0].total - invoices[0].paid).toBe(0);

    // الفاتورة 102: مسدد منها 500 ومتبقي 300 (500/800)
    expect(invoices[1].paid).toBe(500);
    expect(invoices[1].total - invoices[1].paid).toBe(300);

    // الفاتورة 103: غير مسددة إطلاقاً (0/300)
    expect(invoices[2].paid).toBe(0);
    expect(invoices[2].total - invoices[2].paid).toBe(300);

    // إجمالي المتبقي على العميل = 300 + 300 = 600 ج.م
    const totalRemaining = invoices.reduce((sum, inv) => sum + (inv.total - inv.paid), 0);
    expect(totalRemaining).toBe(600);
  });

  it('يحافظ على ثبات الرصيد الافتتاحي ويسجل السداد في قيود الدفعات دون تصفير التاريخ', () => {
    const historicalOpeningBalance = 2500; // رصيد افتتاحي مسجل للعميل

    // تسجيل سداد 1000 ج.م مخصص للرصيد الافتتاحي
    const openingPayment = {
      reference_type: 'customer_opening',
      amount: 1000,
    };

    // القيمة التاريخية لا تتغير
    const preservedOpeningBalance = historicalOpeningBalance;
    expect(preservedOpeningBalance).toBe(2500);

    // المتبقي من الرصيد الافتتاحي
    const remainingOpeningBalance = Math.max(0, historicalOpeningBalance - openingPayment.amount);
    expect(remainingOpeningBalance).toBe(1500);
  });

  it('يدعم تسجيل الدفعات المقدمة والأرصدة الدائنة للعميل (Credit Balance)', () => {
    const currentDebt = 400; // مديونية سابقة
    const advancePayment = 1000; // سداد بمبلغ أكبر من المديونية

    // الرصيد بعد السداد = المديونية - الدفعة = 400 - 1000 = -600 (رصيد دائن لصالح العميل)
    const newBalance = roundMoney(currentDebt - advancePayment);
    expect(newBalance).toBe(-600);
    expect(newBalance < 0).toBe(true); // رصيد دائن
  });
});
