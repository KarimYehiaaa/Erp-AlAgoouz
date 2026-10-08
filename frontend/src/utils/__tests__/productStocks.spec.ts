import { expect, it } from 'vitest';
import { buildProductWarehouseStocks, changedProductWarehouseStocks } from '../productStocks';

it('sums all batches in each warehouse when opening the product form', () => {
  expect(
    buildProductWarehouseStocks(
      [{ id: 11 }, { id: 12 }],
      [
        { warehouse_id: 11, quantity: '4' },
        { warehouse_id: 11, quantity: '6' },
        { warehouse_id: 12, quantity: '0.1' },
        { warehouse_id: 12, quantity: '0.2' },
      ],
    ),
  ).toEqual({ 11: 10, 12: 0.3 });
});

it('omits unchanged balances on metadata-only saves so concurrent sales are preserved', () => {
  expect(changedProductWarehouseStocks({ 11: 10, 12: 7 }, { 11: 10, 12: 7 })).toEqual({});
});

it('sends explicitly changed balances including zero', () => {
  expect(changedProductWarehouseStocks({ 11: 0, 12: 7 }, { 11: 10, 12: 7 })).toEqual({ 11: 0 });
});

it('includes zero balances for new products without adding warehouses outside the available scope', () => {
  expect(buildProductWarehouseStocks([{ id: 11 }])).toEqual({ 11: 0 });
  expect(buildProductWarehouseStocks([{ id: 11 }], [{ warehouse_id: 12, quantity: 99 }])).toEqual({
    11: 0,
  });
});
