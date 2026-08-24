/**
 * Branch sales Excel service.
 * Cleaned version with explicit headers and strict parsing.
 */
import XLSX from 'xlsx';
import { AppError } from '../types/errors.ts';
import { query } from '../database/pool.ts';
import { createDailySale } from './salesService.ts';
import { getDefaultWarehouseId } from './warehouseService.ts';
import { readSafeWorkbook } from './excelSecurity.ts';

const HEADER_ALIASES = {
  sale_date: ['sale_date', 'date', 'التاريخ'],
  sku: ['sku', 'product_code', 'code', 'الكود', 'sku_code'],
  product_name: ['product_name', 'name', 'اسم المنتج'],
  category: ['category', 'التصنيف'],
  unit_price: ['unit_price', 'price', 'السعر'],
  quantity: ['quantity', 'qty', 'الكمية'],
  payment_method: ['payment_method', 'method', 'طريقة الدفع'],
  notes: ['notes', 'note', 'ملاحظات'],
};

const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const normalizeDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[\u200f\u200e]/g, '')
    .trim();

const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const text = normalizeDigits(value).replace(/,/g, '').trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatYmd = (year, month, day) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const isValidDateParts = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
};

const parseDate = (value) => {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatYmd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number') {
    const dc = XLSX.SSF.parse_date_code(value);
    if (!dc) return null;
    return isValidDateParts(dc.y, dc.m, dc.d) ? formatYmd(dc.y, dc.m, dc.d) : null;
  }

  const text = normalizeDigits(value);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return isValidDateParts(y, m, d) ? formatYmd(y, m, d) : null;
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const y = Number(compact[1]);
    const m = Number(compact[2]);
    const d = Number(compact[3]);
    return isValidDateParts(y, m, d) ? formatYmd(y, m, d) : null;
  }

  const delimited = text.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/);
  if (delimited && delimited[3].length === 4) {
    const a = Number(delimited[1]);
    const b = Number(delimited[2]);
    const y = Number(delimited[3]);
    const dayFirst = isValidDateParts(y, b, a);
    const monthFirst = isValidDateParts(y, a, b);
    if (dayFirst && !monthFirst) return formatYmd(y, b, a);
    if (!dayFirst && monthFirst) return formatYmd(y, a, b);
    if (dayFirst && monthFirst) return formatYmd(y, b, a);
  }

  return null;
};

const normalizePaymentMethod = (value) => {
  const text = normalizeText(value);
  if (!text || ['cash', 'نقدي', 'كاش'].includes(text)) return 'cash';
  if (['card', 'بطاقة', 'فيزا'].includes(text)) return 'card';
  if (['transfer', 'تحويل'].includes(text)) return 'transfer';
  if (['credit', 'اجل', 'آجل'].includes(text)) return 'credit';
  return 'cash';
};

const resolveHeaderRow = (rows) => {
  for (let i = 0; i < rows.length; i++) {
    const firstRow = rows[i] || [];
    const normalized = firstRow.map((cell) => normalizeText(cell));
    if (
      normalized.some((cell) =>
        HEADER_ALIASES.sale_date.some(
          (alias) => cell === normalizeText(alias) || cell.includes(normalizeText(alias)),
        ),
      )
    ) {
      return i;
    }
  }
  return -1;
};

const findIndex = (headers, aliases) =>
  headers.findIndex((header) =>
    aliases.some(
      (alias) => header === normalizeText(alias) || header.includes(normalizeText(alias)),
    ),
  );

const getStoreWarehouseId = async () => {
  const res = await query(
    `SELECT id FROM warehouses WHERE (type = 'store' OR code = 'STORE') AND deleted_at IS NULL AND is_active = TRUE ORDER BY id ASC LIMIT 1`,
  );
  if (res.rows[0]) return Number(res.rows[0].id);
  return await getDefaultWarehouseId();
};

