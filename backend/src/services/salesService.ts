// @ts-nocheck
import { salesRepository } from '../repositories/sales.repository.js';
import { getClient, query } from '../database/pool.js';
import { AppError } from '../types/errors.js';
import * as recipesService from './recipesService.js';
import { getProductEffectiveCost, getProductsEffectiveCosts } from './productCostService.js';
import * as inventoryService from './inventoryService.js';
import { getDefaultWarehouseId } from './warehouseService.js';
import { recalculateCustomerBalance } from './customerBalanceService.js';
import { invalidateDashboardCache } from './dashboardService.js';
import { broadcast } from './websocketService.js';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination.js';
import { roundMoney, parseAmount, sanitizeLimit } from '../utils/money.js';



export const calculateSaleTotals = (items = [], data = {}) => {
  const normalizedItems = [];
  let subtotal = 0;
  let itemDiscountTotal = 0;
  let itemsTotal = 0;

  for (const [idx, item] of items.entries()) {
    const productId = Number(item.product_id);
    const quantity = parseAmount(item.quantity);
    const unitPrice = parseAmount(item.unit_price);
    const discountAmount = parseAmount(item.discount_amount);
    const taxAmount = 0; // دائماً صفر لعدم وجود ضريبة

    if (!productId) throw new AppError(`Item ${idx + 1}: product is required`);
    if (quantity <= 0) throw new AppError(`Item ${idx + 1}: quantity must be greater than zero`);
    if (unitPrice < 0) throw new AppError(`Item ${idx + 1}: unit price cannot be negative`);
    if (discountAmount < 0) throw new AppError(`Item ${idx + 1}: discount cannot be negative`);

    const grossLineTotal = roundMoney(quantity * unitPrice);
    if (discountAmount > grossLineTotal) {
      throw new AppError(`Item ${idx + 1}: discount cannot exceed line total`);
    }

    const lineTotal = roundMoney(grossLineTotal - discountAmount + taxAmount);
    subtotal = roundMoney(subtotal + grossLineTotal);
    itemDiscountTotal = roundMoney(itemDiscountTotal + discountAmount);
    itemsTotal = roundMoney(itemsTotal + lineTotal);
    normalizedItems.push({
      ...item,
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total_amount: lineTotal,
    });
  }

  const discountAmount = roundMoney(parseAmount(data.discount_amount));
  if (discountAmount < 0) throw new AppError('Invoice discount cannot be negative');
  if (items.length && discountAmount > itemsTotal) {
    throw new AppError('Invoice discount cannot exceed invoice total');
  }

  const taxPercent = 0;
  const taxAmount = 0;

  const dailyTotal = roundMoney(parseAmount(data.total_amount));
  const totalAmount = items.length
    ? roundMoney(Math.max(0, itemsTotal - discountAmount + taxAmount))
    : dailyTotal;

  return {
    items: normalizedItems,
    subtotal,
    itemDiscountTotal,
    discountAmount,
    taxAmount,
    taxPercent,
    totalAmount,
  };
};

export const calculatePaidAmount = (paymentStatus = 'paid', totalAmount, rawPaidAmount = 0) => {
  if (!['paid', 'partial', 'unpaid'].includes(paymentStatus)) {
    throw new AppError('Invalid payment status');
  }

  if (paymentStatus === 'unpaid') return 0;
  if (paymentStatus === 'paid') return roundMoney(totalAmount);

  const paidAmount = roundMoney(parseAmount(rawPaidAmount));
  if (paidAmount <= 0) throw new AppError('Partial payment amount must be greater than zero');
  if (paidAmount >= totalAmount) throw new AppError('Partial payment amount must be less than invoice total');
  return paidAmount;
};

export const calculateOutstandingAmount = (totalAmount, paidAmount = 0) =>
  roundMoney(Math.max(0, parseAmount(totalAmount) - parseAmount(paidAmount)));

const SALE_TYPES = { branch: 'فرع', wholesale: 'جملة', pos: 'POS' };

