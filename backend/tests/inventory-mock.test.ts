import { describe, it, expect } from 'vitest';
import { lockInventoryRow, ensureInventoryRow } from '../src/services/inventoryService.ts';
import { restoreRecipeConsumptionForReference } from '../src/services/recipesService.ts';

describe('Inventory & Recipe Consumption Mock Suite', () => {
  it('lockInventoryRow creates missing row and returns quantity 0', async () => {
    const store: Record<string, any> = {};
    const client: any = {
      async query(sql: string, params: any[] = []) {
        const s = String(sql).toLowerCase();
        if (s.includes('select * from inventory') && s.includes('for update')) {
          const pid = params[0];
          const wid = params[1];
          const key = `${pid}:${wid}`;
          const row = store[key];
          return { rows: row ? [row] : [] };
        }
        if (s.startsWith('insert into inventory') && s.includes('values')) {
          const pid = params[0];
          const wid = params[1];
          const qty = Number(params[2] || 0);
          const key = `${pid}:${wid}`;
          store[key] = { product_id: pid, warehouse_id: wid, quantity: qty };
          return { rowCount: 1 };
        }
        if (s.startsWith('select quantity from inventory') && s.includes('for update')) {
          const pid = params[0];
          const wid = params[1];
          const key = `${pid}:${wid}`;
          return { rows: [{ quantity: store[key]?.quantity ?? 0 }] };
        }
        return { rows: [] };
      },
    };

    const row = await lockInventoryRow(client, 9999, 2);
    expect(row.product_id).toBe(9999);
    expect(row.warehouse_id).toBe(2);
    expect(Number(row.quantity)).toBe(0);
  });

  it('ensureInventoryRow inserts when absent', async () => {
    const store: Record<string, any> = {};
    const client: any = {
      async query(sql: string, params: any[] = []) {
        const s = String(sql).toLowerCase();
        if (s.startsWith('insert into inventory') && s.includes('on conflict')) {
          const pid = params[0];
          const wid = params[1];
          const key = `${pid}:${wid}`;
          if (!store[key]) store[key] = { product_id: pid, warehouse_id: wid, quantity: 0 };
          return { rowCount: 1 };
        }
        if (s.startsWith('select quantity from inventory') && s.includes('where')) {
          const pid = params[0];
          const wid = params[1];
          const key = `${pid}:${wid}`;
          return { rows: [{ quantity: store[key]?.quantity ?? 0 }] };
        }
        return { rows: [] };
      },
    };

    await ensureInventoryRow(client, 1234, 1);
    const res = await client.query('SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [1234, 1]);
    expect(res.rows[0].quantity).toBe(0);
  });

  it('restoreRecipeConsumptionForReference restores recorded ingredient consumption', async () => {
    const inventory = new Map<string, number>();
    const returns: any[] = [];
    const client: any = {
      async query(sql: string, params: any[] = []) {
        const s = String(sql).toLowerCase();
        if (s.includes('from stock_movements') && s.includes("movement_type = 'consumption'")) {
          return {
            rows: [
              { ingredient_product_id: 10, from_warehouse_id: 2, quantity: '3.500' },
              { ingredient_product_id: 11, from_warehouse_id: 3, quantity: '1.000' },
            ],
          };
        }
        if (s.startsWith('insert into inventory')) {
          const key = `${params[0]}:${params[1]}`;
          if (!inventory.has(key)) inventory.set(key, 0);
          return { rowCount: 1 };
        }
        if (s.startsWith('update inventory set quantity = quantity +')) {
          const qty = Number(params[0]);
          const key = `${params[1]}:${params[2]}`;
          inventory.set(key, Number(inventory.get(key) || 0) + qty);
          return { rowCount: 1 };
        }
        if (s.startsWith('insert into stock_movements')) {
          returns.push({ product_id: params[0], warehouse_id: params[1], quantity: Number(params[2]) });
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
    };

    const restored = await restoreRecipeConsumptionForReference(client, {
      referenceType: 'sale',
      referenceId: 77,
      warehouseId: 2,
      userId: 1,
    });

    expect(restored).toBe(true);
    expect(inventory.get('10:2')).toBe(3.5);
    expect(inventory.get('11:3')).toBe(1);
    expect(returns).toEqual([
      { product_id: 10, warehouse_id: 2, quantity: 3.5 },
      { product_id: 11, warehouse_id: 3, quantity: 1 },
    ]);
  });
});
