/**
 * services/menuService.ts — خدمة إدارة وتصميم المنيو
 * ═══════════════════════════════════════════════════
 * تتولى إدارة القوائم المخصصة، التصنيفات، وتوزيع الأصناف على الصفحات
 * مع استرجاع المنتجات من المخزن لتسهيل بناء وتخصيص المنيو.
 */
import { query, withTransaction } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';

export interface MenuItemData {
  id?: number;
  product_id?: number | null;
  name_ar: string;
  description_ar?: string;
  price: number;
  price_secondary?: number | null;
  unit_label_ar?: string;
  is_featured?: boolean;
  is_new?: boolean;
  sort_order?: number;
}

export interface MenuCategoryData {
  id?: number;
  name_ar: string;
  subtitle_ar?: string;
  page_side: 'front' | 'back';
  sort_order?: number;
  icon_name?: string;
  column_span?: number;
  items?: MenuItemData[];
}

export interface MenuPayload {
  title_ar: string;
  subtitle_ar?: string;
  theme?: string;
  logo_url?: string;
  phone_primary?: string;
  phone_secondary?: string;
  address_ar?: string;
  facebook_handle?: string;
  instagram_handle?: string;
  show_qr_code?: boolean;
  is_active?: boolean;
  categories?: MenuCategoryData[];
}

/**
 * جلب قائمة المنيوهات
 */
export const getMenus = async () => {
  const res = await query(
    `SELECT m.*, 
            (SELECT COUNT(*) FROM menu_categories WHERE menu_id = m.id) as categories_count,
            (SELECT COUNT(*) FROM menu_items mi JOIN menu_categories mc ON mi.menu_category_id = mc.id WHERE mc.menu_id = m.id) as items_count
     FROM menus m
     WHERE m.deleted_at IS NULL
     ORDER BY m.is_active DESC, m.created_at DESC`,
  );
  return res.rows;
};

/**
 * جلب تفاصيل منيو محدد بجميع أقسامه وأصنافه مرتبة
 */
export const getMenuById = async (menuId: number) => {
  const menuRes = await query(`SELECT * FROM menus WHERE id = $1 AND deleted_at IS NULL`, [menuId]);

  const menu = menuRes.rows[0];
  if (!menu) {
    throw new AppError('قائمة المنيو المطلوبة غير موجودة', 404);
  }

  const categoriesRes = await query(
    `SELECT * FROM menu_categories WHERE menu_id = $1 ORDER BY sort_order ASC, id ASC`,
    [menuId],
  );

  const categories = categoriesRes.rows;
  if (categories.length > 0) {
    const categoryIds = categories.map((c: any) => c.id);
    const itemsRes = await query(
      `SELECT mi.*, p.sku, p.category_id as product_category_id
       FROM menu_items mi
       LEFT JOIN products p ON mi.product_id = p.id
       WHERE mi.menu_category_id = ANY($1)
       ORDER BY mi.sort_order ASC, mi.id ASC`,
      [categoryIds],
    );

    const itemsByCategory = new Map<number, any[]>();
    for (const item of itemsRes.rows) {
      if (!itemsByCategory.has(item.menu_category_id)) {
        itemsByCategory.set(item.menu_category_id, []);
      }
      itemsByCategory.get(item.menu_category_id)!.push({
        ...item,
        price: roundMoney(Number(item.price || 0)),
        price_secondary: item.price_secondary ? roundMoney(Number(item.price_secondary)) : null,
      });
    }

    for (const cat of categories) {
      cat.items = itemsByCategory.get(cat.id) || [];
    }
  }

  return {
    ...menu,
    categories,
  };
};

/**
 * جلب المنيو النشط الافتراضي
 */
