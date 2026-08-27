import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { getDefaultWarehouseId } from './warehouseService.ts';
import { parseLocalizedNumber } from '../utils/numberParsing.ts';
import { invalidateDashboardCache } from './dashboardService.ts';
import { roundMoney } from '../utils/money.ts';
import { appCache } from '../utils/cache.ts';
import { recalculateSupplierBalance } from './supplierService.ts';

/**
 * تحليل المبلغ المحلي (بفواصل عشرية عربية/أجنبية) إلى رقم.
 * @type {typeof parseLocalizedNumber}
 */
export const parsePurchaseAmount = parseLocalizedNumber;

// BUG-10 FIX: استخدام settings table مع FOR UPDATE lock بدل LIKE — يمنع race condition
const generateNumber = async (client) => {
  const yy = new Date().getFullYear();
  const res = await client.query(`SELECT nextval('seq_purchase_invoices_number') AS next_val`);
  const n = res.rows[0].next_val;
  return `PUR-${yy}-${String(n).padStart(4, '0')}`;
};

const normalizePurchasePayload = async (client, payload) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new AppError('لا توجد أصناف في الفاتورة', 400);

  let subtotal = 0;
  const normalized: any[] = [];

  const productIds = [...new Set(items.map((item) => Number(item.product_id)).filter(Boolean))];
  const productMap = new Map();
  if (productIds.length > 0) {
    const productsRes = await client.query(
      `SELECT p.id, p.name_ar, p.unit, p.primary_warehouse_id,
              EXISTS (
                SELECT 1
                FROM product_recipes r
                WHERE r.product_id = p.id
                  AND r.deleted_at IS NULL
                  AND r.is_active = TRUE
              ) AS has_active_recipe
       FROM products p
       WHERE p.id = ANY($1::int[]) AND p.deleted_at IS NULL`,
      [productIds],
    );
    for (const p of productsRes.rows) {
      productMap.set(Number(p.id), p);
    }
  }

  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = parseFloat(item.quantity);
    const unitPrice = parseFloat(item.unit_price);

    if (!productId) throw new AppError('المنتج مطلوب', 400);
    if (!isFinite(quantity) || quantity <= 0)
      throw new AppError('الكمية يجب أن تكون أكبر من صفر', 400);
    if (!isFinite(unitPrice) || unitPrice < 0) throw new AppError('سعر الوحدة غير صحيح', 400);

    const product = productMap.get(productId);
    if (!product) throw new AppError('المنتج غير موجود', 404);

    if (product.has_active_recipe) {
      throw new AppError(
        `لا يمكن شراء المنتج "${product.name_ar}" لأنه مرتبط بوصفة نشطة. عدّل الوصفة أولًا.`,
        400,
      );
    }

    let warehouseId = Number(product.primary_warehouse_id || 0);
    if (!warehouseId) {
      warehouseId =
        (await getDefaultWarehouseId((text, params) => client.query(text, params))) ?? 0;
    }
    if (!warehouseId) throw new AppError(`المنتج "${product.name_ar}" لا يملك مخزنًا محددًا`, 400);

    const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
    subtotal += lineTotal;
    normalized.push({
      product_id: productId,
      warehouse_id: warehouseId,
      unit: item.unit || product.unit || 'count',
      quantity,
      unit_price: unitPrice,
      total_amount: lineTotal,
    });
  }

  const warehouseCounts = {};
  for (const row of normalized) {
    warehouseCounts[row.warehouse_id] = (warehouseCounts[row.warehouse_id] || 0) + 1;
  }

  return {
    normalized,
    subtotal,
    invoiceWarehouseId: Number(
      Object.entries(warehouseCounts).sort((a, b) => (b[1] as number) - (a[1] as number))[0][0],
    ),
    supplierId: payload.supplier_id ? Number(payload.supplier_id) : null,
  };
};

