import { describe, it, expect } from 'vitest';
import {
  calculateOutstandingAmount,
  calculatePaidAmount,
  calculateSaleTotals,
} from '../src/services/salesCalculations.ts';
import { CLEAR_DATA_TABLES } from '../src/services/backupService.ts';
import {
  calculateRecipeCost,
  getProductsEffectiveCosts,
  unitPriceFor,
} from '../src/services/productCostService.ts';
import { parsePurchaseAmount } from '../src/services/purchaseService.ts';
import fs from 'node:fs/promises';

describe('Accounting & Sales Logic Unit Tests', () => {
  it('parses purchase decimal amounts from common Arabic inputs', () => {
    expect(parsePurchaseAmount('1.25')).toBe(1.25);
    expect(parsePurchaseAmount('1,25')).toBe(1.25);
    expect(parsePurchaseAmount('١٫٢٥')).toBe(1.25);
    expect(parsePurchaseAmount('۱٫۲۵')).toBe(1.25);
  });

  it('purchase price refresh keeps weighted-average cost rule', async () => {
    const source = await fs.readFile(
      new URL('../src/services/purchaseService.ts', import.meta.url),
      'utf8',
    );
    const refreshSource = source.slice(
      source.indexOf('const refreshPurchasePrices'),
      source.indexOf('export const listPurchaseInvoices'),
    );

    expect(refreshSource).toMatch(
      /SUM\(remaining_quantity \* unit_cost\) \/ NULLIF\(SUM\(remaining_quantity\), 0\)/,
    );
    expect(refreshSource).toMatch(/FROM inventory_cost_layers/);
    expect(refreshSource).toMatch(/remaining_quantity > 0/);
    expect(refreshSource).not.toMatch(/ORDER BY pi\.invoice_date DESC[\s\S]*LIMIT 1/);
  });

  it('calculates item sale totals with item and sale adjustments', () => {
    const totals = calculateSaleTotals(
      [
        { product_id: 1, quantity: 2, unit_price: 50, discount_amount: 10 },
        { product_id: 2, quantity: 1.5, unit_price: 20, tax_amount: 3 },
      ],
      { discount_amount: 5, tax_amount: 2 },
    );

    expect(totals.subtotal).toBe(130);
    expect(totals.itemDiscountTotal).toBe(10);
    expect(totals.taxAmount).toBe(2);
    expect(totals.totalAmount).toBe(117);
    expect(totals.items.map((item) => item.total_amount)).toEqual([90, 30]);
  });

  it('rejects invalid invoice-level sale discounts', () => {
    const items = [{ product_id: 1, quantity: 1, unit_price: 100, discount_amount: 0 }];

    expect(() => calculateSaleTotals(items, { discount_amount: -1 })).toThrow(
      /قيمة خصم الفاتورة لا يمكن أن تكون سالبة/,
    );
    expect(() => calculateSaleTotals(items, { discount_amount: 101 })).toThrow(
      /قيمة خصم الفاتورة لا يمكن أن تتجاوز إجمالي الفاتورة/,
    );
  });

  it('does not create a paid amount for unpaid sales', () => {
    expect(calculatePaidAmount('unpaid', 250)).toBe(0);
  });

  it('validates partial payments and calculates outstanding balance', () => {
    expect(calculatePaidAmount('partial', 250, 100)).toBe(100);
    expect(calculateOutstandingAmount(250, 100)).toBe(150);
    expect(() => calculatePaidAmount('partial', 250, 250)).toThrow(
      /المبلغ المدفوع جزئياً يجب أن يكون أقل من إجمالي الفاتورة/,
    );
  });

  it('system clear keeps recipe definitions intact', () => {
    expect(CLEAR_DATA_TABLES.includes('product_recipes')).toBe(false);
    expect(CLEAR_DATA_TABLES.includes('product_recipe_items')).toBe(false);
  });

  it('calculates recipe component cost with unit conversion', () => {
    expect(unitPriceFor(120, 'kg', 'g')).toBe(0.12);
    expect(
      calculateRecipeCost([
        { quantity: 250, unit_code: 'g', ingredient_unit: 'kg', ingredient_purchase_price: 120 },
        { quantity: 2, unit_code: 'count', ingredient_unit: 'count', ingredient_purchase_price: 3.5 },
      ]),
    ).toBe(37);
  });

  it('effective product cost resolves recipe ingredients recursively', async () => {
    const db: any = {
      query: async (sql: string, params: any[] = []) => {
        const text = String(sql).toLowerCase();

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
    expect(costs.get(10)).toEqual({ cost: 12.5, source: 'recipe' });
    expect(costs.get(11)).toEqual({ cost: 25, source: 'purchase_price' });
  });
});