export const getActiveMenu = async () => {
  const res = await query(
    `SELECT id FROM menus WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`,
  );
  const activeId = res.rows[0]?.id;
  if (activeId) {
    return await getMenuById(activeId);
  }
  const firstRes = await query(
    `SELECT id FROM menus WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
  );
  if (firstRes.rows[0]?.id) {
    return await getMenuById(firstRes.rows[0].id);
  }
  throw new AppError('لا توجد أي قوائم منيو مسجلة', 404);
};

/**
 * حفظ منيو جديد أو تحديث منيو قائم بكل تصنيفاته وبنوده داخل Transaction
 */
export const saveMenu = async (payload: MenuPayload, menuId?: number, userId?: number) => {
  return await withTransaction(async (client) => {
    let savedMenuId = menuId;

    if (payload.is_active) {
      // إيقاف تفعيل القوائم الأخرى إذا تم تعيين هذه كنشطة
      await client.query(`UPDATE menus SET is_active = FALSE WHERE is_active = TRUE`);
    }

    if (savedMenuId) {
      // تحديث المنيو الرئيسي
      const updateRes = await client.query(
        `UPDATE menus SET
           title_ar = $1,
           subtitle_ar = $2,
           theme = $3,
           logo_url = $4,
           phone_primary = $5,
           phone_secondary = $6,
           address_ar = $7,
           facebook_handle = $8,
           instagram_handle = $9,
           show_qr_code = $10,
           is_active = $11,
           updated_at = NOW()
         WHERE id = $12 AND deleted_at IS NULL
         RETURNING *`,
        [
          payload.title_ar,
          payload.subtitle_ar || '',
          payload.theme || 'coffee-gold',
          payload.logo_url || null,
          payload.phone_primary || '',
          payload.phone_secondary || null,
          payload.address_ar || '',
          payload.facebook_handle || '',
          payload.instagram_handle || '',
          payload.show_qr_code !== false,
          payload.is_active !== false,
          savedMenuId,
        ],
      );

      if (!updateRes.rows[0]) {
        throw new AppError('المنيو المراد تعديله غير موجود', 404);
      }
    } else {
      // إنشاء منيو جديد
      const insertRes = await client.query(
        `INSERT INTO menus (
           title_ar, subtitle_ar, theme, logo_url, phone_primary, phone_secondary,
           address_ar, facebook_handle, instagram_handle, show_qr_code, is_active, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          payload.title_ar,
          payload.subtitle_ar || '',
          payload.theme || 'coffee-gold',
          payload.logo_url || null,
          payload.phone_primary || '',
          payload.phone_secondary || null,
          payload.address_ar || '',
          payload.facebook_handle || '',
          payload.instagram_handle || '',
          payload.show_qr_code !== false,
          payload.is_active !== false,
          userId || null,
        ],
      );
      savedMenuId = insertRes.rows[0].id;
    }

    // إذا وُجدت تصنيفات في الـ Payload، نقوم بتحديثها
    if (payload.categories) {
      // حذف التصنيفات القديمة (سلسلة حذف Cascade ستحذف البنود التابعة)
      await client.query(`DELETE FROM menu_categories WHERE menu_id = $1`, [savedMenuId]);

      for (let cIdx = 0; cIdx < payload.categories.length; cIdx++) {
        const cat = payload.categories[cIdx];
        const catRes = await client.query(
          `INSERT INTO menu_categories (
             menu_id, name_ar, subtitle_ar, page_side, sort_order, icon_name, column_span
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            savedMenuId,
            cat.name_ar,
            cat.subtitle_ar || '',
            cat.page_side || 'front',
            cat.sort_order ?? cIdx + 1,
            cat.icon_name || 'coffee',
            cat.column_span || 1,
          ],
        );

        const newCatId = catRes.rows[0].id;

        if (cat.items && cat.items.length > 0) {
          for (let iIdx = 0; iIdx < cat.items.length; iIdx++) {
            const item = cat.items[iIdx];
            await client.query(
              `INSERT INTO menu_items (
                 menu_category_id, product_id, name_ar, description_ar, price,
                 price_secondary, unit_label_ar, is_featured, is_new, sort_order
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                newCatId,
                item.product_id || null,
                item.name_ar,
                item.description_ar || '',
                roundMoney(Number(item.price || 0)),
                item.price_secondary ? roundMoney(Number(item.price_secondary)) : null,
                item.unit_label_ar || null,
                !!item.is_featured,
                !!item.is_new,
                item.sort_order ?? iIdx + 1,
              ],
            );
          }
        }
      }
    }

    return await getMenuById(savedMenuId!);
  });
};

/**
 * حذف منيو
 */
export const deleteMenu = async (menuId: number) => {
  const res = await query(
    `UPDATE menus SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [menuId],
  );
  if (!res.rows[0]) {
    throw new AppError('المنيو غير موجود', 404);
  }
  return { id: menuId, success: true };
};

/**
 * جلب الأصناف المتاحة في قاعدة البيانات لتغذية شريط الاختيار في واجهة تصميم المنيو
 */
export const getAvailableProductsForMenu = async () => {
  const res = await query(
    `SELECT p.id, p.name_ar, p.sku, p.sale_price, p.unit, p.category_id,
            pc.name_ar as category_name
     FROM products p
     LEFT JOIN product_categories pc ON p.category_id = pc.id
     WHERE p.deleted_at IS NULL
     ORDER BY pc.name_ar NULLS LAST, p.name_ar ASC`,
  );
  return res.rows.map((p: any) => ({
    ...p,
    sale_price: roundMoney(Number(p.sale_price || 0)),
  }));
};
