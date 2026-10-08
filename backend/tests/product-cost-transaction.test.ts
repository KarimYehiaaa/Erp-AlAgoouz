import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pool, { query, withTransaction } from '../src/database/pool.ts';
import {
  recordMaintenancePrincipal,
  runSharedMaintenanceTask,
} from '../src/database/maintenanceBarrier.ts';
import { getProductEffectiveCost } from '../src/services/productCostService.ts';

let userId: number;
beforeAll(async () => {
  userId = (
    await query(
      `INSERT INTO users(username,password_hash,full_name,role_id)
    VALUES($1,'test-only','Cache fixture',(SELECT id FROM roles ORDER BY id LIMIT 1)) RETURNING id`,
      [`cache-${randomUUID()}`],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await query('DELETE FROM users WHERE id=$1', [userId]);
});

const authenticated = (work: () => Promise<void>) =>
  runSharedMaintenanceTask(async () => {
    const actor = (
      await query('SELECT session_generation,token_version FROM users WHERE id=$1', [userId])
    ).rows[0];
    recordMaintenancePrincipal(userId, actor.session_generation, Number(actor.token_version));
    await work();
  });
it('uses transaction-local recipe prices and never caches a rolled-back cost', async () => {
  await authenticated(async () => {
    const ids = (
      await query(
        `INSERT INTO products(sku,name_ar,unit,purchase_price,sale_price)
      VALUES($1,$2,'count',10,100),($3,$4,'count',0,100) RETURNING id`,
        [
          `cache-i-${randomUUID()}`,
          `cache ingredient ${randomUUID()}`,
          `cache-p-${randomUUID()}`,
          `cache product ${randomUUID()}`,
        ],
      )
    ).rows.map((row) => row.id);
    const recipeId = (
      await query(
        `INSERT INTO product_recipes(product_id,name_ar,is_active)
      VALUES($1,'cache recipe',TRUE) RETURNING id`,
        [ids[1]],
      )
    ).rows[0].id;
    try {
      await query(
        `INSERT INTO product_recipe_items(recipe_id,ingredient_product_id,quantity,unit_code)
        VALUES($1,$2,1,'count')`,
        [recipeId, ids[0]],
      );
      expect((await getProductEffectiveCost(pool, ids[1])).cost).toBe(10);
      const rollback = new Error('Intentional fixture rollback');
      await expect(
        withTransaction(async (client) => {
          await client.query('UPDATE products SET purchase_price=97 WHERE id=$1', [ids[0]]);
          expect((await getProductEffectiveCost(client, ids[1])).cost).toBe(97);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect((await getProductEffectiveCost(pool, ids[1])).cost).toBe(10);
    } finally {
      await query('DELETE FROM product_recipe_items WHERE recipe_id=$1', [recipeId]);
      await query('DELETE FROM product_recipes WHERE id=$1', [recipeId]);
      await query('DELETE FROM products WHERE id=ANY($1::int[])', [ids]);
    }
  });
});
