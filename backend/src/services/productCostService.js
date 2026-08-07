import { appCache } from '../utils/cache.js';
import { roundMoney } from '../utils/money.js';

//   UNIT_ALIASES   E5/1 'D-BJB) 'DEH-Q/ DCD 'DEDA'*
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

export const getProductsEffectiveCosts = async (db, productIds = []) => {
  const ids = [...new Set(productIds.map(Number).filter(Boolean))];
  if (!ids.length) return new Map();

  const costs = new Map();
  const pendingIds = [];

  // Check memory cache first
  for (const id of ids) {
    const cachedVal = appCache.get(`product_cost_${id}`);
    if (cachedVal) {
      costs.set(id, cachedVal);
    } else {
      pendingIds.push(id);
    }
  }

  if (pendingIds.length > 0) {
    // 1. Fetch all products base data
    const prodRes = await db.query(
      `SELECT id, purchase_price, unit FROM products WHERE deleted_at IS NULL`
    );
    const productMap = new Map();
    for (const r of prodRes.rows) {
      productMap.set(Number(r.id), r);
    }

    // 2. Fetch all active recipe items
    const recipeItemsRes = await db.query(
      `SELECT
         r.product_id AS parent_product_id,
         ri.ingredient_product_id,
         ri.quantity,
         ri.unit_code,
         ip.unit AS ingredient_unit
       FROM product_recipes r
       JOIN product_recipe_items ri ON ri.recipe_id = r.id
       JOIN products ip ON ip.id = ri.ingredient_product_id
       WHERE r.deleted_at IS NULL AND r.is_active = TRUE`
    );
    
    const recipeMap = new Map();
    for (const item of recipeItemsRes.rows) {
      const parentId = Number(item.parent_product_id);
      if (!recipeMap.has(parentId)) {
        recipeMap.set(parentId, []);
      }
      recipeMap.get(parentId).push(item);
    }

    // 3. Resolve costs in-memory recursively
    const resolvedCache = new Map();
    const stack = new Set();

    const resolveCostInMemory = (id) => {
      const normalizedIdVal = normalizeId(id);
      if (!normalizedIdVal) return { cost: 0, source: 'purchase_price' };
      if (resolvedCache.has(normalizedIdVal)) return resolvedCache.get(normalizedIdVal);
      
      if (stack.has(normalizedIdVal)) {
        // Break circular dependency, fallback to base price
        const base = productMap.get(normalizedIdVal);
        return { cost: roundMoney(base?.purchase_price || 0), source: 'purchase_price' };
      }

      stack.add(normalizedIdVal);
      try {
        const base = productMap.get(normalizedIdVal);
        if (!base) {
          return { cost: 0, source: 'purchase_price' };
        }

        const purchasePrice = roundMoney(base.purchase_price || 0);
        const items = recipeMap.get(normalizedIdVal) || [];
        if (items.length === 0) {
          return { cost: purchasePrice, source: 'purchase_price' };
        }

        let totalCost = 0;
        for (const item of items) {
          const ingId = Number(item.ingredient_product_id);
          const ingredient = resolveCostInMemory(ingId);
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
        stack.delete(normalizedIdVal);
      }
    };

    // Run resolution and save to appCache
    for (const id of pendingIds) {
      const result = resolveCostInMemory(id);
      costs.set(id, result);
      appCache.set(`product_cost_${id}`, result, 15 * 60 * 1000, ['product_cost']);
    }
  }

  return costs;
};

export const getProductEffectiveCost = async (db, productId) => {
  const costs = await getProductsEffectiveCosts(db, [productId]);
  return costs.get(Number(productId)) || { cost: 0, source: 'purchase_price' };
};
