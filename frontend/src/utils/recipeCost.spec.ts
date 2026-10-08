import { describe, expect, it } from 'vitest';
import { itemCost, normalizeUnit, unitPriceFor } from './recipeCost';

describe('recipe ingredient cost estimates', () => {
  it.each([null, undefined, {}, 42])('rejects non-text unit %j without coercing it', (unit) => {
    expect(normalizeUnit(unit)).toBeNull();
  });
  it.each([
    ['كيلوجرام', 'kg'],
    ['غرام', 'g'],
    ['ملي', 'ml'],
  ])('uses the shared Arabic alias %s', (alias, canonical) => {
    expect(normalizeUnit(alias)).toBe(canonical);
  });
  it.each(['constructor', '__proto__'])('rejects inherited object key %s as a unit', (unit) => {
    expect(normalizeUnit(unit)).toBeNull();
    expect(unitPriceFor(100, unit, unit)).toBe(0);
  });
  it('does not use a product sale price as a missing purchase cost', () => {
    expect(
      itemCost({ ingredient_product_id: 1, quantity: 2, unit_code: 'kg' }, [
        { id: 1, unit: 'kg', purchase_price: 0, sale_price: 100 },
      ]),
    ).toBe(0);
  });

  it('uses the purchase price when it is available', () => {
    expect(
      itemCost({ ingredient_product_id: 1, quantity: 2, unit_code: 'kg' }, [
        { id: 1, unit: 'kg', purchase_price: 40, sale_price: 100 },
      ]),
    ).toBe(80);
  });
});
