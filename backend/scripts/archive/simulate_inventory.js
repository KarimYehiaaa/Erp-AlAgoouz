#!/usr/bin/env node
import path from 'path';

(async () => {
    // local simplified implementation of consumeRecipeForSale (copied logic)
    const recipesService = {
        consumeRecipeForSale: async (client, { productId, soldQty, warehouseId, referenceType = 'sale', referenceId = null, userId }) => {
            const recipeResult = await client.query(
                `SELECT r.id
         FROM product_recipes r
         WHERE r.product_id = $1 AND r.deleted_at IS NULL AND r.is_active = TRUE
         LIMIT 1`,
                [productId]
            );

            if (!recipeResult.rows[0]) return;

            const recipeId = recipeResult.rows[0].id;

            const itemsRes = await client.query(
                `SELECT ri.*, p.name_ar as ingredient_name, p.unit as ingredient_unit
         FROM product_recipe_items ri
         JOIN products p ON p.id = ri.ingredient_product_id
         WHERE ri.recipe_id = $1
         ORDER BY ri.sort_order, ri.id`,
                [recipeId]
            );

            for (const item of itemsRes.rows) {
                const recipeUnit = String(item.unit_code || '').trim().toLowerCase();
                const stockUnit = String(item.ingredient_unit || '').trim().toLowerCase();

                // very small subset of conversion used in real service: g <-> g, kg <-> g
                const convertQty = (qty, from, to) => {
                    if (from === to) return qty;
                    if (from === 'kg' && to === 'g') return qty * 1000;
                    if (from === 'g' && to === 'kg') return qty / 1000;
                    return null;
                };

                const rawNeeded = Number(item.quantity) * Number(soldQty);
                const needed = convertQty(rawNeeded, recipeUnit, stockUnit);

                const lock = await client.query(
                    `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
                    [item.ingredient_product_id, warehouseId]
                );

                const currentQty = Number(lock.rows[0]?.quantity || 0);
                if (currentQty < needed) {
                    throw new Error(`مخزون المحل غير كافٍ للمكون ${item.ingredient_name}. المطلوب ${needed} ${stockUnit}`);
                }

                await client.query(
                    `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
             WHERE product_id = $2 AND warehouse_id = $3`,
                    [needed, item.ingredient_product_id, warehouseId]
                );

                await client.query(
                    `INSERT INTO stock_movements (
                 product_id, from_warehouse_id, movement_type, quantity,
                 reference_type, reference_id, user_id, notes
             ) VALUES ($1,$2,'consumption',$3,$4,$5,$6,$7)`,
                    [
                        item.ingredient_product_id,
                        warehouseId,
                        needed,
                        referenceType,
                        referenceId,
                        userId,
                        `استهلاك وصفة المنتج ${productId}`,
                    ]
                );
            }
        }
    };

    // simple in-memory "inventory" store keyed by product id
    const inventoryStore = {
        // ingredients and products
        101: 10000, // طحين (grams)
        102: 20,    // زبدة (kg)
        10: 50,     // منتج 10 (has recipe)
        20: 30,     // منتج 20 (no recipe)
    };

    const calls = [];

    const client = {
        async query(sql, params = []) {
            calls.push({ sql: String(sql).slice(0, 200), params });

            const s = String(sql).toLowerCase();

            // product_recipes check: only product 10 has a recipe
            if (s.includes('from product_recipes r')) {
                const pid = params[0];
                if (pid === 10) return { rows: [{ id: 1 }] };
                return { rows: [] };
            }

            // recipe items for recipe id 1
            if (s.includes('from product_recipe_items')) {
                const rid = params[0];
                if (rid === 1) {
                    return {
                        rows: [
                            { ingredient_product_id: 101, ingredient_name: 'طحين', ingredient_unit: 'g', unit_code: 'g', quantity: 200 },
                            // butter stored in kg, recipe unit_code uses g to test conversion path
                            { ingredient_product_id: 102, ingredient_name: 'زبدة', ingredient_unit: 'kg', unit_code: 'g', quantity: 50 }
                        ]
                    };
                }
                return { rows: [] };
            }

            // select quantity for update
            if (s.includes('select quantity from inventory') && s.includes('for update')) {
                const productId = params[0];
                return { rows: [{ quantity: inventoryStore[productId] ?? 0 }] };
            }

            // update inventory subtract
            if (s.startsWith('update inventory set quantity = quantity -') || s.includes('set quantity = quantity - $1')) {
                const needed = Number(params[0]);
                const pid = params[1];
                inventoryStore[pid] = (inventoryStore[pid] ?? 0) - needed;
                return { rowCount: 1 };
            }

            // update inventory add (restore)
            if (s.includes('update inventory set quantity = quantity +') || s.includes('do update set quantity = inventory.quantity +')) {
                const added = Number(params[0]);
                const pid = params[1];
                inventoryStore[pid] = (inventoryStore[pid] ?? 0) + added;
                return { rowCount: 1 };
            }

            // insert stock_movements or other inserts
            if (s.startsWith('insert into stock_movements') || s.startsWith('insert into sale_items') || s.startsWith('insert into inventory')) {
                return { rowCount: 1 };
            }

            return { rows: [] };
        }
    };

    console.log('\n=== بدء محاكاة استهلاك وصفة لمنتج (مجموعة سيناريوهات) ===');
    console.log('الرصيد قبل:', JSON.stringify(inventoryStore));
    console.log('سأشغّل السيناريوهات المجمعة للتحقق من السلوك.');

    // simulate direct product deduction logic similar to salesService
    const simulateDirectDeduction = async (client, productId, qty, warehouseId) => {
        const lock = await client.query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`, [productId, warehouseId]);
        const currentQty = Number(lock.rows[0]?.quantity || 0);
        if (currentQty < qty) throw new Error(`المخزون غير كافٍ. مطلوب ${qty} والمتاح ${currentQty}`);
        await client.query(`UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`, [qty, productId, warehouseId]);
        await client.query(`INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes) VALUES ($1,$2,'sale',$3,'sale',$4,$5,'بيع مباشر بدون وصفة')`, [productId, warehouseId, qty, 1000, 1]);
        return { productId, deducted: qty, remaining: inventoryStore[productId] };
    };

    console.log('\n=== اختبار خصم منتج بدون وصفة (كمية كافية) ===');
    try {
        const res = await simulateDirectDeduction(client, 10, 5, 2);
        console.log('نجاح:', res);
    } catch (err) {
        console.error('فشل:', err.message || err);
    }

    console.log('\n=== اختبار خصم منتج بدون وصفة (كمية غير كافية) ===');
    try {
        await simulateDirectDeduction(client, 10, 100, 2);
        console.log('هذا السطر لا يجب الوصول إليه');
    } catch (err) {
        console.error('النتيجة المتوقعة (خطأ):', err.message || err);
    }

    // --- comprehensive scenarios ---
    const scenarios = [];

    // scenario A: product 10 has recipe, sell 2 units => expect flour -400g, butter -0.1kg
    scenarios.push({
        name: 'وصفة: منتج 10 بيع 2',
        fn: async () => {
            await recipesService.consumeRecipeForSale(client, { productId: 10, soldQty: 2, warehouseId: 2, referenceType: 'sale', referenceId: 2000, userId: 1 });
            return { expected: { 101: 10000 - 400, 102: 20 - 0.1 } };
        }
    });

    // scenario B: product 20 no recipe, sell 5 units => expect product 20 decrease from 30 to 25
    scenarios.push({
        name: 'بدون وصفة: منتج 20 بيع 5',
        fn: async () => {
            const lock = await client.query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`, [20, 2]);
            const currentQty = Number(lock.rows[0]?.quantity || 0);
            const qty = 5;
            if (currentQty < qty) throw new Error('نقص مخزون');
            await client.query(`UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`, [qty, 20, 2]);
            await client.query(`INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes) VALUES ($1,$2,'sale',$3,'sale',$4,$5,'بيع مباشر بدون وصفة')`, [20, 2, qty, 2001, 1]);
            return { expected: { 20: 30 - 5 } };
        }
    });

    // scenario C: product 20 insufficient stock sell 100 => expect error
    scenarios.push({
        name: 'بدون وصفة: منتج 20 بيع 100 (نقص)',
        fn: async () => {
            const lock = await client.query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`, [20, 2]);
            const currentQty = Number(lock.rows[0]?.quantity || 0);
            const qty = 100;
            if (currentQty < qty) throw new Error(`المخزون غير كافٍ. مطلوب ${qty} والمتاح ${currentQty}`);
            await client.query(`UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`, [qty, 20, 2]);
            return { expected: {} };
        }
    });

    console.log('\n=== تشغيل السيناريوهات الإضافية ===');
    for (const sc of scenarios) {
        console.log('\n--- سيناريو:', sc.name, '---');
        try {
            const res = await sc.fn();
            if (res && res.expected) {
                let ok = true;
                for (const [pid, exp] of Object.entries(res.expected)) {
                    const actual = Number(inventoryStore[pid]);
                    if (Math.abs(actual - exp) > 0.0001) {
                        console.error(`فشل التحقق لمنتج ${pid}: متوقع ${exp} لكن ${actual}`);
                        ok = false;
                    }
                }
                if (ok) console.log('نجح التحقق');
            } else {
                console.log('انتهى بنجاح (لا توقعات محددة)');
            }
        } catch (err) {
            console.error('حدث خطأ:', err.message || err);
        }
    }

    console.log('\nالرصيد النهائي:', JSON.stringify(inventoryStore));
    console.log('الاستدعاءات المسجلة:', calls.map(c => ({ sql: c.sql, params: c.params })));

    console.log('\nانتهت المحاكاة.');
})();
