import { standalonePaymentSourceSql } from './paymentJournalSources.ts';
import { getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { parseLocalizedNumber } from '../utils/numberParsing.ts';
import { roundMoney } from '../utils/money.ts';
import { recalculateCustomerBalance } from './customerBalanceService.ts';
import { getDefaultWarehouseId } from './warehouseService.ts';
import { ensureInventoryRow } from './inventoryService.ts';
import { invoicesRepository } from '../repositories/invoices.repository.ts';
import { logger } from './loggerService.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { WAREHOUSE_GLOBAL_ROLES } from '../../../shared/permissions.js';
import { depleteInventoryCostLayers, restoreInventoryCostLayers } from './productCostService.ts';

const getInvoiceWarehouseScope = async (
  client,
  userId: number | null,
): Promise<number[] | null> => {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0) {
    throw new AppError('هوية المستخدم مطلوبة للتحقق من نطاق المخازن', 403);
  }
  const user = (
    await client.query(
      `SELECT r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [userId],
    )
  ).rows[0];
  if (!user) throw new AppError('المستخدم غير نشط', 403);
  if (WAREHOUSE_GLOBAL_ROLES.includes(user.role_name)) return null;
  const allowed = await getAllowedWarehouses(Number(userId), client);
  if (!allowed.length) throw new AppError('لا يوجد مخزن مصرح به للمستخدم', 403);
  return allowed;
};

const assertInvoiceSaleAccess = async (client, invoice, allowed: number[] | null) => {
  if (!invoice.sale_id) {
    if (allowed) throw new AppError('الفاتورة القديمة بدون مخزن تحتاج مراجعة المدير', 403);
    return;
  }
  const sale = (
    await client.query('SELECT warehouse_id, pos_shift_id, status FROM sales WHERE id = $1', [
      invoice.sale_id,
    ])
  ).rows[0];
  if (allowed && (!sale || !allowed.includes(Number(sale.warehouse_id)))) {
    throw new AppError('غير مصرح لك بتعديل فواتير هذا المخزن', 403);
  }
  if (sale?.pos_shift_id) {
    throw new AppError('تُعالج فاتورة الكاشير من مسار المبيعات للحفاظ على الوردية والنقدية', 409);
  }
  if (sale?.status === 'returned' || sale?.status === 'cancelled') {
    throw new AppError('لا يمكن تعديل أو حذف فاتورة بيع مرتجع أو ملغى', 409);
  }
};

const lockInvoiceForMutation = async (client, requestedId: number) => {
  const candidate = (
    await client.query(
      `SELECT id, sale_id FROM invoices WHERE (id = $1 OR sale_id = $1) AND deleted_at IS NULL
     ORDER BY CASE WHEN id = $1 THEN 1 ELSE 2 END LIMIT 1`,
      [requestedId],
    )
  ).rows[0];
  if (!candidate) return undefined;
  // Sales operations lock the sale before its invoices; use the same order here.
  if (candidate.sale_id)
    await client.query('SELECT id FROM sales WHERE id = $1 FOR UPDATE', [candidate.sale_id]);
  const invoice = (
    await client.query('SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [
      candidate.id,
    ])
  ).rows[0];
  if (invoice && invoice.sale_id !== candidate.sale_id) {
    throw new AppError('تغير ارتباط الفاتورة أثناء المعالجة؛ أعد المحاولة', 409);
  }
  return invoice;
};

const postInvoiceSaleJournal = async (client, saleId: number, replaceExisting = false) => {
  const sale = (await client.query('SELECT * FROM sales WHERE id = $1', [saleId])).rows[0];
  if (!sale) throw new AppError('البيع المرتبط بالفاتورة غير موجود', 409);
  const payments = (
    await client.query(
      `SELECT p.payment_method, p.amount, p.payment_number FROM payments p
     WHERE LOWER(TRIM(COALESCE(p.payment_method, 'cash'))) <> 'credit'
       AND NOT ${standalonePaymentSourceSql('p')}
       AND ((p.reference_type = 'sale' AND p.reference_id = $1)
        OR (p.reference_type = 'invoice' AND p.reference_id IN (SELECT id FROM invoices WHERE sale_id = $1)))`,
      [saleId],
    )
  ).rows;
  const paidAmount = roundMoney(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  if (paidAmount > roundMoney(Number(sale.total_amount))) {
    throw new AppError('مدفوعات الفاتورة تتجاوز إجماليها؛ يلزم مراجعتها', 409);
  }
  const { accountingService } = await import('./accountingService.ts');
  if (replaceExisting)
    await accountingService.deleteJournalEntryByReference(client, 'sale', saleId);
  await accountingService.postSaleJournalEntry(client, {
    ...sale,
    payments,
    paid_amount: paidAmount,
  });
};
const generateInvoiceNumber = async (client) => {
  const settings = await client.query(`SELECT value FROM settings WHERE key = 'invoice'`);
  const config = settings.rows[0]?.value || { prefix: 'INV' };
  const res = await client.query(`SELECT nextval('seq_invoices_number') AS next_val`);
  return `${config.prefix || 'INV'}-${String(res.rows[0].next_val).padStart(5, '0')}`;
};
/**
 * تحليل بيانات الفاتورة وتطبيع أصنافها (داخل معاملة).
 * @param {Record<string, any>} [data] بيانات الفاتورة
 * @returns {{ items: any[], discount_amount: number, tax_amount: number, total_amount: number, payment_status?: string }}
 */
const parseInvoiceData = (data: Record<string, any> = {}) => {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length)
    throw new AppError(
      '\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0646\u0648\u062F \u0641\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629',
    );
  let subtotal = 0;
  const parsedItems = items.map((item, idx) => {
    if (!item.product_id) {
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646\u062A\u062C \u0645\u0633\u062C\u0644 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629`,
      );
    }
    const productId = Number(item.product_id);
    const qty = parseLocalizedNumber(item.quantity);
    const price = parseLocalizedNumber(item.unit_price);
    const disc = parseLocalizedNumber(item.discount_amount ?? 0, 0);
    if (!Number.isFinite(qty) || qty <= 0)
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u0643\u0645\u064A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631`,
      );
    if (Math.abs(qty * 1000 - Math.round(qty * 1000)) > 0.000001) {
      throw new AppError(`البند رقم ${idx + 1}: دقة كمية المخزون لا تتجاوز ثلاث خانات عشرية`, 400);
    }
    if (!Number.isFinite(price) || price < 0)
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u0633\u0639\u0631 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0633\u0627\u0644\u0628`,
      );
    if (!Number.isFinite(disc) || disc < 0)
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u062E\u0635\u0645 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0633\u0627\u0644\u0628`,
      );
    if (disc > roundMoney(qty * price))
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u062E\u0635\u0645 \u064A\u062A\u062C\u0627\u0648\u0632 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0628\u0646\u062F`,
      );
    const lineTotal = qty * price - disc;
    subtotal += lineTotal;
    return {
      product_id: productId,
      description:
        item.description ||
        item.product_name ||
        '\u0648\u0635\u0641 \u0627\u0644\u0628\u0646\u062F',
      quantity: qty,
      unit_price: price,
      discount_amount: disc,
      total_amount: roundMoney(lineTotal),
      sort_order: idx,
    };
  });

  const discountPercent = parseLocalizedNumber(data.discount_percent ?? 0, 0);
  const percentDiscount = (subtotal * discountPercent) / 100;
  const fixedDiscount = parseLocalizedNumber(data.discount_amount ?? 0, 0);
  const discountAmount = roundMoney(percentDiscount + fixedDiscount);
  if (discountAmount < 0) throw new AppError('الخصم لا يمكن أن يكون أقل من صفر');
  if (discountAmount > subtotal) throw new AppError('الخصم لا يمكن أن يتجاوز إجمالي البنود');
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxPercent = parseLocalizedNumber(data.tax_percent ?? 0, 0);
  const taxAmount = data.tax_enabled ? roundMoney((afterDiscount * taxPercent) / 100) : 0;
  const totalAmount = roundMoney(afterDiscount + taxAmount);

  return {
    items: parsedItems,
    subtotal: roundMoney(subtotal),
    discountAmount,
    taxAmount,
    totalAmount,
    paymentStatus: data.payment_status || 'paid',
  };
};

