/**
 * inventoryExcelService.js
 * Build and process the inventory return Excel template.
 */
import XLSX from 'xlsx';
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { returnProductToStock } from './inventoryService.ts';
import { readSafeWorkbook } from './excelSecurity.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { findExcelHeaderIndex as findHeaderIndex } from '../utils/excelHeaders.ts';
import { parseLocalizedNumber as parseExcelQuantity } from '../utils/numberParsing.ts';

const isBlank = (value) => value === null || value === undefined || String(value).trim() === '';
const isValidReturnQuantity = (qty: number) =>
  Number.isFinite(qty) &&
  qty >= 0.001 &&
  qty <= 999999999.999 &&
  Number.isSafeInteger(Math.round(qty * 1000)) &&
  Math.abs(qty * 1000 - Math.round(qty * 1000)) <= 0.000001;
const isPlaceholderWarehouse = (value) => {
  const text = String(value || '').trim();
  return !text || ['-', '—', '0'].includes(text);
};
const codeAliases = ['sku', 'productsku', 'productcode', 'itemcode', 'كود', 'الكود'];
const qtyAliases = [
  'quantity',
  'qty',
  'returnquantity',
  'restockquantity',
  'الكمية المرتجعة',
  'الكمية',
  'المرتجع',
];
const notesAliases = ['notes', 'note', 'ملاحظات', 'ملاحظة'];
const warehouseAliases = [
  'warehouse',
  'warehouse name',
  'location',
  'store',
  'المخزن',
  'مخزن',
  'المحل',
];

const resolveHeaderRow = (allRows) => {
  for (let i = 0; i < allRows.length; i++) {
    const row = Array.isArray(allRows[i]) ? allRows[i] : [];
    const hasSku = findHeaderIndex(row, codeAliases) !== -1;
    const hasQty = findHeaderIndex(row, qtyAliases) !== -1;
    if (hasSku && hasQty) return i;
  }
  return -1;
};

const resolveWarehouseId = async (
  warehouseName,
  defaultWarehouseId,
  sku,
  rowNumber,
  failures,
  allowed: number[],
) => {
  let warehouseId = defaultWarehouseId ? Number(defaultWarehouseId) : null;
  if (!isPlaceholderWarehouse(warehouseName)) {
    const whRes = await query(
      `SELECT id FROM warehouses WHERE name_ar = $1 AND deleted_at IS NULL
        AND is_active = TRUE AND id = ANY($2::int[]) ORDER BY id LIMIT 1`,
      [warehouseName, allowed],
    );
    if (whRes.rows[0]) {
      warehouseId = whRes.rows[0].id;
    } else {
      failures.push({ row: rowNumber, sku, message: `المخزن "${warehouseName}" غير موجود` });
      return null;
    }
  }

  if (!warehouseId) {
    const whRes = await query(
      `SELECT id FROM warehouses WHERE deleted_at IS NULL AND is_active = TRUE
        AND id = ANY($1::int[]) ORDER BY id LIMIT 1`,
      [allowed],
    );
    warehouseId = whRes.rows[0]?.id || null;
  }

  if (!warehouseId || !Number.isSafeInteger(warehouseId) || !allowed.includes(warehouseId)) {
    failures.push({ row: rowNumber, sku, message: 'لم يتم تحديد مخزن صالح للصف' });
    return null;
  }

  const target = await query(
    `SELECT id FROM warehouses WHERE id = $1
    AND deleted_at IS NULL AND is_active = TRUE AND id = ANY($2::int[])`,
    [warehouseId, allowed],
  );
  if (!target.rows[0]) {
    failures.push({ row: rowNumber, sku, message: 'المخزن المحدد غير نشط أو غير مصرح به' });
    return null;
  }

  return warehouseId;
};

/**
 * توليد قالب Excel للمرتجعات.
 * @param {number} warehouseId معرف المخزن
 * @returns {Promise<Buffer>}
 */