const generateNumber = async (client, prefix, settingKey) => {
  const sequenceMap = {
    'sale': 'seq_sales_number',
    'invoice': 'seq_invoices_number'
  };
  const seqName = sequenceMap[settingKey] || 'seq_sales_number';
  // Note: pg doesn't support parameterized identifiers easily, so we interpolate safely since seqName is hardcoded
  const res = await client.query(`SELECT nextval('${seqName}') AS next_val`);
  return `${prefix}-${res.rows[0].next_val}`;
};

// BUG-08 FIX: جلب معلومات المخازن دفعة واحدة بدل N queries داخل حلقة
const resolveSaleWarehouseId = async (items = [], requestedWarehouseId = null) => {
  let warehouseId = requestedWarehouseId ? Number(requestedWarehouseId) : null;

  if (!warehouseId && items.length) {
    const productIds = items.map(it => it.product_id);

    // جلب مخازن المنتجات دفعة واحدة
    const productsRes = await query(
      `SELECT id, primary_warehouse_id FROM products WHERE id = ANY($1) AND deleted_at IS NULL`,
      [productIds]
    );
    const productMap = new Map(productsRes.rows.map(p => [Number(p.id), p.primary_warehouse_id]));
    const primaryWarehouses = [...new Set(productIds.map(id => productMap.get(id)).filter(Boolean))];

    if (primaryWarehouses.length === 1) {
      warehouseId = primaryWarehouses[0];
    } else if (primaryWarehouses.length > 1) {
      throw new AppError('المنتجات تنتمي لمخازن مختلفة — لا يمكن دمج المخازن');
    } else {
      // لا يوجد primary_warehouse — البحث في المخزون دفعة واحدة
      const invRes = await query(
        `SELECT DISTINCT ON (product_id) product_id, warehouse_id
         FROM inventory
         WHERE product_id = ANY($1)
         ORDER BY product_id, quantity DESC, id ASC`,
        [productIds]
      );
      const invMap = new Map(invRes.rows.map(r => [Number(r.product_id), r.warehouse_id]));
      const invWarehouses = [...new Set(productIds.map(id => invMap.get(id)).filter(Boolean))];

      if (invWarehouses.length === 1) {
        warehouseId = invWarehouses[0];
      } else if (invWarehouses.length > 1) {
        throw new AppError('المنتجات تنتمي لمخازن مختلفة — لا يمكن دمج المخازن');
      }
    }
  }

  if (!warehouseId) {
    warehouseId = await getDefaultWarehouseId();
  }
  if (!warehouseId) {
    throw new AppError('لا يمكن تحديد المخزن الافتراضي للبيع', 400);
  }
  return warehouseId;
};