const fetchBranchProducts = async (warehouseId) => {
  const resolvedWarehouseId = Number(warehouseId) || (await getStoreWarehouseId());
  const res = await query(
    `SELECT p.id, p.sku, p.name_ar, p.sale_price, p.unit,
            pc.name_ar AS category_name,
            COALESCE(inv.quantity, 0) AS store_stock,
            EXISTS (
              SELECT 1
              FROM product_recipes r
              WHERE r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
            ) AS has_recipe
     FROM products p
     LEFT JOIN product_categories pc ON pc.id = p.category_id
     LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.warehouse_id = $1
     WHERE p.deleted_at IS NULL
       AND (
         EXISTS (SELECT 1 FROM inventory i2 WHERE i2.product_id = p.id AND i2.warehouse_id = $1)
         OR
         EXISTS (
           SELECT 1
           FROM product_recipes r
           WHERE r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
         )
       )
     ORDER BY pc.sort_order NULLS LAST, p.name_ar`,
    [resolvedWarehouseId],
  );
  return res.rows;
};

const buildHeaders = () => [
  'sale_date',
  'sku',
  'product_name',
  'category',
  'unit_price',
  'quantity',
  'payment_method',
  'notes',
];

/**
 * توليد قالب Excel لمبيعات الفرع.
 * @param {number} warehouseId معرف المخزن
 * @returns {Promise<Buffer>}
 */
