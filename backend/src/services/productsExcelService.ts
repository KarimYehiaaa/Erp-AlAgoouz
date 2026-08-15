import XLSX from 'xlsx';
import { query } from '../database/pool.ts';
import { createProduct, updateProduct } from './productService.ts';
import { AppError } from '../types/errors.ts';
import { getWarehouseIdByCode } from './warehouseService.ts';
import { readSafeWorkbook } from './excelSecurity.ts';

const HEADERS = [
  'sku',
  'barcode',
  'name_ar',
  'category',
  'unit',
  'purchase_price',
  'sale_price',
  'wholesale_price',
  'min_stock',
  'is_active',
  'main_stock',
  'store_stock',
  'description',
];

const HEADER_ALIASES = {
  sku: ['sku', 'كود', 'كود المنتج', 'الرمز', 'رمز المنتج'],
  barcode: ['barcode', 'باركود', 'الباركود'],
  name_ar: ['name_ar', 'اسم المنتج', 'الاسم', 'الصنف', 'اسم الصنف'],
  category: ['category', 'التصنيف', 'القسم', 'المجموعة'],
  unit: ['unit', 'الوحدة', 'وحدة القياس'],
  purchase_price: ['purchase_price', 'سعر الشراء', 'التكلفة'],
  sale_price: ['sale_price', 'سعر البيع', 'السعر'],
  wholesale_price: ['wholesale_price', 'سعر الجملة'],
  min_stock: ['min_stock', 'حد الطلب', 'الحد الأدنى', 'الحد الادنى'],
  is_active: ['is_active', 'active', 'نشط', 'الحالة'],
  main_stock: ['main_stock', 'مخزن رئيسي', 'المخزن الرئيسي', 'رصيد المخزن الرئيسي'],
  store_stock: ['store_stock', 'مخزن المحل', 'المحل', 'رصيد المحل'],
  description: ['description', 'الوصف', 'ملاحظات', 'الملاحظات'],
};

const INSTRUCTIONS = [
  ['تعليمات استيراد المنتجات'],
  ['يرجى تعبئة البيانات في الشيت الأول products.'],
  ['الحقول الإجبارية: sku, name_ar, category, unit, sale_price.'],
  ['is_active: 1 للمنتج النشط أو 0 لغير النشط.'],
  ['main_stock و store_stock اختيارية للأرصدة الافتتاحية.'],
  ['يمكن ترك barcode و wholesale_price و description فارغة.'],
];

const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');

const normalizeDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[\u200f\u200e]/g, '')
    .trim();

const parseBool = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return true;
  const text = normalizeText(value);
  return ['1', 'true', 'yes', 'y', 'نعم', 'نشط', 'مفعل'].includes(text);
};

const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const text = normalizeDigits(value).replace(/,/g, '').trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const slugify = (text) =>
  String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const normalizeHeaders = (headers) =>
  headers.map((header) => {
    const text = normalizeText(header);
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (
        aliases.some(
          (alias) => text === normalizeText(alias) || text.includes(normalizeText(alias)),
        )
      ) {
        return canonical;
      }
    }
    return text;
  });

const loadLookups = async () => {
  const categories = (
    await query(`SELECT id, slug, name_ar FROM product_categories WHERE deleted_at IS NULL`)
  ).rows;
  const categoryMap = {};
  for (const category of categories) {
    if (category.slug) categoryMap[normalizeText(category.slug)] = category.id;
    if (category.name_ar) categoryMap[normalizeText(category.name_ar)] = category.id;
  }

  const warehouses = (await query(`SELECT id, code FROM warehouses WHERE deleted_at IS NULL`)).rows;
  const warehouseMap = {};
  for (const warehouse of warehouses) {
    if (warehouse.code) warehouseMap[String(warehouse.code).toUpperCase()] = warehouse.id;
  }

  return { categoryMap, warehouseMap };
};

const ensureCategoryId = async (rawName, categoryMap) => {
  const name = String(rawName || '').trim();
  if (!name) return null;

  const key = normalizeText(name);
  if (categoryMap[key]) return categoryMap[key];

  const candidateSlug = slugify(name) || `cat-${Date.now()}`;
  const existing = await query(
    `SELECT id, slug, name_ar
     FROM product_categories
     WHERE deleted_at IS NULL
       AND (LOWER(slug) = LOWER($1) OR LOWER(name_ar) = LOWER($2))
     LIMIT 1`,
    [candidateSlug, name],
  );

  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    categoryMap[key] = id;
    if (existing.rows[0].slug) categoryMap[normalizeText(existing.rows[0].slug)] = id;
    if (existing.rows[0].name_ar) categoryMap[normalizeText(existing.rows[0].name_ar)] = id;
    return id;
  }

  const inserted = await query(
    `INSERT INTO product_categories (name_ar, slug, sort_order)
     VALUES ($1, $2, 0)
     RETURNING id`,
    [name, candidateSlug],
  );

  const id = inserted.rows[0].id;
  categoryMap[key] = id;
  categoryMap[normalizeText(candidateSlug)] = id;
  return id;
};

