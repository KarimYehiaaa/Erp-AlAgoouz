/**
 * services/warehouseBalancingService.ts — خوارزمية المناقلات الذكية بين مخازن المحل
 * تحلل معدل السحب ومبيعات المنتجات في كل مخزن وتقترح مناقلات لمنع الركود ونفاد المخزون.
 */

import { query } from '../database/pool.ts';

export interface TransferRecommendation {
  productId: number;
  productName: string;
  unit: string;
  fromWarehouseId: number;
  fromWarehouseName: string;
  toWarehouseId: number;
  toWarehouseName: string;
  suggestedQty: number;
  reason: string;
}

export class WarehouseBalancingService {
  /**
   * توليد تقرير وتحليل مقترحات المناقلات بين المخازن
   */
  static async generateBalancingRecommendations(): Promise<{
    recommendations: TransferRecommendation[];
    htmlReport: string;
  }> {
    // 1. جلب مواقع التخزين النشطة داخل المحل
    const whRes = await query(
      `SELECT id, name_ar, type FROM warehouses WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY id ASC`,
    );
    const warehouses = whRes.rows;

    if (warehouses.length < 2) {
      return {
        recommendations: [],
        htmlReport: `
 <b>مراجعة توازن المخزون بين المخازن</b>
ℹ النظام يعمل في محل واحد؛ تتم المناقلات بين المخزن الرئيسي ومخزن البيع فقط.
        `.trim(),
      };
    }

    // 2. حساب مبيعات آخر 14 يوماً لكل منتج في كل مخزن
    const salesVelocityRes = await query(`
      SELECT
        s.warehouse_id,
        si.product_id,
        p.name_ar as product_name,
        p.unit,
        COALESCE(SUM(si.quantity), 0) / 14.0 as daily_velocity
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products p ON p.id = si.product_id
      WHERE s.sale_date >= CURRENT_DATE - INTERVAL '14 days'
        AND s.status = 'completed' AND s.deleted_at IS NULL
      GROUP BY s.warehouse_id, si.product_id, p.name_ar, p.unit
    `);

    // 3. جلب المخزون الفعلي الحالي لكل منتج في كل مخزن
    const stockRes = await query(`
      SELECT
        p.id as product_id,
        p.name_ar as product_name,
        p.unit,
        w.id as warehouse_id,
        w.name_ar as warehouse_name,
        COALESCE(inv.quantity, 0) as current_stock
      FROM products p
      CROSS JOIN warehouses w
      LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.warehouse_id = w.id
      WHERE p.deleted_at IS NULL AND w.deleted_at IS NULL AND w.is_active = TRUE
    `);

    const velocityMap = new Map<string, number>(); // key: `${whId}_${prodId}` -> daily velocity
    for (const r of salesVelocityRes.rows) {
      velocityMap.set(`${r.warehouse_id}_${r.product_id}`, Number(r.daily_velocity));
    }

    // تجميع البيانات لكل منتج
    const productStockByWh = new Map<number, any[]>();
    for (const r of stockRes.rows) {
      if (!productStockByWh.has(r.product_id)) {
        productStockByWh.set(r.product_id, []);
      }
      const vel = velocityMap.get(`${r.warehouse_id}_${r.product_id}`) || 0;
      const stockUnits = Math.round(Number(r.current_stock) * 1000);
      const list = productStockByWh.get(r.product_id)!;
      const existing = list.find((w) => w.warehouseId === r.warehouse_id);
      if (existing) {
        existing.stockUnits += stockUnits;
        existing.stock = existing.stockUnits / 1000;
        existing.daysSupply = vel > 0 ? existing.stock / vel : 999;
        continue;
      }
      list.push({
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        productName: r.product_name,
        unit: r.unit || 'وحدة',
        stockUnits,
        stock: stockUnits / 1000,
        velocity: vel,
        daysSupply: vel > 0 ? stockUnits / 1000 / vel : 999,
      });
    }

    const recommendations: TransferRecommendation[] = [];

    // مطابقة المخازن ذات الفائض مع المخازن ذات العجز
    for (const [prodId, whList] of productStockByWh.entries()) {
      // مخازن العجز: المخزون يكفي أقل من 3 أيام مع وجود سحب نشط
      const deficits = whList.filter((w) => w.velocity > 0.3 && w.daysSupply < 3);
      // مخازن الفائض: المخزون يكفي أكثر من 15 يوم ولديه رصيد كافٍ للنقل
      const surpluses = whList.filter((w) => w.daysSupply > 15 && w.stock > 5);

      for (const def of deficits) {
        for (const sur of surpluses) {
          if (def.warehouseId === sur.warehouseId) continue;

          // حساب الكمية المقترحة للنقل
          // Allocate in thousandths (inventory precision), preserving ten days
          // at each donor and accounting for every recommendation already made.
          const targetUnits = Math.max(
            0,
            Math.ceil(def.velocity * 7 * 1000 - 1e-8) - def.stockUnits,
          );
          const availableUnits = Math.max(
            0,
            sur.stockUnits - Math.ceil(sur.velocity * 10 * 1000 - 1e-8),
          );
          const transferUnits = Math.min(targetUnits, availableUnits);
          const transferQty = transferUnits / 1000;

          if (transferQty > 0) {
            recommendations.push({
              productId: prodId,
              productName: def.productName,
              unit: def.unit,
              fromWarehouseId: sur.warehouseId,
              fromWarehouseName: sur.warehouseName,
              toWarehouseId: def.warehouseId,
              toWarehouseName: def.warehouseName,
              suggestedQty: transferQty,
              reason: `معدل سحب مرتفع في (${def.toWarehouseName || def.warehouseName}) مقابل فائض راكد في (${sur.warehouseName})`,
            });
            sur.stockUnits -= transferUnits;
            def.stockUnits += transferUnits;
            if (transferUnits === targetUnits) break;
          }
        }
      }
    }

    // صياغة التقرير العربي
    if (!recommendations.length) {
      return {
        recommendations: [],
        htmlReport: `
 <b>المناقلات الذكية وتوازن مخزون المحل</b>
 <b>مخزون مواقع المحل متوازن ومستقر تماماً!</b>
 لا توجد حاجة لمناقلات بضاعة حالياً.
        `.trim(),
      };
    }

    const listText = recommendations
      .slice(0, 8)
      .map(
        (rec, i) =>
          `<b>${i + 1}. ${rec.productName}</b>\n    الكمية المقترحة: <b>${rec.suggestedQty} ${rec.unit}</b>\n    من: <b>${rec.fromWarehouseName}</b>  إلى: <b>${rec.toWarehouseName}</b>\n    <i>${rec.reason}</i>`,
      )
      .join('\n\n');

    const htmlReport = `
 <b>اقتراحات المناقلات الذكية بين المخازن</b>
 رصدت خوارزمية التوازن (${recommendations.length}) اقتراح مناقلة بضاعة لتفادي الشراء الجديد:

${listText}

 <i>تنفيذ هذه المناقلات يحمي مواقع المحل من نفاد البن ويوفر السيولة النقدية.</i>
    `.trim();

    return {
      recommendations,
      htmlReport,
    };
  }
}

export default WarehouseBalancingService;
