import { describe, it, expect } from 'vitest';
import { roundMoney, sumMoney, toNumber } from '../src/utils/money.ts';
import { unitPriceFor, calculateRecipeCost } from '../src/services/productCostService.ts';

describe('Financial Math & Floating-Point Stability Suite', () => {
  describe('Large Scale Decimal Precision (10,000 continuous operations)', () => {
    it('يحافظ على دقة القروش والمبالغ دون تراكم انحراف الفاصلة العائمة عبر 10,000 عملية', () => {
      let accumulated = 0;
      const step = 0.01; // قرش مصري واحد

      for (let i = 0; i < 10000; i++) {
        accumulated = roundMoney(accumulated + step);
      }

      // 10,000 * 0.01 = 100.00 بالضبط
      expect(accumulated).toBe(100.0);
    });

    it('يتحقق من جمع أجزاء عشرية شهيرة مسببة لأخطاء IEEE-754 (مثل 0.1 + 0.2)', () => {
      const sum = sumMoney(0.1, 0.2);
      expect(sum).toBe(0.3);
      expect(sumMoney(0.1, 0.2, 0.3, 0.4)).toBe(1.0);
    });

    it('يقرب الكسور بدقة متناهية حسب القواعد المحاسبية', () => {
      expect(roundMoney(10.555)).toBe(10.56);
      expect(roundMoney(10.554)).toBe(10.55);
      expect(roundMoney(0.004)).toBe(0);
      expect(roundMoney(0.005)).toBe(0.01);
    });
  });

  describe('Moving Weighted Average Cost Simulation', () => {
    it('يحسب المتوسط المرجح لأسعار الشراء مع كميات وأسعار مختلفة بدقة تامة', () => {
      // شحنة 1: 100 كجم بسعر 200 ج.م للكيلو = 20,000 ج.م
      const stock1 = 100;
      const cost1 = 200;
      const val1 = stock1 * cost1;

      // شحنة 2: 50 كجم بسعر 260 ج.م للكيلو = 13,000 ج.م
      const stock2 = 50;
      const cost2 = 260;
      const val2 = stock2 * cost2;

      const totalQty = stock1 + stock2; // 150
      const totalVal = val1 + val2; // 33,000
      const weightedAvg = roundMoney(totalVal / totalQty); // 33,000 / 150 = 220.00 ج.م

      expect(weightedAvg).toBe(220.0);
    });

    it('يتعامل مع كميات كسرية بالجرامات في حساب المتوسط المرجح', () => {
      // 2.5 كجم بسعر 150.75 + 1.25 كجم بسعر 180.25
      const q1 = 2.5;
      const p1 = 150.75;
      const q2 = 1.25;
      const p2 = 180.25;

      const totalVal = q1 * p1 + q2 * p2; // 376.875 + 225.3125 = 602.1875
      const totalQty = q1 + q2; // 3.75
      const avg = roundMoney(totalVal / totalQty); // 602.1875 / 3.75 = 160.58333... -> 160.58

      expect(avg).toBe(160.58);
    });
  });

  describe('Unit Conversions & Recipe Cost Math', () => {
    it('يحول سعر الكيلو إلى الجرام بدقة (kg -> g)', () => {
      // 120 ج.م للكيلو -> 0.12 ج.م للجرام
      expect(unitPriceFor(120, 'kg', 'g')).toBe(0.12);
    });

    it('يحول سعر اللتر إلى المليلتر بدقة (l -> ml)', () => {
      // 50 ج.م للتر -> 0.05 ج.م للمليلتر
      expect(unitPriceFor(50, 'l', 'ml')).toBe(0.05);
    });

    it('يرفض تحويل الوحدات غير المتجانسة كتحويل الوزن لحجم', () => {
      expect(unitPriceFor(100, 'kg', 'ml')).toBeNull();
      expect(unitPriceFor(100, 'count', 'g')).toBeNull();
    });

    it('يحسب تكلفة الوصفة المكونة من خامات متعددة بوحدات مختلفة', () => {
      const recipeIngredients = [
        // 250 جرام بن بسعر 400 ج.م للكيلو => 250 * 0.4 = 100 ج.م
        { quantity: 250, unit_code: 'g', ingredient_unit: 'kg', ingredient_purchase_price: 400 },
        // 100 مل حليب بسعر 40 ج.م للتر => 100 * 0.04 = 4 ج.م
        { quantity: 100, unit_code: 'ml', ingredient_unit: 'l', ingredient_purchase_price: 40 },
        // كوب ورقي واحد بسعر 1.50 ج.م
        { quantity: 1, unit_code: 'count', ingredient_unit: 'count', ingredient_purchase_price: 1.5 },
      ];

      const totalCost = calculateRecipeCost(recipeIngredients);
      // 100 + 4 + 1.5 = 105.50 ج.م
      expect(totalCost).toBe(105.5);
    });
  });
});