const getIndex = (headers, key) => headers.findIndex((header) => header === key);

const parseRow = async (row, headers, categoryMap, warehouseMap) => {
  const sku = String(row[getIndex(headers, 'sku')] || '').trim();
  const nameAr = String(row[getIndex(headers, 'name_ar')] || '').trim();
  if (!sku) throw new Error('كود المنتج sku مطلوب');
  if (!nameAr) throw new Error('اسم المنتج name_ar مطلوب');

  const salePrice = toNumber(row[getIndex(headers, 'sale_price')], 0);
  if (salePrice <= 0) throw new Error('سعر البيع sale_price يجب أن يكون أكبر من صفر');

  const categoryRaw = String(row[getIndex(headers, 'category')] || '').trim() || 'عام';
  let categoryId = categoryMap[normalizeText(categoryRaw)] || null;
  if (!categoryId) categoryId = await ensureCategoryId(categoryRaw, categoryMap);

  const initialStock = {};
  const mainStock = toNumber(row[getIndex(headers, 'main_stock')], 0);
  const storeStock = toNumber(row[getIndex(headers, 'store_stock')], 0);
  if (mainStock > 0 && warehouseMap.MAIN) initialStock[warehouseMap.MAIN] = mainStock;
  if (storeStock > 0 && warehouseMap.STORE) initialStock[warehouseMap.STORE] = storeStock;

  return {
    sku,
    barcode: String(row[getIndex(headers, 'barcode')] || '').trim() || null,
    name_ar: nameAr,
    description: String(row[getIndex(headers, 'description')] || '').trim() || null,
    category_id: categoryId || null,
    category_raw: categoryRaw,
    unit: String(row[getIndex(headers, 'unit')] || '').trim() || 'قطعة',
    purchase_price: toNumber(row[getIndex(headers, 'purchase_price')], 0),
    sale_price: salePrice,
    wholesale_price:
      row[getIndex(headers, 'wholesale_price')] === '' ||
      row[getIndex(headers, 'wholesale_price')] == null
        ? null
        : toNumber(row[getIndex(headers, 'wholesale_price')], 0),
    min_stock: Math.max(0, Math.floor(toNumber(row[getIndex(headers, 'min_stock')], 5))),
    is_active: parseBool(row[getIndex(headers, 'is_active')]),
    initial_stock: Object.keys(initialStock).length ? initialStock : undefined,
  };
};

/**
 * توليد قالب Excel للمنتجات.
 * @returns {Buffer}
 */
export const buildProductsTemplate = () => {
  const wb = XLSX.utils.book_new();
  const dataSheet = [
    HEADERS,
    [
      'TC-100',
      '6281001000100',
      'بن تركي فاتح - 250 جرام',
      'turkish-coffee',
      'جرام',
      45,
      65,
      58,
      10,
      1,
      50,
      15,
      '',
    ],
    ['FC-100', '', 'بن فرنساوي - 250 جرام', 'french-coffee', 'جرام', 40, 58, 52, 10, 1, 40, 12, ''],
    ['CD-100', '', 'مشروب بارد', 'cold-drinks', 'علبة', 1.5, 3, 2.5, 50, 1, 100, 30, ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(dataSheet);
  ws['!cols'] = HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'products');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCTIONS), 'instructions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * تحليل ملف المنتجات إلى صفوف بيانات.
 * @param {Buffer} buffer محتوى الملف
 * @returns {Promise<any[]>}
 */
export const parseProductsExcel = async (buffer: Buffer) => {
  const wb = readSafeWorkbook(buffer);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
  if (rows.length < 2) throw new AppError('ملف الإكسيل فارغ', 400);

  const headers = normalizeHeaders(rows[0].map((header) => String(header).trim()));
  const { categoryMap, warehouseMap } = await loadLookups();
  const parsed: any[] = [];
  const errors: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((cell) => cell === '' || cell == null)) continue;
    try {
      parsed.push(await parseRow(row, headers, categoryMap, warehouseMap));
    } catch (e: any) {
      errors.push({ row: i + 1, message: e.message });
    }
  }

  if (!parsed.length && errors.length) {
    throw new AppError(errors.map((e) => `السطر ${e.row}: ${e.message}`).join(' | '), 400);
  }

  return { rows: parsed, errors };
};