export const buildBranchTemplate = async (warehouseId?: number) => {
  const products = await fetchBranchProducts(warehouseId);
  const today = new Date();
  const todayStr = formatYmd(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const wb = XLSX.utils.book_new();
  const headers = buildHeaders();
  const rows = [
    headers,
    ...products
      .slice(0, 50)
      .map((product) => [
        todayStr,
        product.sku,
        product.name_ar,
        product.category_name || '',
        Number(product.sale_price || 0),
        1,
        'cash',
        '',
      ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'branch_sales');

  const wsHelp = XLSX.utils.aoa_to_sheet([
    ['تعليمات'],
    ['املأ الصفوف ثم ارفع الملف من جديد.'],
    ['الأعمدة الأساسية: sale_date, sku, unit_price, quantity.'],
    ['payment_method: cash أو card أو transfer أو credit.'],
    ['يمكن ترك product_name و category و notes كحقول مساعدة فقط.'],
  ]);
  wsHelp['!cols'] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsHelp, 'instructions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const parseRow = (row, indices) => {
  const saleDate = parseDate(indices.sale_date >= 0 ? row[indices.sale_date] : null);
  if (!saleDate) throw new AppError('تاريخ البيع غير صالح', 400);

  const sku = String(indices.sku >= 0 ? row[indices.sku] : '').trim();
  if (!sku) throw new AppError('SKU غير موجود', 400);

  const qty = toNumber(indices.quantity >= 0 ? row[indices.quantity] : null, 0);
  if (qty <= 0) throw new AppError('الكمية يجب أن تكون أكبر من صفر', 400);

  const unitPrice = toNumber(indices.unit_price >= 0 ? row[indices.unit_price] : null, 0);
  if (unitPrice <= 0) throw new AppError('سعر البيع غير صالح', 400);

  return {
    sale_date: saleDate,
    sku,
    product_name: indices.product_name >= 0 ? String(row[indices.product_name] || '').trim() : '',
    category: indices.category >= 0 ? String(row[indices.category] || '').trim() : '',
    unit_price: unitPrice,
    quantity: qty,
    payment_method: normalizePaymentMethod(
      indices.payment_method >= 0 ? row[indices.payment_method] : null,
    ),
    notes: indices.notes >= 0 ? String(row[indices.notes] || '').trim() : '',
  };
};

/**
 * تحليل ملف مبيعات الفرع وتحويله إلى صفوف بيانات.
 * @param {Buffer} buffer محتوى الملف
 * @param {number} warehouseId معرف المخزن
 * @returns {Promise<any[]>}
 */
export const parseBranchSalesExcel = async (buffer: Buffer, warehouseId?: number) => {
  const wb = readSafeWorkbook(buffer, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
  if (rows.length < 2) throw new AppError('ملف مبيعات الفرع فارغ', 400);

  const headerRowIdx = resolveHeaderRow(rows);
  if (headerRowIdx === -1) throw new AppError('لم يتم العثور على صف العناوين', 400);

  const headers = (rows[headerRowIdx] || []).map((h) => normalizeText(h));
  const indices = {
    sale_date: findIndex(headers, HEADER_ALIASES.sale_date),
    sku: findIndex(headers, HEADER_ALIASES.sku),
    product_name: findIndex(headers, HEADER_ALIASES.product_name),
    category: findIndex(headers, HEADER_ALIASES.category),
    unit_price: findIndex(headers, HEADER_ALIASES.unit_price),
    quantity: findIndex(headers, HEADER_ALIASES.quantity),
    payment_method: findIndex(headers, HEADER_ALIASES.payment_method),
    notes: findIndex(headers, HEADER_ALIASES.notes),
  };

  if (
    indices.sale_date === -1 ||
    indices.sku === -1 ||
    indices.unit_price === -1 ||
    indices.quantity === -1
  ) {
    throw new AppError('الأعمدة الأساسية غير مكتملة', 400);
  }

  const products = await fetchBranchProducts(warehouseId);
  const productMap = new Map(products.map((p) => [String(p.sku).trim().toLowerCase(), p]));

  const groups = new Map();
  const errors: any[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every((cell) => cell === '' || cell == null)) continue;

    try {
      const parsed = parseRow(row, indices);
      const product = productMap.get(parsed.sku.toLowerCase());
      if (!product) {
        errors.push({ row: i + 1, message: `المنتج ${parsed.sku} غير موجود في مخزون الفرع` });
        continue;
      }

      const key = `${parsed.sale_date}|${parsed.payment_method}|${parsed.notes}`;
      if (!groups.has(key)) {
        groups.set(key, {
          sale_date: parsed.sale_date,
          payment_method: parsed.payment_method,
          notes: parsed.notes,
          items: [],
        });
      }
      groups.get(key).items.push({
        product_id: product.id,
        sku: product.sku,
        name_ar: product.name_ar,
        quantity: parsed.quantity,
        unit_price: parsed.unit_price,
        discount_amount: 0,
      });
    } catch (e: any) {
      errors.push({ row: i + 1, message: e.message });
    }
  }

  return { groups: Array.from(groups.values()), errors };
};

/**
 * التحقق من صحة بنية ملف مبيعات الفرع.
 * @param {Buffer} buffer محتوى الملف
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
export const validateBranchExcel = async (buffer: Buffer) => {
  const resolvedWarehouseId = (await getStoreWarehouseId()) ?? undefined;
  const { groups, errors } = await parseBranchSalesExcel(buffer, resolvedWarehouseId);
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);
  return {
    ok: totalItems > 0,
    groupCount: groups.length,
    itemCount: totalItems,
    parseErrors: errors,
    preview: groups.slice(0, 3).map((group) => ({
      sale_date: group.sale_date,
      payment_method: group.payment_method,
      items_count: group.items.length,
      sample: group.items
        .slice(0, 2)
        .map((item) => `${item.name_ar} x ${item.quantity}`)
        .join(' | '),
    })),
  };
};

/**
 * استيراد مبيعات الفرع من ملف Excel (تحليل + إنشاء المبيعات).
 * @param {Buffer} buffer محتوى الملف
 * @param {number} userId معرف المستخدم المنفّذ
 * @param {number} warehouseId معرف المخزن
 * @returns {Promise<{ created: number }>}
 */
export const importBranchExcel = async (buffer: Buffer, userId: number, warehouseId?: number) => {
  const resolvedWarehouseId = Number(warehouseId) || ((await getStoreWarehouseId()) ?? 0);
  const { groups, errors } = await parseBranchSalesExcel(buffer, resolvedWarehouseId);
  const targetWarehouseId = resolvedWarehouseId;
  let success = 0;
  const failed: any[] = [];

  for (const group of groups) {
    try {
      await createDailySale(
        {
          sale_type: 'branch',
          sale_date: group.sale_date,
          warehouse_id: targetWarehouseId,
          payment_method: group.payment_method,
          payment_status: 'paid',
          notes: group.notes || null,
          items: group.items,
        },
        userId,
      );
      success++;
    } catch (e: any) {
      failed.push({ sale_date: group.sale_date, message: e.message });
    }
  }

  return {
    success,
    total: groups.length,
    failed,
    parseErrors: errors,
    itemsImported: groups.slice(0, success).reduce((sum, group) => sum + group.items.length, 0),
  };
};
