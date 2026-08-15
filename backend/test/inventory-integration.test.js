import test from 'node:test';
import assert from 'node:assert/strict';
import { lockInventoryRow, ensureInventoryRow } from '../src/services/inventoryService.ts';
import { restoreRecipeConsumptionForReference } from '../src/services/recipesService.ts';

test('lockInventoryRow creates missing row and returns quantity', async () => {
    const store = {};
    const client = {
        async query(sql, params = []) {
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

    // lock on non-existing row should create it and return quantity 0
    const row = await lockInventoryRow(client, 9999, 2);
    assert.equal(row.product_id, 9999);
    assert.equal(row.warehouse_id, 2);
    assert.equal(Number(row.quantity), 0);
});

test('ensureInventoryRow inserts when absent', async () => {
    const store = {};
    const client = {
        async query(sql, params = []) {
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
    assert.equal(res.rows[0].quantity, 0);
});

test('restoreRecipeConsumptionForReference restores recorded ingredient consumption once', async () => {
    const inventory = new Map();
    const returns = [];
    const client = {
        async query(sql, params = []) {
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

    assert.equal(restored, true);
    assert.equal(inventory.get('10:2'), 3.5);
    assert.equal(inventory.get('11:3'), 1);
    assert.deepEqual(returns, [
        { product_id: 10, warehouse_id: 2, quantity: 3.5 },
        { product_id: 11, warehouse_id: 3, quantity: 1 },
    ]);
});