const applySaleItems = async (client, { saleId, items, warehouseId, userId }) => {
  let costAmount = 0;

  const productIds = items.map((it) => Number(it.product_id));
  const costsMap = await getProductsEffectiveCosts(client, productIds);

  const recipeCheck = await client.query(
    `SELECT product_id FROM product_recipes
     WHERE product_id = ANY($1::int[]) AND deleted_at IS NULL AND is_active = TRUE`,
    [productIds]
  );
  const recipeSet = new Set(recipeCheck.rows.map((row) => Number(row.product_id)));

  const productNamesRes = await client.query(
    `SELECT id, name_ar FROM products WHERE id = ANY($1::int[])`,
    [productIds]
  );
  const productNamesMap = new Map(productNamesRes.rows.map((row) => [Number(row.id), row.name_ar]));

  const nonRecipeProductIds = productIds.filter((id) => !recipeSet.has(id));

  // 1. جلب المخزون الكلي لجميع المنتجات دفعة واحدة لتفادي استعلام N+1
  const globalStocksRes = await client.query(
    `SELECT product_id, COALESCE(SUM(quantity), 0) AS total 
     FROM inventory WHERE product_id = ANY($1::int[]) GROUP BY product_id`,
    [productIds]
  );
  const globalStockMap = new Map(globalStocksRes.rows.map(r => [Number(r.product_id), Number(r.total)]));

  // 2. حجز وقفل سطور المخزن الرئيسي للمنتجات دفعة واحدة
  if (nonRecipeProductIds.length > 0) {
    for (const pid of nonRecipeProductIds) {
      await inventoryService.ensureInventoryRow(client, pid, warehouseId);
    }
    const sortedIds = [...new Set(nonRecipeProductIds)].sort((a, b) => a - b);
    await client.query(
      `SELECT product_id, quantity FROM inventory
       WHERE warehouse_id = $1 AND product_id = ANY($2::int[])
       FOR UPDATE`,
      [warehouseId, sortedIds]
    );
  }

  // 3. جلب المخازن الفرعية المرشحة مرة واحدة فقط خارج الحلقة
  const warehousesRes = await client.query(
    `SELECT id FROM warehouses WHERE id <> $1 AND deleted_at IS NULL AND is_active = TRUE ORDER BY id`,
    [warehouseId]
  );
  const candidateWarehouseIds = warehousesRes.rows.map(w => Number(w.id));

  for (const it of items) {
    const qty = Number(it.quantity || 0);
    const unitPrice = Number(it.unit_price || 0);
    const lineTotal = it.total_amount;

    const effectiveCost = costsMap.get(Number(it.product_id)) || { cost: 0 };
    const costPrice = roundMoney(Number(effectiveCost.cost || 0) * qty);
    costAmount += costPrice;

    await client.query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [saleId, it.product_id, qty, unitPrice, costPrice, it.discount_amount || 0, it.tax_amount || 0, lineTotal]
    );

    if (recipeSet.has(Number(it.product_id))) {
      await recipesService.consumeRecipeForSale(client, {
        productId: it.product_id,
        soldQty: qty,
        warehouseId,
        referenceType: 'sale',
        referenceId: saleId,
        userId,
      });
    } else {
      const globalTotal = globalStockMap.get(Number(it.product_id)) || 0;
      if (globalTotal < qty) {
        const pName = productNamesMap.get(Number(it.product_id)) || 'المنتج';
        throw new AppError(
          `لا يوجد مخزون كافٍ كلي للمنتج ${pName} عبر جميع المخازن. المطلوب ${qty} والمتاح كلياً ${globalTotal}`
        );
      }

      // سحب المتاح من المخزن الرئيسي أولاً
      let remainingNeeded = qty;
      const primaryLock = await client.query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
        [it.product_id, warehouseId]
      );
      const primaryQty = Number(primaryLock.rows[0]?.quantity || 0);
      
      if (primaryQty > 0) {
        const deductQty = Math.min(primaryQty, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, it.product_id, warehouseId]
        );
        await client.query(
          `INSERT INTO stock_movements (
             product_id, from_warehouse_id, movement_type, quantity,
             reference_type, reference_id, user_id, notes
           ) VALUES ($1,$2,'sale',$3,'sale',$4,$5,'صرف مبيعات مباشر - مخزن رئيسي')`,
          [it.product_id, warehouseId, deductQty, saleId, userId]
        );
        remainingNeeded -= deductQty;
      }

      // سحب الباقي من المخازن الأخرى بالترتيب
      if (remainingNeeded > 0.0001) {
        for (const candidateWarehouseId of candidateWarehouseIds) {
          if (remainingNeeded <= 0) break;
          await inventoryService.ensureInventoryRow(client, it.product_id, candidateWarehouseId);
          const otherLock = await client.query(
            `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
            [it.product_id, candidateWarehouseId]
          );
          const otherQty = Number(otherLock.rows[0]?.quantity || 0);
          if (otherQty > 0) {
            const deductQty = Math.min(otherQty, remainingNeeded);
            await client.query(
              `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
               WHERE product_id = $2 AND warehouse_id = $3`,
              [deductQty, it.product_id, candidateWarehouseId]
            );
            await client.query(
              `INSERT INTO stock_movements (
                 product_id, from_warehouse_id, movement_type, quantity,
                 reference_type, reference_id, user_id, notes
               ) VALUES ($1,$2,'sale',$3,'sale',$4,$5,'صرف مبيعات مباشر - مخزن مساعد')`,
              [it.product_id, candidateWarehouseId, deductQty, saleId, userId]
            );
            remainingNeeded -= deductQty;
          }
        }
      }

      if (remainingNeeded > 0.0001) {
        const pName = productNamesMap.get(Number(it.product_id)) || 'المنتج';
        throw new AppError(`تعذر سحب الكمية بالكامل للمنتج ${pName} بسبب تغير المخزون في هذه اللحظة`);
      }
    }
  }

  return roundMoney(costAmount);
};

/** إنشاء بيع - كل أنواع البيع (فرع / جملة / POS) */
export const createDailySale = async (data, userId) => {
  const saleType = data.sale_type;
  if (!['branch', 'wholesale', 'pos'].includes(saleType)) {
    throw new AppError('نوع البيع غير صحيح. الأنواع المتاحة: branch أو wholesale أو pos');
  }

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const totals = calculateSaleTotals(rawItems, data);
  const items = totals.items;

  // تحديد المخزن مرة واحدة باستخدام resolveSaleWarehouseId (إزالة التكرار)
  const warehouseId = await resolveSaleWarehouseId(items, data.warehouse_id || null);
  let customerId = data.customer_id || null;
  if (data.customer_code && !customerId) {
    const c = await query(`SELECT id FROM customers WHERE code = $1 AND deleted_at IS NULL`, [data.customer_code]);
    customerId = c.rows[0]?.id || null;
  }

  if (saleType === 'wholesale' && !customerId) {
    throw new AppError('يجب اختيار وتحديد اسم العميل عند إنشاء مبيعات الجملة', 400);
  }

  let costAmount = 0;
  const subtotal = totals.subtotal;
  const totalAmount = totals.totalAmount;
  if (!totalAmount || totalAmount <= 0) throw new AppError('إجمالي المبيعات يجب أن يكون أكبر من صفر');

  const paymentStatus = data.payment_status || 'paid';
  // calculatePaidAmount يتحقق من حالة الدفع والمبلغ المسدد.
  const effectivePaidAmount = calculatePaidAmount(paymentStatus, totalAmount, data.paid_amount || 0);
  const saleDate = data.sale_date || new Date().toISOString().split('T')[0];
  let profitAmount = parseAmount(data.profit_amount);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const saleNumber = await generateNumber(client, 'SL', 'sale');

    const entryMode = items.length ? 'pos' : 'daily';

    const saleResult = await client.query(
      `INSERT INTO sales (
        sale_number, sale_type, sale_date, entry_mode, customer_id, warehouse_id, user_id,
        subtotal, discount_amount, tax_amount, tax_percent, total_amount, cost_amount, profit_amount,
        payment_status, status, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'completed',$16) RETURNING *`,
      [
        saleNumber, saleType, saleDate, entryMode, customerId, warehouseId, userId,
        subtotal || 0, totals.discountAmount || 0, totals.taxAmount || 0, totals.taxPercent || 0, totalAmount, costAmount, profitAmount,
        paymentStatus, data.notes || null,
      ]
    );
    const sale = saleResult.rows[0];

    // BUG-01 FIX: استخدام applySaleItems بدل تكرار نفس الكود مرتين
    if (items.length) {
      costAmount = await applySaleItems(client, { saleId: sale.id, items, warehouseId, userId });
      if (data.profit_amount === undefined || data.profit_amount === null || data.profit_amount === '') {
        profitAmount = roundMoney(totalAmount - costAmount);
      }
      await client.query(`UPDATE sales SET cost_amount = $1, profit_amount = $2 WHERE id = $3`, [costAmount, profitAmount, sale.id]);
    }

        // فاتورة المبيعات: لا ننشئ سداداً للفاتورة غير المدفوعة.
    if (effectivePaidAmount > 0) {
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
         VALUES ($1,'sale',$2,$3,$4,$5)`,
        [`PAY-${sale.id}`, sale.id, effectivePaidAmount, data.payment_method || 'cash', userId]
      );
    }

    const invNumber = await generateNumber(client, 'INV', 'invoice');
    await client.query(
      `INSERT INTO invoices (
        invoice_number, sale_id, customer_id, subtotal, discount_amount, tax_amount,
        total_amount, payment_status, user_id, qr_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        invNumber,
        sale.id,
        customerId,
        subtotal || totalAmount,
        totals.discountAmount || 0,
        totals.taxAmount || 0,
        totalAmount,
        paymentStatus,
        userId,
        `SALE:${sale.id}`,
      ]
    );

    if (customerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), customerId);
    }

    const typeLabel = SALE_TYPES[saleType] || saleType;
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [userId, `إنشاء مبيعات ${typeLabel} - ${saleDate}`, JSON.stringify({ sale_id: sale.id, amount: totalAmount })]
    );

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'create', sale_id: sale.id });
    return getSaleById(sale.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const updateSale = async (saleId, data, userId) => {
  const saleType = data.sale_type;
  if (!['branch', 'wholesale', 'pos'].includes(saleType)) {
    throw new AppError('نوع البيع غير صحيح. الأنواع المتاحة: branch أو wholesale أو pos');
  }

  let customerId = data.customer_id || null;
  if (data.customer_code && !customerId) {
    const c = await query(`SELECT id FROM customers WHERE code = $1 AND deleted_at IS NULL`, [data.customer_code]);
    customerId = c.rows[0]?.id || null;
  }

  if (saleType === 'wholesale' && !customerId) {
    throw new AppError('يجب اختيار وتحديد اسم العميل عند تعديل مبيعات الجملة', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existingSale = (await client.query(
      `SELECT * FROM sales WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [saleId]
    )).rows[0];
    if (!existingSale) throw new AppError('عملية البيع غير موجودة', 404);
    if (existingSale.status !== 'completed') throw new AppError('لا يمكن تعديل عملية غير مكتملة');

    const oldCustomerId = existingSale.customer_id;
    const oldItems = (await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId])).rows;
    const shouldReplaceItems = Array.isArray(data.items);
    const totals = calculateSaleTotals(shouldReplaceItems ? data.items : [], data);
    const items = totals.items;
    const entryMode = shouldReplaceItems ? (items.length ? 'pos' : 'daily') : existingSale.entry_mode;
    const saleDate = data.sale_date || existingSale.sale_date;
    const totalAmount = shouldReplaceItems && items.length
      ? totals.totalAmount
      : roundMoney(parseAmount(data.total_amount, existingSale.total_amount));

    if (!totalAmount || totalAmount <= 0) throw new AppError('إجمالي المبيعات يجب أن يكون أكبر من صفر');

    const paymentStatus = data.payment_status || existingSale.payment_status || 'paid';
    const effectivePaidAmount = calculatePaidAmount(paymentStatus, totalAmount, data.paid_amount || 0);
    const warehouseId = shouldReplaceItems && items.length
      ? await resolveSaleWarehouseId(items, data.warehouse_id || existingSale.warehouse_id)
      : (data.warehouse_id ? Number(data.warehouse_id) : existingSale.warehouse_id);

    let subtotal = shouldReplaceItems && items.length ? totals.subtotal : totalAmount;
    let costAmount = shouldReplaceItems ? 0 : roundMoney(parseAmount(data.cost_amount, existingSale.cost_amount));
    let profitAmount = parseAmount(data.profit_amount, existingSale.profit_amount);

    if (shouldReplaceItems) {
      if (oldItems.length > 0) {
        await restoreInventoryForSale(client, saleId, userId);
      }
      await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);

      if (items.length) {
        costAmount = await applySaleItems(client, { saleId, items, warehouseId, userId });
        if (data.profit_amount === undefined || data.profit_amount === null || data.profit_amount === '') {
          profitAmount = roundMoney(totalAmount - costAmount);
        }
      } else {
        subtotal = totalAmount;
        costAmount = 0;
        profitAmount = parseAmount(data.profit_amount, 0);
      }
    }

    await client.query(
      `UPDATE sales SET
        sale_type = $1,
        sale_date = $2,
        entry_mode = $3,
        customer_id = $4,
        warehouse_id = $5,
        subtotal = $6,
        discount_amount = $7,
        tax_amount = $8,
        tax_percent = $9,
        total_amount = $10,
        cost_amount = $11,
        profit_amount = $12,
        payment_status = $13,
        notes = $14,
        updated_at = NOW()
       WHERE id = $15`,
      [
        saleType,
        saleDate,
        entryMode,
        customerId,
        warehouseId || null,
        subtotal || 0,
        totals.discountAmount || 0,
        totals.taxAmount || 0,
        totals.taxPercent || 0,
        totalAmount,
        costAmount,
        profitAmount,
        paymentStatus,
        data.notes || null,
        saleId,
      ]
    );

    await client.query(`DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = $1`, [saleId]);
    if (effectivePaidAmount > 0) {
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
         VALUES ($1,'sale',$2,$3,$4,$5)`,
        [`PAY-${saleId}-${Date.now()}`, saleId, effectivePaidAmount, data.payment_method || 'cash', userId]
      );
    }

    await client.query(
      `UPDATE invoices SET
        customer_id = $1,
        subtotal = $2,
        discount_amount = $3,
        tax_amount = $4,
        total_amount = $5,
        payment_status = $6
       WHERE sale_id = $7 AND deleted_at IS NULL`,
      [customerId, subtotal || totalAmount, totals.discountAmount || 0, totals.taxAmount || 0, totalAmount, paymentStatus, saleId]
    );

    if (oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), oldCustomerId);
    }
    if (customerId && customerId !== oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), customerId);
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [userId, `تعديل فاتورة بيع ${existingSale.sale_number}`, JSON.stringify({ sale_id: saleId, amount: totalAmount })]
    );

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'update', sale_id: saleId });
    return getSaleById(saleId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getSales = async (filters = {}) => {
  return await salesRepository.getSalesList(filters);
};

export const getSalesSummary = async (filters = {}) => {
  let sql = `SELECT sale_type, sale_date,
    COUNT(*) FILTER (WHERE status = 'completed') as count,
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'completed'), 0) as total,
    COALESCE(SUM(profit_amount) FILTER (WHERE status = 'completed'), 0) as profit
    FROM sales WHERE deleted_at IS NULL`;
  const params = [];
  let idx = 1;
  if (filters.sale_type) { sql += ` AND sale_type = $${idx++}`; params.push(filters.sale_type); }
  if (filters.from_date) { sql += ` AND sale_date >= $${idx++}`; params.push(filters.from_date); }
  if (filters.to_date) { sql += ` AND sale_date <= $${idx++}`; params.push(filters.to_date); }
  sql += ` GROUP BY sale_type, sale_date ORDER BY sale_date DESC`;
  return (await query(sql, params)).rows;
};

export const getSaleById = async (id) => {
  const result = await query(
    `SELECT s.*, c.name_ar as customer_name, c.code as customer_code, u.full_name as user_name,
      (SELECT json_agg(json_build_object(
        'id', si.id, 'product_id', si.product_id, 'product_name', p.name_ar,
        'quantity', si.quantity, 'unit_price', si.unit_price,
        'discount_amount', si.discount_amount, 'tax_amount', si.tax_amount,
        'total_amount', si.total_amount
      )) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as items,
      (SELECT json_agg(json_build_object('method', payment_method, 'amount', amount))
       FROM payments WHERE reference_type='sale' AND reference_id = s.id) as payments
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('عملية البيع غير موجودة', 404);
  return result.rows[0];
};

