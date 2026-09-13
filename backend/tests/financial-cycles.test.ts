import { describe, it, expect } from 'vitest';
import { calculateSaleTotals, calculatePaidAmount } from '../src/services/salesCalculations.ts';
import { roundMoney, sumMoney, toNumber } from '../src/utils/money.ts';

describe('Financial Cycles & Calculations Hardening', () => {
  describe('Sales Calculations (Taxes, Discounts, Subtotals)', () => {
    it('يحسب ضريبة القيمة المضافة ديناميكياً بدقة عند تمرير tax_percent', () => {
      const items = [
        { product_id: 1, quantity: 2, unit_price: 100, discount_amount: 0 },
      ];
      // Subtotal = 200, Tax = 14% (28 EGP), Total = 228 EGP
      const result = calculateSaleTotals(items, { tax_percent: 14 });
      expect(result.subtotal).toBe(200);
      expect(result.taxPercent).toBe(14);
      expect(result.taxAmount).toBe(28);
      expect(result.totalAmount).toBe(228);
    });

    it('يطبق الخصم أولاً ثم يحسب الضريبة على الأساس الصافي', () => {
      const items = [
        { product_id: 1, quantity: 5, unit_price: 200, discount_amount: 100 }, // 1000 - 100 = 900
      ];
      // Gross = 1000, Item discount = 100, Global invoice discount = 100 => Base for tax = 800
      // Tax 10% on 800 = 80 EGP, Total = 880 EGP
      const result = calculateSaleTotals(items, { discount_amount: 100, tax_percent: 10 });
      expect(result.subtotal).toBe(1000);
      expect(result.discountAmount).toBe(100);
      expect(result.taxAmount).toBe(80);
      expect(result.totalAmount).toBe(880);
    });

    it('يقبل tax_amount صريح بدلاً من النسبة المئوية', () => {
      const items = [
        { product_id: 1, quantity: 1, unit_price: 500, discount_amount: 0 },
      ];
      const result = calculateSaleTotals(items, { tax_amount: 70 });
      expect(result.taxAmount).toBe(70);
      expect(result.totalAmount).toBe(570);
    });

    it('يتحقق من حالات الدفع (paid, partial, unpaid)', () => {
      expect(calculatePaidAmount('unpaid', 500)).toBe(0);
      expect(calculatePaidAmount('paid', 500)).toBe(500);
      expect(calculatePaidAmount('partial', 500, 200)).toBe(200);
      expect(() => calculatePaidAmount('partial', 500, 0)).toThrow();
      expect(() => calculatePaidAmount('partial', 500, 600)).toThrow();
    });
  });

  describe('Money & Floating-Point Accuracy', () => {
    it('يتفادى تراكم الأخطاء العشرية في المجاميع الكبيرة', () => {
      const parts = [0.1, 0.2, 0.3, 0.4];
      expect(sumMoney(...parts)).toBe(1.0);
    });

    it('يقرب العملات إلى منزلتين عشريتين دون شذوذ', () => {
      expect(roundMoney(123.456)).toBe(123.46);
      expect(roundMoney(123.454)).toBe(123.45);
    });
  });

  describe('Moving Average Inventory Cost Logic', () => {
    it('يحسب متوسط التكلفة المرجح بدقة', () => {
      // 100 كجم بسعر 300 ج.م = 30,000
      // شحنة جديدة: 50 كجم بسعر 360 ج.م = 18,000
      // الإجمالي: 150 كجم بتكلفة 48,000 => متوسط الوحدة = 320 ج.م
      const stock1 = 100;
      const price1 = 300;
      const stock2 = 50;
      const price2 = 360;

      const totalCost = stock1 * price1 + stock2 * price2;
      const totalQty = stock1 + stock2;
      const weightedAvg = roundMoney(totalCost / totalQty);

      expect(weightedAvg).toBe(320);
    });
  });
});
