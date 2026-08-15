import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  roundMoney,
  safeDivide,
  sanitizeLimit,
  sumMoney,
  toNumber,
} from '../src/utils/money.ts';

/**
 * اختبار وحدة لأدوات المال (money.ts) — دوال خالصة بلا قاعدة بيانات.
 * يغطي تحصين الفاصلة العائمة (sumMoney/roundMoney) الذي أُضيف في جلسة التدقيق،
 * والقسمة الآمنة (safeDivide)، وتحويلات المبالغ والحدود.
 */
describe('money utils (floating-point hardening)', () => {
  it('roundMoney يقرّب إلى قرشين ويتخلص من انحراف الفاصلة العائمة', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    // 1.005×100 = 100.4999... — يُقرَّب إلى 1 (سلوك float حقيقي موثّق هنا)
    expect(roundMoney(10.999)).toBe(11);
    expect(roundMoney(12.349)).toBe(12.35);
    expect(roundMoney('12.34')).toBe(12.34);
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
    expect(roundMoney('abc')).toBe(0);
  });

  it('sumMoney يجمع بقرّوش صحيحة دون انحراف متراكم', () => {
    // 0.1+0.2 بجمع عادي = 0.30000000000000004 — sumMoney يجب أن يعيد 0.3
    expect(sumMoney(0.1, 0.2)).toBe(0.3);
    // تراكم 10 × 0.1 — يجب أن يساوي 1 بالضبط
    expect(sumMoney(...Array(10).fill(0.1))).toBe(1);
    // مبالغ متكررة صغيرة: 1000 × 0.01 = 10 بالضبط
    expect(sumMoney(...Array(1000).fill(0.01))).toBe(10);
    // التعامل مع القيم الفارغة/النصية
    expect(sumMoney(1.5, null, undefined, '2.5')).toBe(4);
    expect(sumMoney()).toBe(0);
    // القيم السالبة تُجمع بشكل صحيح
    expect(sumMoney(10, -3.25, 1.25)).toBe(8);
  });

  it('safeDivide يمنع القسمة على صفر (Infinity/NaN)', () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(10, 0, -1)).toBe(-1);
    expect(safeDivide(0, 0)).toBe(0);
    expect(safeDivide(Number.NaN, 2)).toBe(0);
    expect(safeDivide(7.5, 2)).toBe(3.75);
  });

  it('parseAmount يحلل الأرقام مع قيمة بديلة للقيم الفارغة/غير الصالحة', () => {
    expect(parseAmount('250.5')).toBe(250.5);
    expect(parseAmount(100)).toBe(100);
    expect(parseAmount('abc')).toBe(0);
    // null/undefined/'' تُرجع البديل (وليس 0) — يمنع مسح القيم عند التحديث
    expect(parseAmount(null, 5)).toBe(5);
    expect(parseAmount(undefined, 7)).toBe(7);
    expect(parseAmount('', 3)).toBe(3);
    expect(parseAmount('', 0)).toBe(0);
  });

  it('toNumber يحوّل القيم مع بديل للفارغة/غير الصالحة', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber('42.5')).toBe(42.5);
    expect(toNumber(null, 9)).toBe(9);
    expect(toNumber('', 9)).toBe(9);
    expect(toNumber(undefined, 9)).toBe(9);
    expect(toNumber('nope', 2)).toBe(2);
  });

  it('sanitizeLimit يقيّد الحدود بين البديل والحد الأقصى', () => {
    expect(sanitizeLimit(10)).toBe(10);
    expect(sanitizeLimit(0)).toBe(100);
    expect(sanitizeLimit(-5)).toBe(100);
    expect(sanitizeLimit(9999)).toBe(500);
    expect(sanitizeLimit(null, 50, 200)).toBe(50);
    expect(sanitizeLimit(20.9, 50, 200)).toBe(20);
    expect(sanitizeLimit('abc')).toBe(100);
  });
});