/**
 * إصلاح returnSale: استعادة مكونات الوصفة لكل منتج على حدة
 * بدلاً من الاعتماد على نتيجة واحدة لـ restoreRecipeConsumptionForReference
 * التي كانت تتجاهل بعض المنتجات لو أي منها عنده consumption.
 */
export const returnSale = async (saleId, userId, notes) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const sale = (await client.query(`SELECT * FROM sales WHERE id = $1 FOR UPDATE`, [saleId])).rows[0];
    if (!sale) throw new AppError('عملية البيع غير موجودة', 404);
    if (sale.status === 'returned') throw new AppError('هذه العملية تم إرجاعها مسبقاً');

    const items = (await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId])).rows;

    if (items.length > 0) {
      for (const item of items) {
        const recipeCheck = await client.query(
          `SELECT 1 FROM product_recipes WHERE product_id = $1 AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`,
          [item.product_id]
        );
        if (recipeCheck.rows[0]) {
          // استعادة مكونات هذا المنتج بالذات (per-product restore)
          await recipesService.restoreRecipeConsumptionForProduct(client, {
            productId: item.product_id,
            soldQty: item.quantity,
            saleId,
            warehouseId: sale.warehouse_id,
            userId,
          });
        } else {
          // منتج عادي بدون وصفة — يرجع مباشرة للمخزون
          await client.query(
            `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
             ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
             DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
            [item.product_id, sale.warehouse_id, item.quantity]
          );
          await client.query(
            `INSERT INTO stock_movements (
               product_id, to_warehouse_id, movement_type, quantity,
               reference_type, reference_id, user_id, notes
             ) VALUES ($1,$2,'return',$3,'sale',$4,$5,'مرتجع عملية بيع')`,
            [item.product_id, sale.warehouse_id, item.quantity, saleId, userId]
          );
        }
      }
    }

    await client.query(
      `UPDATE sales SET status = 'returned', payment_status = 'refunded', notes = COALESCE(notes,'') || $2 WHERE id = $1`,
      [saleId, notes ? `\n[مرتجع] ${notes}` : '\n[مرتجع]']
    );
    await client.query(`UPDATE invoices SET payment_status = 'refunded' WHERE sale_id = $1`, [saleId]);

    if (sale.customer_id) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), sale.customer_id);
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [userId, `مرتجع بيع ${sale.sale_number}`, JSON.stringify({ sale_id: saleId })]
    );

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'return', sale_id: saleId });
    return getSaleById(saleId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const restoreInventoryForSale = async (client, saleId, userId) => {
  const sale = (await client.query(`SELECT warehouse_id FROM sales WHERE id = $1`, [saleId])).rows[0];
  if (!sale) return;

  const items = (await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId])).rows;

  for (const item of items) {
    const recipeCheck = await client.query(
      `SELECT 1 FROM product_recipes WHERE product_id = $1 AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`,
      [item.product_id]
    );
    if (recipeCheck.rows[0]) {
      // استعادة مكونات هذا المنتج بالذات (per-product restore)
      await recipesService.restoreRecipeConsumptionForProduct(client, {
        productId: item.product_id,
        soldQty: item.quantity,
        saleId,
        warehouseId: sale.warehouse_id,
        userId,
      });
    } else {
      // منتج عادي — يرجع للمخزون مباشرة
      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
         DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
        [item.product_id, sale.warehouse_id, item.quantity]
      );
      await client.query(
        `INSERT INTO stock_movements (
           product_id, to_warehouse_id, movement_type, quantity,
           reference_type, reference_id, user_id, notes
         ) VALUES ($1,$2,'return',$3,'sale',$4,$5,'استرداد مخزون عملية بيع')`,
        [item.product_id, sale.warehouse_id, item.quantity, saleId, userId]
      );
    }
  }
};

export const deleteAllSales = async (userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const countResult = await client.query(
      `SELECT COUNT(*)::int as count FROM sales WHERE deleted_at IS NULL`
    );
    const deletedCount = countResult.rows[0]?.count || 0;

    if (deletedCount > 0) {
      // Find all affected customers
      const customersRes = await client.query(
        `SELECT DISTINCT customer_id FROM sales WHERE deleted_at IS NULL AND customer_id IS NOT NULL`
      );

      // Restore inventory for POS sales (which have entry_mode = 'pos')
      const posSales = await client.query(
        `SELECT id FROM sales WHERE deleted_at IS NULL AND entry_mode = 'pos'`
      );
      for (const row of posSales.rows) {
        await restoreInventoryForSale(client, row.id, userId);
      }

      await client.query(
        `UPDATE sales
         SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE deleted_at IS NULL`
      );
      await client.query(
        `UPDATE invoices
         SET deleted_at = NOW()
         WHERE sale_id IN (SELECT id FROM sales WHERE deleted_at IS NOT NULL) AND deleted_at IS NULL`
      );

      // Recalculate balances
      for (const row of customersRes.rows) {
        await recalculateCustomerBalance((text, params) => client.query(text, params), row.customer_id);
      }
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1,'sales',$2,$3)`,
      [userId, 'حذف المبيعات الحالية', JSON.stringify({ deleted_count: deletedCount })]
    );

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'delete_all' });
    return { deletedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const deleteSalesByDate = async (saleDate, userId) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(saleDate || ''))) {
    throw new AppError('تاريخ البيع غير صحيح. الصيغة المطلوبة YYYY-MM-DD', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const countResult = await client.query(
      `SELECT COUNT(*)::int as count
       FROM sales
       WHERE deleted_at IS NULL AND sale_date = $1::date`,
      [saleDate]
    );
    const deletedCount = countResult.rows[0]?.count || 0;

    if (deletedCount > 0) {
      // Find affected customers
      const customersRes = await client.query(
        `SELECT DISTINCT customer_id FROM sales WHERE deleted_at IS NULL AND sale_date = $1::date AND customer_id IS NOT NULL`,
        [saleDate]
      );

      // Restore inventory for POS sales (which have entry_mode = 'pos')
      const posSales = await client.query(
        `SELECT id FROM sales WHERE deleted_at IS NULL AND sale_date = $1::date AND entry_mode = 'pos'`,
        [saleDate]
      );
      for (const row of posSales.rows) {
        await restoreInventoryForSale(client, row.id, userId);
      }

      await client.query(
        `UPDATE sales
         SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE deleted_at IS NULL AND sale_date = $1::date`,
        [saleDate]
      );
      await client.query(
        `UPDATE invoices i
         SET deleted_at = NOW()
         WHERE i.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM sales s
             WHERE s.id = i.sale_id
               AND s.sale_date = $1::date
               AND s.deleted_at IS NOT NULL
           )`,
        [saleDate]
      );

      // Recalculate balances
      for (const row of customersRes.rows) {
        await recalculateCustomerBalance((text, params) => client.query(text, params), row.customer_id);
      }
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1,'sales',$2,$3)`,
      [userId, `حذف مبيعات بتاريخ ${saleDate}`, JSON.stringify({ sale_date: saleDate, deleted_count: deletedCount })]
    );

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'delete_date', date: saleDate });
    return { deletedCount, saleDate };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const deleteSalesByType = async (saleType, userId) => {
  if (!['branch', 'wholesale'].includes(saleType)) {
    throw new AppError('نوع البيع غير صالح', 400);
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const countResult = await client.query(
      `SELECT COUNT(*)::int as count FROM sales WHERE deleted_at IS NULL AND sale_type = $1`,
      [saleType]
    );
    const deletedCount = countResult.rows[0]?.count || 0;
    if (deletedCount > 0) {
      // Find affected customers
      const customersRes = await client.query(
        `SELECT DISTINCT customer_id FROM sales WHERE deleted_at IS NULL AND sale_type = $1 AND customer_id IS NOT NULL`,
        [saleType]
      );

      // Restore inventory for POS sales (which have entry_mode = 'pos')
      const posSales = await client.query(
        `SELECT id FROM sales WHERE deleted_at IS NULL AND sale_type = $1 AND entry_mode = 'pos'`,
        [saleType]
      );
      for (const row of posSales.rows) {
        await restoreInventoryForSale(client, row.id, userId);
      }

      await client.query(
        `UPDATE sales SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE deleted_at IS NULL AND sale_type = $1`,
        [saleType]
      );
      await client.query(
        `UPDATE invoices SET deleted_at = NOW()
         WHERE deleted_at IS NULL AND sale_id IN (
           SELECT id FROM sales WHERE sale_type = $1 AND deleted_at IS NOT NULL
         )`,
        [saleType]
      );

      // Recalculate balances
      for (const row of customersRes.rows) {
        await recalculateCustomerBalance((text, params) => client.query(text, params), row.customer_id);
      }
    }
    const typeLabel = saleType === 'branch' ? 'فرع' : 'جملة';
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [userId, `حذف كل مبيعات ${typeLabel}`, JSON.stringify({ sale_type: saleType, deleted_count: deletedCount })]
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'delete_type', type: saleType });
    return { deletedCount, saleType };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


// BUG-05 FIX: إضافة حد أقصى للاستيراد لتجنب استنزاف الاتصالات
export const importDailySales = async (rows, userId) => {
  const MAX_IMPORT = 500;
  if (rows.length > MAX_IMPORT) {
    throw new AppError(`الحد الأقصى للاستيراد هو ${MAX_IMPORT} سطر دفعة واحدة`, 400);
  }
  const results = { success: 0, failed: [], total: rows.length };
  for (let i = 0; i < rows.length; i++) {
    try {
      await createDailySale(rows[i], userId);
      results.success++;
    } catch (err) {
      results.failed.push({ row: i + 2, message: err.message, data: rows[i] });
    }
  }
  return results;
};



