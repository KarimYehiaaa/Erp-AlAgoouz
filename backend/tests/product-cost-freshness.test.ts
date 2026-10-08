import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import {
  recordMaintenancePrincipal,
  runSharedMaintenanceTask,
} from '../src/database/maintenanceBarrier.ts';
import { getProductEffectiveCost } from '../src/services/productCostService.ts';

let userId: number;
let ingredientId: number;
let productId: number;
let recipeId: number;
beforeEach(async () => {
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin' AND u.is_active = TRUE AND u.deleted_at IS NULL LIMIT 1",
    )
  ).rows[0].id;
  ingredientId = (
    await query(
      "INSERT INTO products (sku,name_ar,unit,purchase_price,sale_price) VALUES ($1,'Cost ingredient','count',10,20) RETURNING id",
      [`FRESH-I-${randomUUID()}`],
    )
  ).rows[0].id;
  productId = (
    await query(
      "INSERT INTO products (sku,name_ar,unit,purchase_price,sale_price) VALUES ($1,'Cost recipe','count',0,30) RETURNING id",
      [`FRESH-P-${randomUUID()}`],
    )
  ).rows[0].id;
  recipeId = (
    await query(
      "INSERT INTO product_recipes (product_id,name_ar,is_active) VALUES ($1,'Freshness recipe',TRUE) RETURNING id",
      [productId],
    )
  ).rows[0].id;
  await query(
    "INSERT INTO product_recipe_items (recipe_id,ingredient_product_id,quantity,unit_code) VALUES ($1,$2,1,'count')",
    [recipeId, ingredientId],
  );
});
afterEach(async () => {
  await query('DELETE FROM product_recipe_items WHERE recipe_id = $1', [recipeId]);
  await query('DELETE FROM product_recipes WHERE id = $1', [recipeId]);
  await query('DELETE FROM products WHERE id = ANY($1::int[])', [[ingredientId, productId]]);
});
const authenticated = (work: () => Promise<void>) =>
  runSharedMaintenanceTask(async () => {
    const actor = (
      await query('SELECT session_generation,token_version FROM users WHERE id = $1', [userId])
    ).rows[0];
    recordMaintenancePrincipal(userId, actor.session_generation, Number(actor.token_version));
    await work();
  });
const writeElsewhere = async (
  work: (client: Awaited<ReturnType<typeof getClient>>) => Promise<void>,
) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await work(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

it('sees another connection price update without relying on local cache invalidation', async () =>
  authenticated(async () => {
    expect((await getProductEffectiveCost({ query }, ingredientId)).cost).toBe(10);
    await writeElsewhere(async (client) => {
      await client.query('UPDATE products SET purchase_price = 20 WHERE id = $1', [ingredientId]);
    });
    expect((await getProductEffectiveCost({ query }, ingredientId)).cost).toBe(20);
  }));
it('sees a recipe change committed by another connection', async () =>
  authenticated(async () => {
    expect((await getProductEffectiveCost({ query }, productId)).cost).toBe(10);
    await writeElsewhere(async (client) => {
      await client.query('UPDATE product_recipe_items SET quantity = 3 WHERE recipe_id = $1', [
        recipeId,
      ]);
    });
    expect((await getProductEffectiveCost({ query }, productId)).cost).toBe(30);
  }));
it('reads prices and recipes from one snapshot rather than mixing two committed versions', async () =>
  authenticated(async () => {
    let calls = 0;
    const db = {
      query: async (sql: string, params?: unknown[]) => {
        const result = await query(sql, params);
        if (++calls === 1)
          await writeElsewhere(async (client) => {
            await client.query('UPDATE products SET purchase_price = 100 WHERE id = $1', [
              ingredientId,
            ]);
            await client.query(
              'UPDATE product_recipe_items SET quantity = 2 WHERE recipe_id = $1',
              [recipeId],
            );
          });
        return result;
      },
    };
    expect((await getProductEffectiveCost(db, productId)).cost).toBe(10);
    expect((await getProductEffectiveCost({ query }, productId)).cost).toBe(200);
  }));