/**
 * استيراد المنتجات من ملف Excel (إنشاء/تحديث).
 * @param {Buffer} buffer محتوى الملف
 * @returns {Promise<{ created: number, updated: number }>}
 */
export const importProductsFromExcel = async (buffer: Buffer) => {
  const { rows, errors } = await parseProductsExcel(buffer);
  const results = {
    success: 0,
    updated: 0,
    created: 0,
    failed: [] as any[],
    total: rows.length,
    parseErrors: errors,
  };
  const { categoryMap, warehouseMap } = await loadLookups();

  for (const data of rows) {
    try {
      if (!data.category_id) {
        data.category_id = await ensureCategoryId(data.category_raw || 'عام', categoryMap);
      }
      if (!data.category_id) throw new Error('التصنيف غير متاح');

      const existing = await query(`SELECT id, deleted_at FROM products WHERE sku = $1`, [
        data.sku,
      ]);
      if (existing.rows[0]) {
        if (existing.rows[0].deleted_at) {
          await query(
            `UPDATE products SET deleted_at = NULL, is_active = TRUE, updated_at = NOW() WHERE id = $1`,
            [existing.rows[0].id],
          );
        }
        const { initial_stock, category_raw, ...updateData } = data;
        await updateProduct(existing.rows[0].id, updateData);
        if (initial_stock) {
          for (const [warehouseId, qty] of Object.entries(initial_stock)) {
            await query(
              `INSERT INTO inventory (product_id, warehouse_id, quantity)
               VALUES ($1, $2, $3)
               ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
               DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
              [existing.rows[0].id, warehouseId, qty],
            );
          }
        }
        results.updated++;
      } else {
        const { category_raw, initial_stock, ...createData } = data;
        const created = await createProduct(createData);
        if (initial_stock) {
          for (const [warehouseId, qty] of Object.entries(initial_stock)) {
            await query(
              `INSERT INTO inventory (product_id, warehouse_id, quantity)
               VALUES ($1, $2, $3)
               ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
               DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
              [created.id, warehouseId, qty],
            );
          }
        }
        results.created++;
      }
      results.success++;
    } catch (err: any) {
      results.failed.push({ sku: data.sku, message: err.message });
    }
  }

  return results;
};

/**
 * تصدير المنتجات إلى ملف Excel.
 * @returns {Promise<Buffer>}
 */
export const exportProductsToExcel = async () => {
  const mainWarehouseId = await getWarehouseIdByCode('MAIN');
  const storeWarehouseId = await getWarehouseIdByCode('STORE');
  const products = (
    await query(
      `SELECT 
      p.sku,
      p.barcode,
      p.name_ar,
      COALESCE(c.name_ar, '') as category_name,
      p.unit,
      p.purchase_price,
      p.sale_price,
      p.wholesale_price,
      p.min_stock,
      CASE WHEN p.is_active THEN 1 ELSE 0 END as is_active,
      COALESCE((SELECT SUM(quantity) FROM inventory WHERE product_id = p.id AND warehouse_id = $1), 0) as main_stock,
      COALESCE((SELECT SUM(quantity) FROM inventory WHERE product_id = p.id AND warehouse_id = $2), 0) as store_stock,
      COALESCE(p.description, '') as description
     FROM products p
     LEFT JOIN product_categories c ON p.category_id = c.id
     WHERE p.deleted_at IS NULL
     ORDER BY p.name_ar`,
      [mainWarehouseId, storeWarehouseId],
    )
  ).rows;

  const dataSheet = [HEADERS];
  for (const p of products) {
    dataSheet.push([
      p.sku,
      p.barcode || '',
      p.name_ar,
      p.category_name,
      p.unit || 'قطعة',
      Number(p.purchase_price) || 0,
      Number(p.sale_price) || 0,
      p.wholesale_price !== null ? Number(p.wholesale_price) : '',
      Number(p.min_stock) || 5,
      p.is_active,
      Number(p.main_stock) || 0,
      Number(p.store_stock) || 0,
      p.description || '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(dataSheet);
  ws['!cols'] = HEADERS.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'products');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCTIONS), 'instructions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};
