import { expect, it } from 'vitest';
import { normalizeUnit, unitPriceFor } from '../src/services/productCostService.ts';

it.each([null, undefined, {}, 42])('rejects non-text unit %j without coercing it', (unit) => {
  expect(normalizeUnit(unit)).toBeNull();
});

it.each(['constructor', '__proto__'])('rejects inherited object key %s as a unit', (unit) => {
  expect(normalizeUnit(unit)).toBeNull();
  expect(unitPriceFor(100, unit, unit)).toBeNull();
});
it.each([
  ['كيلوجرام', 'kg'],
  ['غرام', 'g'],
  ['ملي', 'ml'],
])('accepts the same Arabic alias %s used by the recipe editor', (alias, canonical) => {
  expect(normalizeUnit(alias)).toBe(canonical);
});