const deductInvoiceInventory = async (
  client,
  invoiceId,
  items,
  userId,
  invoiceNumber,
  allowed: number[] | null,
) => {
  const productCosts = new Map<number, { quantity: number; cost: number }>();
  const recordDeduction = async (
    productId: number,
    warehouseId: number,
    quantity: number,
    fallbackCost: number,
  ) => {
    const layers = await depleteInventoryCostLayers(client, productId, warehouseId, quantity);
    const fullCost = roundMoney(
      layers.cost + Math.max(0, quantity - layers.quantity) * fallbackCost,
    );
    if (!Number.isFinite(fullCost) || fullCost < 0)
      throw new AppError('تكلفة المنتج غير صالحة للصرف', 409);
    await client.query(
      `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity,
         reference_type, reference_id, user_id, notes, invoice_layer_quantity, invoice_layer_cost, unit_cost, total_cost)
       VALUES ($1, $2, 'sale', $3, 'invoice', $4, $5, $6, $7, $8, $9, $10)`,
      [
        productId,
        warehouseId,
        quantity,
        invoiceId,
        userId,
        `صرف فاتورة مبيعات ${invoiceNumber}`,
        layers.quantity,
        layers.cost,
        fullCost / quantity,
        fullCost,
      ],
    );
    const previous = productCosts.get(productId) || { quantity: 0, cost: 0 };
    productCosts.set(productId, {
      quantity: previous.quantity + quantity,
      cost: previous.cost + fullCost,
    });
  };
  const defaultWhId = await getDefaultWarehouseId((text, params) => client.query(text, params));
  for (const item of [...items].sort((a, b) => Number(a.product_id) - Number(b.product_id))) {
    if (!item.product_id) continue;
    const productId = Number(item.product_id);
    const qty = Number(item.quantity || 0);
    if (qty <= 0) continue;

    const productRes = await client.query(
      `SELECT name_ar, primary_warehouse_id, purchase_price FROM products WHERE id = $1`,
      [productId],
    );
    const pName = productRes.rows[0]?.name_ar || 'المنتج';
    const preferredWhId = productRes.rows[0]?.primary_warehouse_id || defaultWhId;
    const targetWhId =
      allowed && !allowed.includes(Number(preferredWhId)) ? allowed[0] : preferredWhId;

    if (targetWhId) {
      await ensureInventoryRow(client, productId, targetWhId);
    }

    // قفل كافة سجلات مخزون المنتج أولاً FOR UPDATE لمنع أي سباق بيانات (TOCTOU)
    const lockRes = await client.query(
      `SELECT warehouse_id, quantity FROM inventory WHERE product_id = $1
       AND ($2::int[] IS NULL OR warehouse_id = ANY($2::int[])) ORDER BY warehouse_id FOR UPDATE`,
      [productId, allowed],
    );
    const globalTotal = lockRes.rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);

    if (globalTotal < qty - 1e-4) {
      throw new AppError(
        `لا يوجد مخزون كافٍ للمنتج (${pName}). المطلوب ${qty} والمتاح كلياً بالمنشأة ${globalTotal}`,
      );
    }

    let remainingNeeded = qty;

    if (targetWhId) {
      const targetRow = lockRes.rows.find((r) => Number(r.warehouse_id) === Number(targetWhId));
      const avail = Number(targetRow?.quantity || 0);
      if (avail > 0) {
        const deductQty = Math.min(avail, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, productId, targetWhId],
        );
        await recordDeduction(
          productId,
          Number(targetWhId),
          deductQty,
          Number(productRes.rows[0]?.purchase_price || 0),
        );
        remainingNeeded -= deductQty;
      }
    }
    if (remainingNeeded > 0.0001)
      throw new AppError('لم يكتمل صرف كمية الفاتورة؛ أعد المحاولة بعد مراجعة المخزون', 409);

    if (remainingNeeded > 1e-4) {
      const otherWhs = lockRes.rows
        .filter(
          (r) => Number(r.warehouse_id) !== Number(targetWhId || 0) && Number(r.quantity || 0) > 0,
        )
        .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));

      for (const row of otherWhs) {
        if (remainingNeeded <= 1e-4) break;
        const avail = Number(row.quantity || 0);
        const deductQty = Math.min(avail, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, productId, row.warehouse_id],
        );
        await recordDeduction(
          productId,
          Number(row.warehouse_id),
          deductQty,
          Number(productRes.rows[0]?.purchase_price || 0),
        );
        remainingNeeded -= deductQty;
      }
    }
  }
  return {
    unitCosts: new Map<number, number>(
      [...productCosts].map(([id, value]) => [
        id,
        value.quantity > 0 ? value.cost / value.quantity : 0,
      ]),
    ),
    totalCost: roundMoney([...productCosts.values()].reduce((sum, value) => sum + value.cost, 0)),
  };
};