export const buildReturnTemplate = async (warehouseId: number, userId: number) => {
  const allowed = await getAllowedWarehouses(userId);
  if (!allowed.length) throw new AppError('لا يوجد مخزن مصرح به للمستخدم', 403);
  const selectedWarehouseId = warehouseId ? Number(warehouseId) : null;
  if (warehouseId && !Number.isInteger(selectedWarehouseId)) {
    throw new AppError('معرف المخزن غير صالح', 400);
  }
  if (selectedWarehouseId != null && !allowed.includes(selectedWarehouseId))
    throw new AppError('المخزن خارج نطاق صلاحياتك', 403);

  let sql = `
    SELECT p.id AS product_id, p.sku, p.name_ar, p.unit,
           pc.name_ar AS category_name,
           COALESCE(i.quantity, 0) AS current_stock,
           w.id AS warehouse_id, w.name_ar AS warehouse_name
      FROM products p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      JOIN warehouses w
        ON w.deleted_at IS NULL
        AND w.is_active = TRUE
        AND (
          p.primary_warehouse_id = w.id
          OR (
            p.primary_warehouse_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM inventory ix
              WHERE ix.product_id = p.id
                AND ix.warehouse_id = w.id
            )
          )
        )
      LEFT JOIN LATERAL (SELECT SUM(quantity) AS quantity FROM inventory
        WHERE product_id = p.id AND warehouse_id = w.id) i ON TRUE
      WHERE p.deleted_at IS NULL AND p.is_active = TRUE
        AND w.id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1
          FROM product_recipes r
          WHERE r.product_id = p.id
            AND r.deleted_at IS NULL
            AND r.is_active = TRUE
        )
  `;
  const params: any[] = [allowed];
  if (selectedWarehouseId) {
    sql += ` AND w.id = $2`;
    params.push(selectedWarehouseId);
  }
  sql += ` ORDER BY pc.sort_order NULLS LAST, p.name_ar, w.id NULLS LAST`;

  const rows = (await query(sql, params)).rows;
  const sheetData = [
    ['استرداد المخزون', 'Inventory Return'],
    [`تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}`],
    ['املأ عمود الكمية فقط، ويمكن تغيير المخزن أو الملاحظات عند الحاجة'],
    [],
    [
      'SKU',
      'اسم المنتج',
      'التصنيف',
      'الوحدة',
      'المخزن',
      'الرصيد الحالي',
      'الكمية المرتجعة',
      'ملاحظات',
    ],
  ];

  for (const row of rows) {
    sheetData.push([
      row.sku,
      row.name_ar,
      row.category_name || '',
      row.unit || '',
      row.warehouse_name || '',
      Math.round(Number(row.current_stock || 0) * 1000) / 1000,
      '',
      '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 30 },
    { wch: 20 },
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 28 },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: 5 };
  XLSX.utils.book_append_sheet(wb, ws, 'استرداد');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * استيراد مرتجعات من ملف Excel.
 * @param {Buffer} buffer محتوى الملف
 * @param {number} userId معرف المستخدم المنفّذ
 * @param {number} defaultWarehouseId المخزن الافتراضي
 * @returns {Promise<{ created: number }>}
 */
export const importReturnFromExcel = async (
  buffer: Buffer,
  userId: number,
  defaultWarehouseId: number,
) => {
  const allowed = await getAllowedWarehouses(userId);
  if (
    !allowed.length ||
    (defaultWarehouseId != null && !allowed.includes(Number(defaultWarehouseId)))
  ) {
    throw new AppError('المخزن الافتراضي خارج نطاق صلاحياتك', 403);
  }
  const wb = readSafeWorkbook(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];

  const headerRowIdx = resolveHeaderRow(allRows);
  if (headerRowIdx === -1) {
    throw new AppError('لم يتم العثور على صف العناوين في ملف الاسترداد', 400);
  }

  const headers = allRows[headerRowIdx].map((h) => String(h || '').trim());
  const skuIdx = findHeaderIndex(headers, codeAliases);
  const qtyIdx = findHeaderIndex(headers, qtyAliases);
  const notesIdx = findHeaderIndex(headers, notesAliases);
  const warehouseIdx = findHeaderIndex(headers, warehouseAliases);

  if (skuIdx === -1) throw new AppError('عمود SKU غير موجود أو غير صحيح', 400);
  if (qtyIdx === -1) throw new AppError('عمود الكمية غير موجود أو غير صحيح', 400);

  const dataRows = allRows.slice(headerRowIdx + 1);
  const results = { success: 0, failed: [] as any[], skipped: 0, details: [] as any[] };

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + headerRowIdx + 2;
    const row = dataRows[i];
    const sku = String(row[skuIdx] || '').trim();
    const qtyRaw = row[qtyIdx];
    const notes = notesIdx >= 0 ? String(row[notesIdx] || '').trim() : '';
    const warehouseName = warehouseIdx >= 0 ? String(row[warehouseIdx] || '').trim() : '';

    if (!sku && isBlank(qtyRaw) && isBlank(notes) && isBlank(warehouseName)) {
      results.skipped++;
      continue;
    }
    if (!sku) {
      results.failed.push({ row: rowNumber, sku: '', message: 'SKU غير موجود في الصف' });
      continue;
    }
    if (isBlank(qtyRaw)) {
      results.failed.push({ row: rowNumber, sku, message: 'الكمية فارغة' });
      continue;
    }

    const qty = parseExcelQuantity(qtyRaw);
    if (!isValidReturnQuantity(qty)) {
      results.failed.push({ row: rowNumber, sku, message: `الكمية غير صالحة: "${qtyRaw}"` });
      continue;
    }

    const productRes = await query(
      `SELECT p.id, p.name_ar,
              EXISTS (
                SELECT 1
                FROM product_recipes r
                WHERE r.product_id = p.id
                  AND r.deleted_at IS NULL
                  AND r.is_active = TRUE
              ) AS has_active_recipe
       FROM products p
       WHERE p.sku = $1 AND p.deleted_at IS NULL AND p.is_active = TRUE`,
      [sku],
    );

    if (!productRes.rows[0]) {
      results.failed.push({ row: rowNumber, sku, message: 'المنتج غير موجود' });
      continue;
    }

    const product = productRes.rows[0];
    if (product.has_active_recipe) {
      results.failed.push({
        row: rowNumber,
        sku,
        message: 'المنتج مرتبط بوصفة نشطة ولا يمكن استرداده للمخزن',
      });
      continue;
    }

    const warehouseId = await resolveWarehouseId(
      warehouseName,
      defaultWarehouseId,
      sku,
      rowNumber,
      results.failed,
      allowed,
    );
    if (!warehouseId) continue;

    try {
      const result = await returnProductToStock(
        {
          product_id: product.id,
          warehouse_id: warehouseId,
          quantity: qty,
          notes: notes || `استرداد من Excel - ${new Date().toLocaleDateString('ar-EG')}`,
        },
        userId,
      );

      results.success++;
      results.details.push({
        sku,
        product_name: product.name_ar,
        warehouse_name: result.warehouse_name,
        quantity: qty,
        new_stock: result.new_quantity,
      });
    } catch (e: any) {
      results.failed.push({ row: rowNumber, sku, message: e.message });
    }
  }

  if (results.success === 0) {
    results.failed.push({
      row: null,
      sku: null,
      message: 'لم يتم تطبيق أي صف صالح من ملف الاسترداد',
    });
  }

  return results;
};

/**
 * التحقق من صحة ملف المرتجعات.
 * @param {Buffer} buffer محتوى الملف
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
export const validateReturnExcel = async (
  buffer: Buffer,
  userId: number,
  defaultWarehouseId: number,
) => {
  const allowed = await getAllowedWarehouses(userId);
  if (
    !allowed.length ||
    (defaultWarehouseId != null && !allowed.includes(Number(defaultWarehouseId)))
  ) {
    throw new AppError('المخزن الافتراضي خارج نطاق صلاحياتك', 403);
  }
  const wb = readSafeWorkbook(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];

  const headerRowIdx = resolveHeaderRow(allRows);
  if (headerRowIdx === -1) {
    return {
      ok: false,
      validCount: 0,
      errors: ['لم يتم العثور على صف العناوين في ملف الاسترداد'],
      preview: [],
    };
  }

  const headers = allRows[headerRowIdx].map((h) => String(h || '').trim());
  const skuIdx = findHeaderIndex(headers, codeAliases);
  const qtyIdx = findHeaderIndex(headers, qtyAliases);
  const warehouseIdx = findHeaderIndex(headers, warehouseAliases);

  if (skuIdx === -1 || qtyIdx === -1) {
    return {
      ok: false,
      validCount: 0,
      errors: ['أعمدة SKU والكمية غير مكتملة أو غير صحيحة'],
      preview: [],
    };
  }

  const dataRows = allRows.slice(headerRowIdx + 1);
  const errors: any[] = [];
  const preview: any[] = [];
  let validCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + headerRowIdx + 2;
    const row = dataRows[i];
    const sku = String(row[skuIdx] || '').trim();
    const qtyRaw = row[qtyIdx];
    const warehouseName = warehouseIdx >= 0 ? String(row[warehouseIdx] || '').trim() : '';

    if (!sku && isBlank(qtyRaw) && isBlank(warehouseName)) continue;
    if (!sku) {
      errors.push(`الصف ${rowNumber}: SKU غير موجود`);
      continue;
    }
    if (isBlank(qtyRaw)) {
      errors.push(`الصف ${rowNumber}: الكمية فارغة`);
      continue;
    }

    const qty = parseExcelQuantity(qtyRaw);
    if (!isValidReturnQuantity(qty)) {
      errors.push(`الصف ${rowNumber}: الكمية غير صالحة`);
      continue;
    }

    const productRes = await query(
      `SELECT p.name_ar,
              EXISTS (
                SELECT 1
                FROM product_recipes r
                WHERE r.product_id = p.id
                  AND r.deleted_at IS NULL
                  AND r.is_active = TRUE
              ) AS has_active_recipe
       FROM products p
       WHERE p.sku = $1 AND p.deleted_at IS NULL AND p.is_active = TRUE`,
      [sku],
    );

    if (!productRes.rows[0]) {
      errors.push(`الصف ${rowNumber}: المنتج غير موجود`);
      continue;
    }
    if (productRes.rows[0].has_active_recipe) {
      errors.push(`الصف ${rowNumber}: المنتج مرتبط بوصفة نشطة`);
      continue;
    }

    const warehouseFailures: any[] = [];
    const warehouseId = await resolveWarehouseId(
      warehouseName,
      defaultWarehouseId,
      sku,
      rowNumber,
      warehouseFailures,
      allowed,
    );
    if (!warehouseId) {
      errors.push(
        `الصف ${rowNumber}: ${warehouseFailures[0]?.message || 'لم يتم تحديد مخزن مصرح به'}`,
      );
      continue;
    }

    validCount++;
    if (preview.length < 5) {
      const target = await query('SELECT name_ar FROM warehouses WHERE id = $1', [warehouseId]);
      preview.push({
        sku,
        product_name: productRes.rows[0].name_ar,
        warehouse_name: target.rows[0]?.name_ar || warehouseName,
        quantity: qty,
      });
    }
  }

  if (validCount === 0 && errors.length === 0) {
    errors.push('لم يتم العثور على أي صف صالح في ملف الاسترداد');
  }

  return {
    ok: errors.length === 0 && validCount > 0,
    validCount,
    errors,
    preview,
  };
};
