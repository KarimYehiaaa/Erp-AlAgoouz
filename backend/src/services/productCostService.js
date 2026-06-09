//  UNIT_ALIASES  E5/1 'D-BJB) 'DEH-Q/ DCD 'DEDA'*
// EO5/NQ1 DJO3*H1N/ AJ recipesService.js H costsService.js (/D'K EF 'D*C1'1
export const UNIT_ALIASES = {
  kg: 'kg',
  kilo: 'kg',
  'كيلو': 'kg',
  'كجم': 'kg',
  'جرام': 'g',
  g: 'g',
  gram: 'g',
  'g': 'g',
  l: 'l',
  liter: 'l',
  litre: 'l',
  'لتر': 'l',
  ml: 'ml',
  milli: 'ml',
  'مل': 'ml',
  count: 'count',
  unit: 'count',
  piece: 'count',
  pieces: 'count',
  'عدد': 'count',
  'قطعة': 'count',
};

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const normalizeUnit = (u) => UNIT_ALIASES[String(u || '').trim().toLowerCase()] || null;

export const convertQty = (qty, fromUnit, toUnit) => {
  if (fromUnit === toUnit) return qty;
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;
  if (fromUnit === 'l' && toUnit === 'ml') return qty * 1000;
  if (fromUnit === 'ml' && toUnit === 'l') return qty / 1000;
  return null;
};

export const unitPriceFor = (purchasePrice, productUnit, wantedUnit) => {
  const fromUnit = normalizeUnit(productUnit);
  const toUnit = normalizeUnit(wantedUnit);
  if (!fromUnit || !toUnit) return null;
  const converted = convertQty(1, fromUnit, toUnit);
  if (converted == null || converted === 0) return null;
  return Number(purchasePrice || 0) / converted;
};

export const calculateRecipeCost = (items = []) => {
  let totalCost = 0;
  for (const item of items) {
    const qty = Number(item.quantity || 0);
    if (!qty) continue;
    // prefer already-computed unit price (`ingredient_unit_price`) when available
    if (item.ingredient_unit_price != null) {
      totalCost += qty * Number(item.ingredient_unit_price || 0);
      continue;
    }
    const unitPrice = unitPriceFor(item.ingredient_purchase_price, item.ingredient_unit, item.unit_code);
    if (unitPrice == null) continue;
    totalCost += qty * unitPrice;
  }
  return roundMoney(totalCost);
};

const normalizeId = (value) => Number(value);

const loadProductBase = async (db, productId) => {
  const result = await db.query(
    `SELECT p.id, p.purchase_price
     FROM products p
     WHERE p.id = $1`,
    [productId]
  );
  return result.rows[0] || null;
};

const loadRecipeItems = async (db, productId) => {
  const result = await db.query(
    `SELECT
       r.id AS recipe_id,
       ri.id AS recipe_item_id,
       ri.ingredient_product_id,
       ri.quantity,
       ri.unit_code,
       ip.unit AS ingredient_unit
     FROM product_recipes r
     JOIN product_recipe_items ri ON ri.recipe_id = r.id
     JOIN products ip ON ip.id = ri.ingredient_product_id
     WHERE r.product_id = $1
       AND r.deleted_at IS NULL
       AND r.is_active = TRUE
     ORDER BY ri.sort_order, ri.id`,
    [productId]
  );
  return result.rows;
};

const resolveEffectiveCostRecursive = async (db, productId, cache, stack) => {
  const id = normalizeId(productId);
  if (!id) return { cost: 0, source: 'purchase_price' };
  if (cache.has(id)) return cache.get(id);
  if (stack.has(id)) {
    throw new Error(`Circular recipe dependency detected for product ${id}`);
  }

  const pending = (async () => {
    stack.add(id);
    try {
      const base = await loadProductBase(db, id);
      if (!base) {
        return { cost: 0, source: 'purchase_price' };
      }

      const purchasePrice = roundMoney(base.purchase_price || 0);
      const items = await loadRecipeItems(db, id);
      if (!items.length) {
        return { cost: purchasePrice, source: 'purchase_price' };
      }

      let totalCost = 0;
      for (const item of items) {
        const ingredient = await resolveEffectiveCostRecursive(db, item.ingredient_product_id, cache, stack);
        const unitPrice = unitPriceFor(ingredient.cost, item.ingredient_unit, item.unit_code);
        if (unitPrice == null) continue;
        totalCost += Number(item.quantity || 0) * unitPrice;
      }

      totalCost = roundMoney(totalCost);
      if (totalCost <= 0 && purchasePrice > 0) {
        return { cost: purchasePrice, source: 'purchase_price' };
      }

      return { cost: totalCost, source: 'recipe' };
    } finally {
      stack.delete(id);
    }
  })();

  cache.set(id, pending);
  const resolved = await pending;
  cache.set(id, resolved);
  return resolved;
};

export const getProductsEffectiveCosts = async (db, productIds = []) => {
  const ids = [...new Set(productIds.map(Number).filter(Boolean))];
  if (!ids.length) return new Map();

  const cache = new Map();
  const stack = new Set();
  const costs = new Map();
  for (const id of ids) {
    costs.set(id, await resolveEffectiveCostRecursive(db, id, cache, stack));
  }
  return costs;
};

export const getProductEffectiveCost = async (db, productId) => {
  const costs = await getProductsEffectiveCosts(db, [productId]);
  return costs.get(Number(productId)) || { cost: 0, source: 'purchase_price' };
};
