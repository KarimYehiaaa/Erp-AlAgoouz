import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { createCategory, updateCategory, deleteCategory } from '../src/services/productService.ts';
import { categoryUpdateSchema } from '../src/routes/schemas.ts';

const names: string[] = [];
const skus: string[] = [];
let rootId: number;
let childId: number;
const fields = (parentId?: number) => {
  const name = `Category hierarchy ${randomUUID()}`;
  names.push(name);
  return { name_ar: name, slug: `cat-${randomUUID()}`, parent_id: parentId };
};
const create = async (parentId?: number) => (await createCategory(fields(parentId))).id as number;
beforeEach(async () => {
  rootId = await create();
  childId = await create(rootId);
});
afterEach(async () => {
  await query('DELETE FROM products WHERE sku = ANY($1::text[])', [skus.splice(0)]);
  const ownedNames = names.splice(0);
  await query('UPDATE product_categories SET parent_id = NULL WHERE name_ar = ANY($1::text[])', [
    ownedNames,
  ]);
  await query('DELETE FROM product_categories WHERE name_ar = ANY($1::text[])', [ownedNames]);
});

it('preserves explicit null during validation and detaches a category from its parent', async () => {
  const data = categoryUpdateSchema.parse({ parent_id: null });
  expect(data.parent_id).toBeNull();
  expect((await updateCategory(childId, data)).parent_id).toBeNull();
});
it('keeps the parent when editing only the category name', async () => {
  expect((await updateCategory(childId, { sort_order: 2 })).parent_id).toBe(rootId);
});
it('rejects a self-parent without changing the saved hierarchy', async () => {
  await expect(updateCategory(childId, { parent_id: childId })).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(
    (await query('SELECT parent_id FROM product_categories WHERE id = $1', [childId])).rows[0]
      .parent_id,
  ).toBe(rootId);
});
it('rejects parenting an ancestor under its descendant', async () => {
  const grandchildId = await create(childId);
  await expect(updateCategory(rootId, { parent_id: grandchildId })).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(
    (await query('SELECT parent_id FROM product_categories WHERE id = $1', [rootId])).rows[0]
      .parent_id,
  ).toBeNull();
});
it('rejects creating under a deleted parent without leaving a category', async () => {
  await query('UPDATE product_categories SET deleted_at = NOW() WHERE id = $1', [rootId]);
  const data = fields(rootId);
  await expect(createCategory(data)).rejects.toMatchObject({ statusCode: 404 });
  expect(
    (await query('SELECT id FROM product_categories WHERE name_ar = $1', [data.name_ar])).rowCount,
  ).toBe(0);
});
it('rejects a deleted parent and rolls back the other updated fields', async () => {
  const deletedId = await create();
  await query('UPDATE product_categories SET deleted_at = NOW() WHERE id = $1', [deletedId]);
  await expect(
    updateCategory(childId, { parent_id: deletedId, sort_order: 99 }),
  ).rejects.toMatchObject({ statusCode: 404 });
  const row = (
    await query('SELECT parent_id, sort_order FROM product_categories WHERE id = $1', [childId])
  ).rows[0];
  expect(row).toMatchObject({ parent_id: rootId, sort_order: 0 });
});
it('promotes surviving children when deleting a parent and preserves their products', async () => {
  const sku = `CAT-${randomUUID()}`;
  skus.push(sku);
  await query(
    "INSERT INTO products (sku,name_ar,category_id,sale_price,purchase_price) VALUES ($1,'Category fixture',$2,10,5)",
    [sku, childId],
  );
  await deleteCategory(rootId);
  const child = (
    await query('SELECT parent_id, deleted_at FROM product_categories WHERE id = $1', [childId])
  ).rows[0];
  expect(child).toMatchObject({ parent_id: null, deleted_at: null });
  expect(
    (await query('SELECT category_id FROM products WHERE sku = $1', [sku])).rows[0].category_id,
  ).toBe(childId);
});
it('serializes opposing reparent operations so only one can succeed', async () => {
  const otherId = await create();
  const results = await Promise.allSettled([
    updateCategory(rootId, { parent_id: otherId }),
    updateCategory(otherId, { parent_id: rootId }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  const rows = (
    await query('SELECT id, parent_id FROM product_categories WHERE id = ANY($1::int[])', [
      [rootId, otherId],
    ])
  ).rows;
  expect(rows.filter((row) => row.parent_id === null)).toHaveLength(1);
});

it('rejects joining a pre-existing corrupt cycle without looping or creating a category', async () => {
  await query('UPDATE product_categories SET parent_id = $1 WHERE id = $2', [childId, rootId]);
  const data = fields(rootId);
  await expect(createCategory(data)).rejects.toMatchObject({ statusCode: 400 });
  expect(
    (await query('SELECT id FROM product_categories WHERE name_ar = $1', [data.name_ar])).rowCount,
  ).toBe(0);
});

it('serializes parent deletion against creating a child without leaving a dangling parent', async () => {
  const data = fields(rootId);
  const results = await Promise.allSettled([deleteCategory(rootId), createCategory(data)]);
  expect(results[0].status).toBe('fulfilled');
  const surviving = (
    await query('SELECT parent_id FROM product_categories WHERE name_ar = $1', [data.name_ar])
  ).rows;
  if (results[1].status === 'fulfilled') expect(surviving).toEqual([{ parent_id: null }]);
  else {
    expect(results[1].reason).toMatchObject({ statusCode: 404 });
    expect(surviving).toHaveLength(0);
  }
});
