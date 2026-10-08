import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import {
  createCategory,
  createProduct,
  updateProduct,
  deleteCategory,
} from '../src/services/productService.ts';
import { productUpdateSchema } from '../src/routes/schemas.ts';

const skus: string[] = [];
const categoryNames: string[] = [];
let categoryId: number;
let deletedCategoryId: number;
let productId: number;
const productFields = (category: number | null = categoryId) => {
  const sku = `CATEGORY-${randomUUID()}`;
  skus.push(sku);
  return { sku, name_ar: 'Product category fixture', sale_price: 100, category_id: category };
};
const category = async () => {
  const name = `Product category ${randomUUID()}`;
  categoryNames.push(name);
  return (await createCategory({ name_ar: name, slug: randomUUID() })).id as number;
};
beforeEach(async () => {
  categoryId = await category();
  deletedCategoryId = await category();
  await deleteCategory(deletedCategoryId);
  productId = (await createProduct(productFields())).id;
});
afterEach(async () => {
  await query('DELETE FROM products WHERE sku = ANY($1::text[])', [skus.splice(0)]);
  await query('DELETE FROM product_categories WHERE name_ar = ANY($1::text[])', [
    categoryNames.splice(0),
  ]);
});
it('rejects creating a product in a deleted category without leaving a product', async () => {
  const data = productFields(deletedCategoryId);
  await expect(createProduct(data)).rejects.toMatchObject({ statusCode: 404 });
  expect((await query('SELECT id FROM products WHERE sku=$1', [data.sku])).rowCount).toBe(0);
});
it('rejects a deleted category and rolls back other product edits', async () => {
  await expect(
    updateProduct(productId, { category_id: deletedCategoryId, sale_price: 900 }),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(
    (await query('SELECT category_id,sale_price FROM products WHERE id=$1', [productId])).rows[0],
  ).toMatchObject({ category_id: categoryId, sale_price: 100 });
});
it('preserves explicit null in the API schema to clear a category', async () => {
  const data = productUpdateSchema.parse({ category_id: null });
  expect(data.category_id).toBeNull();
  await updateProduct(productId, data);
  expect(
    (await query('SELECT category_id FROM products WHERE id=$1', [productId])).rows[0].category_id,
  ).toBeNull();
});
it('keeps an existing category during a metadata-only update', async () => {
  await updateProduct(productId, { sale_price: 105 });
  expect(
    (await query('SELECT category_id FROM products WHERE id=$1', [productId])).rows[0].category_id,
  ).toBe(categoryId);
});
it('rejects a malformed category id as validation failure before changing a product', async () => {
  await expect(updateProduct(productId, { category_id: 0, sale_price: 900 })).rejects.toMatchObject(
    { statusCode: 400 },
  );
  expect(
    (await query('SELECT sale_price FROM products WHERE id=$1', [productId])).rows[0].sale_price,
  ).toBe(100);
});
it('rejects a non-scalar category without invoking object number conversion', async () => {
  await expect(
    updateProduct(productId, {
      category_id: { valueOf: 'invalid', toString: 'invalid' },
      sale_price: 900,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(
    (await query('SELECT sale_price FROM products WHERE id=$1', [productId])).rows[0].sale_price,
  ).toBe(100);
});
it('never leaves a product linked to a category deleted by a concurrent service call', async () => {
  const outcome = await Promise.allSettled([
    deleteCategory(categoryId),
    updateProduct(productId, { category_id: categoryId }),
  ]);
  expect(outcome[0].status).toBe('fulfilled');
  expect(
    (await query('SELECT category_id FROM products WHERE id=$1', [productId])).rows[0].category_id,
  ).toBeNull();
});
