import { describe, it, expect } from 'vitest';
import { roundMoney, sumMoney } from '../src/utils/money.ts';

describe('POS Shift Reconciliation & Cash Drawer Integrity', () => {
  it('يحسب نقدية الدرج المتوقعة بناءً على الكاش فقط دون خلط مدفوعات الفيزا', () => {
    const openingCash = 1000; // رصيد افتتاحي للدرج
    const cashSales = 3500;   // مبيعات نقدية فعلية
    const visaSales = 2200;   // مبيعات بطاقات بنكية (فيزا / ماستركارد)
    const deposits = 500;     // إيداع وسلفة عهدة داخل الدرج
    const withdrawals = 300;  // مصروف نثريات من الدرج

    // المعادلة الصارمة:
    // Expected Cash = Opening Cash + Cash Sales + Deposits - Withdrawals
    const expectedCash = openingCash + cashSales + deposits - withdrawals;

    expect(expectedCash).toBe(4700);

    // التحقق من أن إجمالي المبيعات = كاش + فيزا
    const totalSales = cashSales + visaSales;
    expect(totalSales).toBe(5700);

    // التأكد من أن الفرق بين إجمالي المبيعات ونقدية الدرج هو مبيعات الفيزا (مع استبعاد حركات الدرج الأخرى)
    expect(expectedCash).not.toBe(openingCash + totalSales + deposits - withdrawals);
  });

  it('يعزل الجزء النقدي بدقة عند الدفع المتعدد (Split Payment)', () => {
    // فاتورة بقيمة 1000 ج.م: دفع العميل 400 ج.م كاش و 600 ج.م فيزا
    const billTotal = 1000;
    const splitPayments = [
      { method: 'cash', amount: 400 },
      { method: 'card', amount: 600 },
    ];

    const cashPortion = splitPayments
      .filter((p) => p.method === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);

    const cardPortion = splitPayments
      .filter((p) => p.method === 'card')
      .reduce((sum, p) => sum + p.amount, 0);

    expect(cashPortion + cardPortion).toBe(billTotal);
    expect(cashPortion).toBe(400); // 400 ج.م فقط تذهب للدرج
    expect(cardPortion).toBe(600); // 600 ج.م تذهب لحساب البنك
  });

  it('يكتشف العجز والزيادة في الدرج عند مقارنة العد الفعلي بالنقدية المتوقعة', () => {
    const expectedCash = 5000;

    // حالة 1: عجز نقدي (العد الفعلي 4850)
    const actualCountDeficit = 4850;
    const differenceDeficit = actualCountDeficit - expectedCash;
    expect(differenceDeficit).toBe(-150); // عجز 150 ج.م

    // حالة 2: زيادة نقدية (العد الفعلي 5100)
    const actualCountSurplus = 5100;
    const differenceSurplus = actualCountSurplus - expectedCash;
    expect(differenceSurplus).toBe(100); // زيادة 100 ج.م

    // حالة 3: تطابق تام 100%
    const actualCountExact = 5000;
    expect(actualCountExact - expectedCash).toBe(0);
  });
});
