import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/database/pool.js';
import {
  calculateOutstandingAmount,
  calculatePaidAmount,
  calculateSaleTotals,
} from '../src/services/salesService.ts';
import { CLEAR_DATA_TABLES } from '../src/services/backupService.ts';
import {
  calculateRecipeCost,
  getProductsEffectiveCosts,
  unitPriceFor,
} from '../src/services/productCostService.ts';
import { parseInvoiceData } from '../src/services/invoiceService.ts';
import { parsePurchaseAmount } from '../src/services/purchaseService.ts';
import { parseLocalizedNumber } from '../src/utils/numberParsing.js';

test.after(async () => {
  await pool.end();
});

test('parses purchase decimal amounts from common Arabic inputs', () => {
  assert.equal(parsePurchaseAmount('1.25'), 1.25);
  assert.equal(parsePurchaseAmount('1,25'), 1.25);
  assert.equal(parsePurchaseAmount('١٫٢٥'), 1.25);
  assert.equal(parsePurchaseAmount('۱٫۲۵'), 1.25);
});

test('purchase price refresh keeps weighted-average cost rule', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/services/purchaseService.ts', import.meta.url), 'utf8'));
  const refreshSource = source.slice(
    source.indexOf('const refreshPurchasePrices'),
    source.indexOf('export const listPurchaseInvoices')
  );

  assert.match(refreshSource, /SUM\(pii\.total_amount\) \/ NULLIF\(SUM\(pii\.quantity\), 0\)/);
  assert.doesNotMatch(refreshSource, /ORDER BY pi\.invoice_date DESC[\s\S]*LIMIT 1/);
});

test('calculates item sale totals with item and sale adjustments', () => {
  const totals = calculateSaleTotals(
    [
      { product_id: 1, quantity: 2, unit_price: 50, discount_amount: 10 },
      { product_id: 2, quantity: 1.5, unit_price: 20, tax_amount: 3 },
    ],
    { discount_amount: 5, tax_amount: 2 }
  );

  assert.equal(totals.subtotal, 130);
  assert.equal(totals.itemDiscountTotal, 10);
  assert.equal(totals.totalAmount, 115); // 130 - 10 (item discount) - 5 (invoice discount) = 115
  assert.deepEqual(
    totals.items.map((item) => item.total_amount),
    [90, 30] // Item 2 tax is forced to 0: 30 instead of 33
  );
});

test('rejects invalid invoice-level sale discounts', () => {
  const items = [{ product_id: 1, quantity: 1, unit_price: 100, discount_amount: 0 }];

  assert.throws(() => calculateSaleTotals(items, { discount_amount: -1 }), /discount cannot be negative/i);
  assert.throws(() => calculateSaleTotals(items, { discount_amount: 101 }), /discount cannot exceed invoice total/i);
});

test('does not create a paid amount for unpaid sales', () => {
  assert.equal(calculatePaidAmount('unpaid', 250), 0);
});

test('validates partial payments and calculates outstanding balance', () => {
  assert.equal(calculatePaidAmount('partial', 250, 100), 100);
  assert.equal(calculateOutstandingAmount(250, 100), 150);
  assert.throws(() => calculatePaidAmount('partial', 250, 250), /less than invoice total/);
});

test('system clear keeps recipe definitions intact', () => {
  assert.equal(CLEAR_DATA_TABLES.includes('product_recipes'), false);
  assert.equal(CLEAR_DATA_TABLES.includes('product_recipe_items'), false);
});

test('calculates recipe component cost with unit conversion', () => {
  assert.equal(unitPriceFor(120, 'kg', 'g'), 0.12);
  assert.equal(calculateRecipeCost([
    { quantity: 250, unit_code: 'g', ingredient_unit: 'kg', ingredient_purchase_price: 120 },
    { quantity: 2, unit_code: 'count', ingredient_unit: 'count', ingredient_purchase_price: 3.5 },
  ]), 37);
});

test('effective product cost resolves recipe ingredients recursively', async () => {
  const db = {
    query: async (sql, params = []) => {
      const text = String(sql).toLowerCase();
      const productId = Number(params[0]);

      if (text.includes('purchase_price') && text.includes('from products')) {
        return {
          rows: [
            { id: 10, purchase_price: 99, unit: 'kg' },
            { id: 11, purchase_price: 25, unit: 'kg' },
          ],
        };
      }

      if (text.includes('from product_recipes r') && text.includes('join product_recipe_items ri')) {
        return {
          rows: [
            {
              parent_product_id: 10,
              recipe_id: 7,
              recipe_item_id: 1,
              ingredient_product_id: 11,
              quantity: 500,
              unit_code: 'g',
              ingredient_unit: 'kg',
            },
          ],
        };
      }

      return { rows: [] };
    },
  };

  const costs = await getProductsEffectiveCosts(db, [10, 11]);
  assert.deepEqual(costs.get(10), { cost: 12.5, source: 'recipe' });
  assert.deepEqual(costs.get(11), { cost: 25, source: 'purchase_price' });
});
