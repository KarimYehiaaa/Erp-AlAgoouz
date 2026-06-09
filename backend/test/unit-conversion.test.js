import test from 'node:test';
import assert from 'node:assert/strict';
import { unitPriceFor, calculateRecipeCost } from '../src/services/productCostService.js';

test('unitPriceFor handles common conversions and unknown units', () => {
    // kg -> g
    assert.equal(unitPriceFor(120, 'kg', 'g'), 0.12);
    // l -> ml
    assert.equal(unitPriceFor(2, 'l', 'ml'), 0.002);
    // same unit
    assert.equal(unitPriceFor(50, 'count', 'count'), 50);
    // unknown product unit returns null
    assert.equal(unitPriceFor(100, 'unknown_unit', 'g'), null);
    // incompatible units (weight vs volume) return null
    assert.equal(unitPriceFor(100, 'kg', 'ml'), null);
});

test('calculateRecipeCost respects explicit ingredient_unit_price and skips zero qty', () => {
    const items = [
        { quantity: 2, ingredient_unit_price: 5 }, // direct price -> 10
        { quantity: 0, ingredient_unit_price: 100 }, // zero qty -> skipped
        { quantity: 3, unit_code: 'g', ingredient_unit: 'kg', ingredient_purchase_price: 120 }, // 3 * 0.12 = 0.36
    ];

    const total = calculateRecipeCost(items);
    // 10 + 0.36 rounded to 2 decimals = 10.36
    assert.equal(total, 10.36);
});
