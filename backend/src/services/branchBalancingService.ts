/**
 * services/branchBalancingService.ts — خوارزمية المناقلات الذكية وتوازن مخزون الفروع
 * ══════════════════════════════════════════════════════════════════════════════════
 * تحلل معدل سحب ومبيعات المنتجات في كل فرع وتقترح مناقلات فورية لمنع الركود ونفاد المخزون.
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

export class BranchBalancingService {
  /**
   * توليد تقرير وتحليل مقترحات المناقلات بين الفروع
   */
  static async generateBalancingRecommendations(): Promise<{
    recommendations: TransferRecommendation[];
    htmlReport: string;
  }> {
    // 1. جلب الفروع والمستودعات النشطة
    const whRes = await query(
      `SELECT id, name_ar, type FROM warehouses WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY id ASC`,
    );
    const warehouses = whRes.rows;

    if (warehouses.length < 2) {
      return {
        recommendations: [],
        htmlReport: `
🔄 <b>المناقلات الذكية بين الفروع</b>
═════════════════════════
ℹ️ النظام يعمل بفرع واحد حالياً. ستعمل خوارزمية المناقلات التلقائية عند وجود أكثر من فرع.
        `.trim(),
      };
    }

    // 2. حساب مبيعات آخر 14 يوماً لكل منتج في كل فرع
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

    // 3. جلب المخزون الفعلي الحالي لكل منتج في كل فرع
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
      const daysSupply = vel > 0 ? Number(r.current_stock) / vel : 999;

      productStockByWh.get(r.product_id)!.push({
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        productName: r.product_name,
        unit: r.unit || 'وحدة',
        stock: Number(r.current_stock),
        velocity: vel,
        daysSupply,
      });
    }

    const recommendations: TransferRecommendation[] = [];

    // مطابقة الفروع ذات الفائض مع الفروع ذات العجز
    for (const [prodId, whList] of productStockByWh.entries()) {
      // فروع العجز: المخزون يكفي أقل من 3 أيام مع وجود سحب نشط
      const deficits = whList.filter((w) => w.velocity > 0.3 && w.daysSupply < 3);
      // فروع الفائض: المخزون يكفي أكثر من 15 يوم ولديه رصيد كافي للنقل
      const surpluses = whList.filter((w) => w.daysSupply > 15 && w.stock > 5);

      for (const def of deficits) {
        for (const sur of surpluses) {
          if (def.warehouseId === sur.warehouseId) continue;

          // حساب الكمية المقترحة للنقل
          const targetQty = Math.round(def.velocity * 7 - def.stock); // تغطية أسبوع
          const availableToGive = Math.round(sur.stock - sur.velocity * 10);
          const transferQty = Math.max(1, Math.min(targetQty, availableToGive));

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
            break;
          }
        }
      }
    }

    // صياغة التقرير العربي
    if (!recommendations.length) {
      return {
        recommendations: [],
        htmlReport: `
🔄 <b>المناقلات الذكية وتوازن مخزون الفروع</b>
═════════════════════════
✅ <b>مخزون جميع الفروع متوازن ومستقر تماماً!</b>
🕒 لا توجد حاجة لمناقلات بضاعة حالياً.
        `.trim(),
      };
    }

    const listText = recommendations
      .slice(0, 8)
      .map(
        (rec, i) =>
          `<b>${i + 1}. ${rec.productName}</b>\n   📦 الكمية المقترحة: <b>${rec.suggestedQty} ${rec.unit}</b>\n   🚚 من: <b>${rec.fromWarehouseName}</b> ⬅️ إلى: <b>${rec.toWarehouseName}</b>\n   💡 <i>${rec.reason}</i>`,
      )
      .join('\n\n');

    const htmlReport = `
🔄 <b>اقتراحات المناقلات الذكية بين الفروع</b> 🚚
═════════════════════════
💡 رصدت خوارزمية التوازن (${recommendations.length}) اقتراح مناقلة بضاعة لتفادي الشراء الجديد:

${listText}

═════════════════════════
🚀 <i>تنفيذ هذه المناقلات يحمي الفروع من نفاد البن ويوفر السيولة النقدية.</i>
    `.trim();

    return {
      recommendations,
      htmlReport,
    };
  }
}

export default BranchBalancingService;