const restoreInvoiceInventory = async (
  client,
  invoiceId,
  userId,
  invoiceNumber,
  allowed: number[] | null,
) => {
  const movements = (
    await client.query(
      `SELECT product_id,
              CASE WHEN movement_type = 'sale' THEN from_warehouse_id ELSE to_warehouse_id END AS from_warehouse_id,
              SUM(CASE WHEN movement_type = 'sale' THEN quantity ELSE -quantity END) AS quantity,
              SUM(CASE WHEN movement_type = 'sale' THEN invoice_layer_quantity ELSE -invoice_layer_quantity END) AS layer_quantity,
              SUM(CASE WHEN movement_type = 'sale' THEN invoice_layer_cost ELSE -invoice_layer_cost END) AS layer_cost,
              SUM(CASE WHEN movement_type = 'sale' THEN COALESCE(total_cost, 0) ELSE -COALESCE(total_cost, 0) END) AS total_cost
       FROM stock_movements WHERE reference_type = 'invoice' AND reference_id = $1
         AND movement_type IN ('sale', 'return')
       GROUP BY product_id, CASE WHEN movement_type = 'sale' THEN from_warehouse_id ELSE to_warehouse_id END
       HAVING SUM(CASE WHEN movement_type = 'sale' THEN quantity ELSE -quantity END) <> 0
           OR SUM(CASE WHEN movement_type = 'sale' THEN invoice_layer_quantity ELSE -invoice_layer_quantity END) <> 0
           OR SUM(CASE WHEN movement_type = 'sale' THEN invoice_layer_cost ELSE -invoice_layer_cost END) <> 0
       ORDER BY product_id, from_warehouse_id`,
      [invoiceId],
    )
  ).rows;

  for (const m of movements) {
    if (Number(m.quantity) <= 0)
      throw new AppError('حركات مخزون الفاتورة تحتاج مراجعة قبل المعالجة', 409);
    const layeredQty = Number(m.layer_quantity || 0);
    const layeredCost = Number(m.layer_cost || 0);
    const movementCost = Number(m.total_cost || 0);
    if (
      layeredQty < 0 ||
      layeredQty > Number(m.quantity) + 0.0001 ||
      layeredCost < 0 ||
      (layeredQty === 0 && layeredCost !== 0) ||
      movementCost < 0
    ) {
      throw new AppError('حركات تكلفة الفاتورة تحتاج مراجعة قبل المعالجة', 409);
    }
    if (allowed && !allowed.includes(Number(m.from_warehouse_id))) {
      throw new AppError('الفاتورة تحتوي حركة مخزون خارج صلاحيات المستخدم', 403);
    }
    await ensureInventoryRow(client, Number(m.product_id), Number(m.from_warehouse_id));
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
      [m.quantity, m.product_id, m.from_warehouse_id],
    );
    if (layeredQty > 0)
      await restoreInventoryCostLayers(
        client,
        Number(m.product_id),
        Number(m.from_warehouse_id),
        layeredQty,
        layeredCost / layeredQty,
        'invoice_return',
      );
    await client.query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes,
         invoice_layer_quantity, invoice_layer_cost, unit_cost, total_cost)
       VALUES ($1, $2, 'return', $3, 'invoice', $4, $5, $6, $7, $8, $9, $10)`,
      [
        m.product_id,
        m.from_warehouse_id,
        m.quantity,
        invoiceId,
        userId,
        `إعادة مخزون إثر إلغاء/تعديل فاتورة ${invoiceNumber}`,
        layeredQty,
        layeredCost,
        movementCost / Number(m.quantity),
        movementCost,
      ],
    );
  }
};

/**
 * جلب الفواتير مع فلترة وترقيم.
 * @param {Record<string, any>} [filters] خيارات الفلترة
 * @returns {Promise<{ rows: any[], total: number }>}
 */
const getInvoices = async (filters: Record<string, any> = {}) => {
  return await invoicesRepository.getInvoicesList(filters);
};
/** جلب فاتورة واحدة كاملة بأصنافها. */
const getInvoiceById = async (id: number) => {
  return await invoicesRepository.getInvoiceDetails(id);
};
/**
 * إنشاء فاتورة خدمات مع تحديث رصيد العميل.
 * @param {Record<string, any>} data بيانات الفاتورة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const createInvoice = async (data: Record<string, any>, userId: number) => {
  const {
    items: parsedItems,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    paymentStatus,
  } = parseInvoiceData(data);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const allowed = await getInvoiceWarehouseScope(client, userId);
    const whId = data.warehouse_id
      ? Number(data.warehouse_id)
      : (allowed?.[0] ??
        (await getDefaultWarehouseId((text, params) => client.query(text, params))));
    if (!whId || !Number.isInteger(whId) || whId < 1)
      throw new AppError('يلزم مخزن صالح لإنشاء الفاتورة', 400);
    if (allowed && !allowed.includes(whId)) throw new AppError('غير مصرح لك بهذا المخزن', 403);
    const invoiceNumber = await generateInvoiceNumber(client);
    const invResult = await client.query(
      `INSERT INTO invoices (
        invoice_number, sale_id, customer_id, invoice_type, subtotal, discount_amount,
        tax_amount, total_amount, payment_status, issued_at, due_date, notes, user_id, qr_data
      ) VALUES ($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        invoiceNumber,
        null,
        data.customer_id || null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paymentStatus,
        data.issued_at || new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        `INV:${invoiceNumber}`,
      ],
    );
    const invoice = invResult.rows[0];
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          invoice.id,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.total_amount,
          item.sort_order,
        ],
      );
    }
    const invoiceCosts = await deductInvoiceInventory(
      client,
      invoice.id,
      parsedItems,
      userId,
      invoiceNumber,
      allowed,
    );
    const stamp = Date.now();
    if (paymentStatus === 'paid') {
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [
          payNum,
          invoice.id,
          totalAmount,
          data.payment_method || 'cash',
          data.notes || null,
          userId,
        ],
      );
    } else if (paymentStatus === 'partial' && Number(data.paid_amount) > 0) {
      const paidAmt = Math.min(totalAmount, Number(data.paid_amount));
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, invoice.id, paidAmt, data.payment_method || 'cash', data.notes || null, userId],
      );
    }

    // Auto-create linked Wholesale Sale record for all invoices created in invoices section
    {
      // إصلاح N+1: جلب أسعار شراء جميع المنتجات دفعة واحدة بدلاً من query لكل بند
      const productIds = [...new Set(parsedItems.map((it) => Number(it.product_id)))];
      const purchasePriceMap = new Map();
      if (productIds.length > 0) {
        const pricesRes = await client.query(
          `SELECT id, purchase_price FROM products WHERE id = ANY($1::int[])`,
          [productIds],
        );
        for (const row of pricesRes.rows) {
          purchasePriceMap.set(Number(row.id), Number(row.purchase_price || 0));
        }
      }

      const costAmount = invoiceCosts.totalCost;
      const profitAmount = roundMoney(totalAmount - taxAmount - costAmount);
      if (!userId) throw new AppError('معرف المستخدم مطلوب لإنشاء الفاتورة', 400);

      const saleRes = await client.query(
        `INSERT INTO sales (
          sale_number, sale_type, sale_date, entry_mode, customer_id, warehouse_id, user_id,
          subtotal, discount_amount, tax_amount, tax_percent, total_amount, cost_amount, profit_amount,
          payment_status, status, notes
        ) VALUES ($1, 'wholesale', $2, 'invoice', $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, 'completed', $13)
        RETURNING id`,
        [
          `SL-${invoiceNumber}`,
          data.issued_at || new Date(),
          data.customer_id || null,
          whId,
          userId,
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          costAmount,
          profitAmount,
          paymentStatus,
          data.notes || null,
        ],
      );
      const createdSaleId = saleRes.rows[0].id;

      for (const item of parsedItems) {
        const costPrice =
          invoiceCosts.unitCosts.get(Number(item.product_id)) ??
          purchasePriceMap.get(Number(item.product_id)) ??
          0;
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
          [
            createdSaleId,
            item.product_id,
            item.quantity,
            item.unit_price,
            costPrice,
            item.discount_amount,
            item.total_amount,
          ],
        );
      }

      await client.query(`UPDATE invoices SET sale_id = $1 WHERE id = $2`, [
        createdSaleId,
        invoice.id,
      ]);
      await postInvoiceSaleJournal(client, createdSaleId);
    }

    if (data.customer_id) {
      await recalculateCustomerBalance(
        (text, params) => client.query(text, params),
        data.customer_id,
      );
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [
        userId,
        `\u0625\u0646\u0634\u0627\u0621 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoiceNumber}`,
        JSON.stringify({ invoice_id: invoice.id, total: totalAmount }),
      ],
    );
    await client.query('COMMIT');
    return getInvoiceById(invoice.id);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * تحديث فاتورة (عكس وتطبيق التغييرات على الرصيد).
 * @param {number} id معرف الفاتورة
 * @param {Record<string, any>} data الحقول الجديدة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const updateInvoice = async (id: number, data: Record<string, any>, userId: number) => {
  const {
    items: parsedItems,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    paymentStatus: requestedPaymentStatus,
  } = parseInvoiceData(data);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invoice = await lockInvoiceForMutation(client, id);
    if (!invoice)
      throw new AppError(
        '\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
        404,
      );
    if (invoice.payment_status === 'refunded') {
      throw new AppError('لا يمكن تعديل فاتورة مرتجعة', 409);
    }
    const allowed = await getInvoiceWarehouseScope(client, userId);
    await assertInvoiceSaleAccess(client, invoice, allowed);
    const existingPaymentSummary = (
      await client.query(
        `SELECT COALESCE(SUM(p.amount) FILTER (WHERE LOWER(TRIM(COALESCE(p.payment_method, 'cash'))) <> 'credit'), 0) AS total,
          COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(p.payment_method, 'cash'))) <> 'credit')::int AS receipt_count,
          COUNT(*) FILTER (WHERE LOWER(TRIM(COALESCE(p.payment_method, 'cash'))) = 'credit')::int AS credit_count
         FROM payments p WHERE (p.reference_type = 'invoice' AND p.reference_id = $1)
          OR (p.reference_type = 'sale' AND p.reference_id = $2)`,
        [invoice.id, invoice.sale_id],
      )
    ).rows[0];
    const existingPaid = Number(existingPaymentSummary.total || 0);
    if (roundMoney(existingPaid) > roundMoney(totalAmount)) {
      throw new AppError('إجمالي الفاتورة أقل من مدفوعاتها؛ يلزم معالجة الفرق قبل التعديل', 409);
    }
    let paymentStatus = requestedPaymentStatus;
    if (data.payment_status === undefined) {
      if (Number(existingPaymentSummary.credit_count) > 0) {
        paymentStatus =
          existingPaid >= totalAmount ? 'paid' : existingPaid > 0 ? 'partial' : 'unpaid';
      } else if (Number(existingPaymentSummary.receipt_count) > 0) {
        paymentStatus =
          existingPaid >= totalAmount ? 'paid' : existingPaid > 0 ? 'partial' : 'unpaid';
      } else {
        paymentStatus = invoice.payment_status;
      }
    } else if (data.payment_status !== 'paid') {
      const actualStatus =
        existingPaid >= totalAmount ? 'paid' : existingPaid > 0 ? 'partial' : 'unpaid';
      if (requestedPaymentStatus !== actualStatus) {
        throw new AppError(
          'حالة الفاتورة لا تطابق التحصيلات الفعلية؛ سجّل الدفعة أو راجع الحالة',
          409,
        );
      }
      paymentStatus = actualStatus;
    }
    await client.query(
      `UPDATE invoices SET
        customer_id = $1,
        subtotal = $2,
        discount_amount = $3,
        tax_amount = $4,
        total_amount = $5,
        payment_status = $6,
        issued_at = $7,
        due_date = $8,
        notes = $9,
        user_id = $10
       WHERE id = $11`,
      [
        data.customer_id || null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paymentStatus,
        data.issued_at || invoice.issued_at || new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        invoice.id,
      ],
    );
    await restoreInvoiceInventory(client, invoice.id, userId, invoice.invoice_number, allowed);
    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoice.id]);
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          invoice.id,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.total_amount,
          item.sort_order,
        ],
      );
    }
    const invoiceCosts = await deductInvoiceInventory(
      client,
      invoice.id,
      parsedItems,
      userId,
      invoice.invoice_number,
      allowed,
    );

    if (invoice.sale_id) {
      // إصلاح N+1: جلب أسعار شراء جميع المنتجات دفعة واحدة بدلاً من query لكل بند
      const productIds = [...new Set(parsedItems.map((it) => Number(it.product_id)))];
      const purchasePriceMap = new Map();
      if (productIds.length > 0) {
        const pricesRes = await client.query(
          `SELECT id, purchase_price FROM products WHERE id = ANY($1::int[])`,
          [productIds],
        );
        for (const row of pricesRes.rows) {
          purchasePriceMap.set(Number(row.id), Number(row.purchase_price || 0));
        }
      }

      const costAmount = invoiceCosts.totalCost;
      const profitAmount = roundMoney(totalAmount - taxAmount - costAmount);
      await client.query(
        `UPDATE sales SET
          customer_id = $1,
          subtotal = $2,
          discount_amount = $3,
          total_amount = $4,
          cost_amount = $5,
          profit_amount = $6,
          payment_status = $7,
          tax_amount = $9,
          updated_at = NOW()
         WHERE id = $8`,
        [
          data.customer_id || null,
          subtotal,
          discountAmount,
          totalAmount,
          costAmount,
          profitAmount,
          paymentStatus,
          invoice.sale_id,
          taxAmount,
        ],
      );
      await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [invoice.sale_id]);
      for (const item of parsedItems) {
        const costPrice =
          invoiceCosts.unitCosts.get(Number(item.product_id)) ??
          purchasePriceMap.get(Number(item.product_id)) ??
          0;
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
          [
            invoice.sale_id,
            item.product_id,
            item.quantity,
            item.unit_price,
            costPrice,
            item.discount_amount,
            item.total_amount,
          ],
        );
      }
    }

    if (data.payment_status === 'paid' && Number(existingPaid) < totalAmount - 0.01) {
      const remainingToPay = totalAmount - Number(existingPaid);
      const payNum = `PAY-INV${invoice.id}-${Date.now()}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [
          payNum,
          invoice.id,
          remainingToPay,
          data.payment_method || 'cash',
          data.notes || null,
          userId,
        ],
      );
    }
    if (invoice.sale_id) await postInvoiceSaleJournal(client, invoice.sale_id, true);
    const oldCustomerId = invoice.customer_id;
    const newCustomerId = data.customer_id || null;
    if (oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), oldCustomerId);
    }
    if (newCustomerId && newCustomerId !== oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), newCustomerId);
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [
        userId,
        `\u062A\u0639\u062F\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoice.invoice_number}`,
        JSON.stringify({ invoice_id: invoice.id, total: totalAmount }),
      ],
    );
    await client.query('COMMIT');
    return getInvoiceById(invoice.id);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * حذف فاتورة وعكس أثرها على رصيد العميل.
 * @param {number} id معرف الفاتورة
 * @param {number | null} [userId] معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const deleteInvoice = async (id: number, userId: number | null = null) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invoice = await lockInvoiceForMutation(client, id);
    if (!invoice)
      throw new AppError(
        '\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
        404,
      );

    const allowed = await getInvoiceWarehouseScope(client, userId);
    await assertInvoiceSaleAccess(client, invoice, allowed);
    if (invoice.payment_status === 'refunded') throw new AppError('لا يمكن حذف فاتورة مرتجعة', 409);
    if (invoice.sale_id) {
      const { accountingService } = await import('./accountingService.ts');
      await accountingService.deleteJournalEntryByReference(client, 'sale', invoice.sale_id);
      await client.query(`UPDATE sales SET deleted_at = NOW() WHERE id = $1`, [invoice.sale_id]);
    }
    await restoreInvoiceInventory(client, invoice.id, userId, invoice.invoice_number, allowed);
    await client.query(`UPDATE invoices SET deleted_at = NOW() WHERE id = $1`, [invoice.id]);
    if (invoice.customer_id) {
      await recalculateCustomerBalance(
        (text, params) => client.query(text, params),
        invoice.customer_id,
      );
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [
        userId,
        `\u062D\u0630\u0641 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoice.invoice_number}`,
        JSON.stringify({ invoice_id: id }),
      ],
    );
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * مزامنة الفواتير المستقلة (بدون بيع) مع مبيعات الجملة.
 * @returns {Promise<void>}
 */
const syncStandaloneInvoicesToWholesaleSales = async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // LIMIT 200: منع تراكم backlog غير محدود من إبطاء بدء التشغيل — يُكمل في الدورة التالية
    const unlinkedInvoices = await client.query(
      `SELECT i.* FROM invoices i
       WHERE i.sale_id IS NULL AND i.deleted_at IS NULL AND i.payment_status <> 'refunded'
       ORDER BY i.id
       LIMIT 200 FOR UPDATE SKIP LOCKED`,
    );
    for (const inv of unlinkedInvoices.rows) {
      if (!inv.user_id)
        throw new AppError(`الفاتورة ${inv.id} تحتاج تحديد المستخدم قبل ربطها ببيع`, 409);
      const itemsRes = await client.query(`SELECT * FROM invoice_items WHERE invoice_id = $1`, [
        inv.id,
      ]);
      const items = itemsRes.rows;

      // إصلاح N+1: جلب أسعار شراء جميع المنتجات دفعة واحدة بدلاً من query لكل بند
      const productIds = [...new Set(items.map((it) => Number(it.product_id)))];
      const purchasePriceMap = new Map();
      if (productIds.length > 0) {
        const pricesRes = await client.query(
          `SELECT id, purchase_price FROM products WHERE id = ANY($1::int[])`,
          [productIds],
        );
        for (const row of pricesRes.rows) {
          purchasePriceMap.set(Number(row.id), Number(row.purchase_price || 0));
        }
      }

      let costAmount = 0;
      for (const it of items) {
        const cost = purchasePriceMap.get(Number(it.product_id)) ?? 0;
        costAmount = roundMoney(costAmount + Number(it.quantity) * cost);
      }
      const totalAmount = Number(inv.total_amount || 0);
      const taxAmount = roundMoney(Number(inv.tax_amount || 0));
      const profitAmount = roundMoney(totalAmount - taxAmount - costAmount);
      const whId = await getDefaultWarehouseId(client);

      const saleRes = await client.query(
        `INSERT INTO sales (
          sale_number, sale_type, sale_date, entry_mode, customer_id, warehouse_id, user_id,
          subtotal, discount_amount, tax_amount, tax_percent, total_amount, cost_amount, profit_amount,
          payment_status, status, notes
        ) VALUES ($1, 'wholesale', $2, 'invoice', $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, 'completed', $13)
        RETURNING id`,
        [
          `SL-${inv.invoice_number}`,
          inv.issued_at || inv.created_at || new Date(),
          inv.customer_id,
          whId,
          inv.user_id,
          inv.subtotal || totalAmount,
          inv.discount_amount || 0,
          taxAmount,
          totalAmount,
          costAmount,
          profitAmount,
          inv.payment_status || 'unpaid',
          inv.notes || null,
        ],
      );
      const saleId = saleRes.rows[0].id;

      for (const it of items) {
        const cost = purchasePriceMap.get(Number(it.product_id)) ?? 0;
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
          [
            saleId,
            it.product_id,
            it.quantity,
            it.unit_price,
            cost,
            it.discount_amount || 0,
            it.total_amount,
          ],
        );
      }

      await client.query(`UPDATE invoices SET sale_id = $1 WHERE id = $2`, [saleId, inv.id]);
      await postInvoiceSaleJournal(client, saleId);
    }
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to sync standalone invoices to wholesale sales:', err);
  } finally {
    client.release();
  }
};

export {
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoices,
  parseInvoiceData,
  updateInvoice,
  syncStandaloneInvoicesToWholesaleSales,
  restoreInvoiceInventory,
  getInvoiceWarehouseScope,
};