const applyPurchaseItems = async (client, invoice, items, userId, notePrefix = 'شراء') => {
  for (const item of items) {
    await client.query(
      `INSERT INTO purchase_invoice_items (purchase_invoice_id, product_id, warehouse_id, unit, quantity, unit_price, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        invoice.id,
        item.product_id,
        item.warehouse_id,
        item.unit,
        item.quantity,
        item.unit_price,
        item.total_amount,
      ],
    );

    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity)
       VALUES ($1,$2,$3)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
       DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [item.product_id, item.warehouse_id, item.quantity],
    );

    await client.query(
      `INSERT INTO stock_movements (
        product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes
      ) VALUES ($1,$2,'purchase',$3,'purchase_invoice',$4,$5,$6)`,
      [
        item.product_id,
        item.warehouse_id,
        item.quantity,
        invoice.id,
        userId,
        `${notePrefix} - ${invoice.invoice_number}`,
      ],
    );
  }

  await refreshPurchasePrices(
    client,
    items.map((item) => item.product_id),
  );
};

const reversePurchaseItems = async (client, invoice, items, userId, notePrefix = 'إلغاء شراء') => {
  const shortages: any[] = [];

  // ترتيب العناصر تصاعدياً بناءً على product_id لمنع Deadlock عند القفل المتزامن
  const sortedItems = [...items].sort((a, b) => Number(a.product_id) - Number(b.product_id));
  for (const it of sortedItems) {
    const productId = Number(it.product_id);
    const warehouseId = Number(it.warehouse_id);
    const qty = Number(it.quantity);

    if (!productId || !warehouseId || !qty || qty <= 0) continue;

    const lock = await client.query(
      `SELECT quantity
       FROM inventory
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [productId, warehouseId],
    );

    const currentQty = Number(lock.rows[0]?.quantity || 0);
    const toRevert = Math.min(currentQty, qty);
    const notReverted = qty - toRevert;

    if (toRevert > 0) {
      await client.query(
        `UPDATE inventory
         SET quantity = quantity - $1, updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [toRevert, productId, warehouseId],
      );

      await client.query(
        `INSERT INTO stock_movements (
          product_id, from_warehouse_id, movement_type, quantity,
          reference_type, reference_id, user_id, notes
        ) VALUES ($1,$2,'purchase_reversal',$3,$4,$5,$6,$7)`,
        [
          productId,
          warehouseId,
          toRevert,
          'purchase_invoice',
          invoice.id,
          userId,
          `${notePrefix} - ${invoice.invoice_number}`,
        ],
      );
    }

    if (notReverted > 0) {
      shortages.push({
        product_id: productId,
        warehouse_id: warehouseId,
        requested: qty,
        reverted: toRevert,
        remaining: notReverted,
      });
    }
  }

  return shortages;
};

const refreshPurchasePrices = async (client, productIds) => {
  const uniqueIds = [...new Set(productIds.map(Number).filter(Boolean))];
  if (!uniqueIds.length) return;

  await client.query(
    `
    UPDATE products p
    SET purchase_price = COALESCE(latest.unit_price, p.purchase_price),
        updated_at = NOW()
    FROM (
      SELECT DISTINCT ON (pii.product_id)
             pii.product_id,
             pii.unit_price
      FROM purchase_invoice_items pii
      JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
      WHERE pii.product_id = ANY($1::int[])
        AND pi.deleted_at IS NULL
      ORDER BY pii.product_id, pi.invoice_date DESC, pi.id DESC, pii.id DESC
    ) latest
    WHERE p.id = latest.product_id
  `,
    [uniqueIds],
  );
  // أسعار الشراء تغيّرت — يجب إبطال كاش التكلفة الفعلية فوراً
  appCache.invalidateByTag('product_cost');
};

/**
 * جلب فواتير الشراء مع فلترة وترقيم.
 * @param {Record<string, any>} [filters] خيارات الفلترة (from_date, to_date, supplier_id, limit...)
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export const listPurchaseInvoices = async (filters: Record<string, any> = {}) => {
  let finalFilters = filters;
  if (typeof filters === 'number' || typeof filters === 'string') {
    finalFilters = { limit: filters };
  }
  const limit = Number(finalFilters.limit) || 100;
  const params: any[] = [];
  let sql = `SELECT pi.*,
      s.name_ar as supplier_name,
      COALESCE(item_wh.warehouse_name, w.name_ar) as warehouse_name,
      u.full_name as created_by_name,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', it.id,
          'product_id', it.product_id,
          'product_name', p.name_ar,
          'warehouse_id', COALESCE(it.warehouse_id, pi.warehouse_id),
          'warehouse_name', COALESCE(iw.name_ar, w.name_ar),
          'unit', it.unit,
          'quantity', it.quantity,
          'unit_price', it.unit_price,
          'total_amount', it.total_amount
        ) ORDER BY it.id)
        FROM purchase_invoice_items it
        JOIN products p ON p.id = it.product_id
        LEFT JOIN warehouses iw ON iw.id = COALESCE(it.warehouse_id, pi.warehouse_id)
        WHERE it.purchase_invoice_id = pi.id
      ), '[]'::json) as items
     FROM purchase_invoices pi
     JOIN warehouses w ON w.id = pi.warehouse_id
     LEFT JOIN suppliers s ON s.id = pi.supplier_id
     LEFT JOIN LATERAL (
       SELECT CASE
         WHEN COUNT(DISTINCT COALESCE(it.warehouse_id, pi.warehouse_id)) > 1 THEN 'متعدد'
         ELSE MAX(iw.name_ar)
       END AS warehouse_name
       FROM purchase_invoice_items it
       LEFT JOIN warehouses iw ON iw.id = COALESCE(it.warehouse_id, pi.warehouse_id)
       WHERE it.purchase_invoice_id = pi.id
     ) item_wh ON TRUE
     LEFT JOIN users u ON u.id = pi.created_by
     WHERE pi.deleted_at IS NULL`;

  let idx = 1;
  if (finalFilters.from_date) {
    sql += ` AND pi.invoice_date >= $${idx++}`;
    params.push(finalFilters.from_date);
  }
  if (finalFilters.to_date) {
    sql += ` AND pi.invoice_date <= $${idx++}`;
    params.push(finalFilters.to_date);
  }

  sql += ` ORDER BY pi.id DESC LIMIT $${idx}`;
  params.push(limit);

  const rows = await query(sql, params);
  return rows.rows;
};

/**
 * إنشاء فاتورة شراء مع تحديث المخزون وتكلفة المنتجات ورصيد المورد.
 * @param {Record<string, any>} payload بيانات الفاتورة (supplier_id, items...)
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const createPurchaseInvoice = async (payload: Record<string, any>, userId: number) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new AppError('لا توجد أصناف في الفاتورة', 400);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const invoiceNumber = await generateNumber(client);
    let subtotal = 0;

    const productIds = [...new Set(items.map((item) => Number(item.product_id)).filter(Boolean))];
    const productMap = new Map();
    if (productIds.length > 0) {
      const productsRes = await client.query(
        `SELECT p.id, p.name_ar, p.unit, p.primary_warehouse_id,
                EXISTS (
                  SELECT 1
                  FROM product_recipes r
                  WHERE r.product_id = p.id
                    AND r.deleted_at IS NULL
                    AND r.is_active = TRUE
                ) AS has_active_recipe
         FROM products p
         WHERE p.id = ANY($1::int[]) AND p.deleted_at IS NULL`,
        [productIds],
      );
      for (const p of productsRes.rows) {
        productMap.set(Number(p.id), p);
      }
    }

    const normalized: any[] = [];
    for (const item of items) {
      const productId = Number(item.product_id);
      // إصلاح الأرقام العشرية: parseFloat بدل Number عشان يقبل 0.5 و1.25 إلخ
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unit_price);

      if (!productId) throw new AppError('المنتج مطلوب', 400);
      if (!isFinite(quantity) || quantity <= 0)
        throw new AppError('الكمية يجب أن تكون أكبر من صفر', 400);
      if (!isFinite(unitPrice) || unitPrice < 0) throw new AppError('سعر الوحدة غير صحيح', 400);

      const product = productMap.get(productId);
      if (!product) throw new AppError('المنتج غير موجود', 404);
      if (product.has_active_recipe) {
        throw new AppError(
          `لا يمكن شراء المنتج "${product.name_ar}" لأنه مرتبط بوصفة نشطة. عدّل الوصفة أولًا.`,
          400,
        );
      }

      // كل منتج يروح لمخزنه الأساسي — إصلاح: لا يوجد تقييد بمخزن واحد للفاتورة
      let warehouseId = Number(product.primary_warehouse_id || 0);
      if (!warehouseId) {
        warehouseId =
          (await getDefaultWarehouseId((text, params) => client.query(text, params))) ?? 0;
      }
      if (!warehouseId)
        throw new AppError(`المنتج "${product.name_ar}" لا يملك مخزنًا محددًا`, 400);

      const lineTotal = roundMoney(quantity * unitPrice);
      subtotal += lineTotal;
      normalized.push({
        product_id: productId,
        warehouse_id: warehouseId,
        unit: item.unit || product.unit || 'count',
        quantity,
        unit_price: unitPrice,
        total_amount: lineTotal,
      });
    }

    // إصلاح: أزلنا تقييد "مخزن واحد فقط" — كل منتج يروح لمخزنه الأساسي تلقائياً
    // warehouse_id في الفاتورة الرئيسية = أكثر مخزن تكراراً
    const warehouseCounts = {};
    for (const r of normalized) {
      warehouseCounts[r.warehouse_id] = (warehouseCounts[r.warehouse_id] || 0) + 1;
    }
    const invoiceWarehouseId = Number(
      Object.entries(warehouseCounts).sort((a, b) => (b[1] as number) - (a[1] as number))[0][0],
    );

    const supplierId = payload.supplier_id ? Number(payload.supplier_id) : null;

    const inv = await client.query(
      `INSERT INTO purchase_invoices (invoice_number, invoice_date, warehouse_id, supplier_id, notes, subtotal, total_amount, created_by)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        invoiceNumber,
        payload.invoice_date || null,
        invoiceWarehouseId,
        supplierId,
        payload.notes || null,
        subtotal,
        subtotal,
        userId,
      ],
    );
    const invoice = inv.rows[0];

    for (const item of normalized) {
      await client.query(
        `INSERT INTO purchase_invoice_items (purchase_invoice_id, product_id, warehouse_id, unit, quantity, unit_price, total_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          invoice.id,
          item.product_id,
          item.warehouse_id,
          item.unit,
          item.quantity,
          item.unit_price,
          item.total_amount,
        ],
      );

      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity)
         VALUES ($1,$2,$3)
         ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [item.product_id, item.warehouse_id, item.quantity],
      );

      await client.query(
        `INSERT INTO stock_movements (
          product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes
        ) VALUES ($1,$2,'purchase',$3,'purchase_invoice',$4,$5,$6)`,
        [
          item.product_id,
          item.warehouse_id,
          item.quantity,
          invoice.id,
          userId,
          `شراء - ${invoice.invoice_number}`,
        ],
      );
    }

    await refreshPurchasePrices(
      client,
      normalized.map((item) => item.product_id),
    );

    if (supplierId) {
      await recalculateSupplierBalance(client, supplierId);
    }

    await client.query('COMMIT');
    invalidateDashboardCache();
    return invoice;
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * تحديث فاتورة شراء مع إعادة حساب المخزون والرصيد.
 * @param {number} invoiceId معرف الفاتورة
 * @param {Record<string, any>} payload البيانات الجديدة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const updatePurchaseInvoice = async (
  invoiceId: number,
  payload: Record<string, any>,
  userId: number,
) => {
  const id = Number(invoiceId);
  if (!id) throw new AppError('رقم الفاتورة غير صحيح', 400);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const inv = (
      await client.query(
        `SELECT * FROM purchase_invoices
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
        [id],
      )
    ).rows[0];

    if (!inv) throw new AppError('فاتورة الشراء غير موجودة', 404);

    const oldItems = (
      await client.query(`SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1`, [
        id,
      ])
    ).rows;

    const oldProductIds = oldItems.map((item) => item.product_id);
    const shortages = await reversePurchaseItems(
      client,
      inv,
      oldItems,
      userId,
      'تعديل شراء - عكس القديم',
    );

    await client.query(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1`, [id]);

    const { normalized, subtotal, invoiceWarehouseId, supplierId } = await normalizePurchasePayload(
      client,
      payload,
    );

    const updated = (
      await client.query(
        `UPDATE purchase_invoices
       SET invoice_date = COALESCE($2::date, invoice_date),
           warehouse_id = $3,
           supplier_id = $4,
           notes = $5,
           subtotal = $6,
           total_amount = $7
       WHERE id = $1
       RETURNING *`,
        [
          id,
          payload.invoice_date || null,
          invoiceWarehouseId,
          supplierId,
          payload.notes || null,
          subtotal,
          subtotal,
        ],
      )
    ).rows[0];

    await applyPurchaseItems(client, updated, normalized, userId, 'تعديل شراء');
    await refreshPurchasePrices(client, [
      ...oldProductIds,
      ...normalized.map((item) => item.product_id),
    ]);

    const oldSupplierId = inv.supplier_id;
    const newSupplierId = updated.supplier_id;
    if (oldSupplierId) {
      await recalculateSupplierBalance(client, oldSupplierId);
    }
    if (newSupplierId && newSupplierId !== oldSupplierId) {
      await recalculateSupplierBalance(client, newSupplierId);
    }

    await client.query('COMMIT');
    invalidateDashboardCache();
    return {
      success: true,
      updatedId: id,
      invoice_number: updated.invoice_number,
      shortages,
    };
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * حذف فاتورة شراء وعكس تأثيرها على المخزون والرصيد.
 * @param {number} invoiceId معرف الفاتورة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const deletePurchaseInvoice = async (invoiceId: number, userId: number) => {
  const id = Number(invoiceId);
  if (!id) throw new AppError('رقم الفاتورة غير صحيح', 400);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const inv = (
      await client.query(
        `SELECT * FROM purchase_invoices
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
        [id],
      )
    ).rows[0];

    if (!inv) throw new AppError('فاتورة الشراء غير موجودة', 404);

    const items = (
      await client.query(`SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1`, [
        id,
      ])
    ).rows;

    const shortages: any[] = [];
    const sortedItems = [...items].sort((a, b) => Number(a.product_id) - Number(b.product_id));
    for (const it of sortedItems) {
      const productId = Number(it.product_id);
      const warehouseId = Number(it.warehouse_id);
      const qty = Number(it.quantity);

      if (!productId || !warehouseId) continue;
      if (!qty || qty <= 0) continue;

      const lock = await client.query(
        `SELECT quantity
         FROM inventory
         WHERE product_id = $1 AND warehouse_id = $2
         FOR UPDATE`,
        [productId, warehouseId],
      );

      const currentQty = Number(lock.rows[0]?.quantity || 0);
      const toRevert = Math.min(currentQty, qty);
      const notReverted = qty - toRevert;

      if (toRevert > 0) {
        await client.query(
          `UPDATE inventory
           SET quantity = quantity - $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [toRevert, productId, warehouseId],
        );

        await client.query(
          `INSERT INTO stock_movements (
            product_id, from_warehouse_id, movement_type, quantity,
            reference_type, reference_id, user_id, notes
          ) VALUES ($1,$2,'purchase_reversal',$3,$4,$5,$6,$7)`,
          [
            productId,
            warehouseId,
            toRevert,
            'purchase_invoice',
            id,
            userId,
            `إلغاء شراء - ${inv.invoice_number}`,
          ],
        );
      }

      if (notReverted > 0) {
        shortages.push({
          product_id: productId,
          warehouse_id: warehouseId,
          requested: qty,
          reverted: toRevert,
          remaining: notReverted,
        });
      }
    }

    await client.query(`UPDATE purchase_invoices SET deleted_at = NOW() WHERE id = $1`, [id]);

    // BUG-06 FIX: إعادة سعر الشراء لكل منتج بالمتوسط المرجح من الفواتير المتبقية
    // حتى تظل حسابات التكلفة (COGS) صحيحة بعد الحذف
    const affectedProductIds = [
      ...new Set(items.map((it) => Number(it.product_id)).filter(Boolean)),
    ];
    await refreshPurchasePrices(client, affectedProductIds);

    if (inv.supplier_id) {
      await recalculateSupplierBalance(client, inv.supplier_id);
    }

    await client.query('COMMIT');
    invalidateDashboardCache();
    return { success: true, deletedId: id, invoice_number: inv.invoice_number, shortages };
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};
