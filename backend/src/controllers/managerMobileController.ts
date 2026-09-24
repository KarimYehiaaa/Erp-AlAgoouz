import type { Request, Response, NextFunction } from 'express';
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';
import { businessToday } from '../utils/localDate.ts';
import { broadcast } from '../services/websocketService.ts';
import { issueManagerOverrideToken } from '../middleware/managerOverride.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';

export const managerMobileController = {
  /**
   * ملخص مبيعات اليوم التنفيذي (مبيعات المحل + جملة + إجمالي + خزينة)
   */
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const todayStr = (req.query.date as string) || businessToday();

      // دالة مساعدة لتجميع المبيعات حسب طرق الدفع ونوع البيع
      const getSalesSummaryByType = async (saleTypes: string[]) => {
        const res = await query(
          `SELECT
            COALESCE(SUM(s.total_amount), 0) AS total_amount,
            COALESCE(SUM(s.discount_amount), 0) AS total_discount,
            COUNT(*)::int AS count,
            COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.reference_type = 'sale' AND p.reference_id = s.id AND LOWER(p.payment_method) IN ('cash', 'نقد', 'نقدي'))), 0) AS cash_amount,
            COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.reference_type = 'sale' AND p.reference_id = s.id AND LOWER(p.payment_method) IN ('instapay', 'انستا باي'))), 0) AS instapay_amount,
            COALESCE(SUM((SELECT SUM(p.amount) FROM payments p WHERE p.reference_type = 'sale' AND p.reference_id = s.id AND LOWER(p.payment_method) IN ('card', 'visa', 'فيزا'))), 0) AS card_amount,
            COALESCE(SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM payments p WHERE p.reference_type = 'sale' AND p.reference_id = s.id) THEN s.total_amount ELSE 0 END), 0) AS other_amount
           FROM sales s
           WHERE s.sale_date = $1 AND s.sale_type = ANY($2::varchar[]) AND s.status != 'cancelled'`,
          [todayStr, saleTypes],
        );
        const row = res.rows[0] || {};
        return {
          total: roundMoney(Number(row.total_amount)),
          discount: roundMoney(Number(row.total_discount)),
          count: Number(row.count) || 0,
          cash: roundMoney(Number(row.cash_amount)),
          instapay: roundMoney(Number(row.instapay_amount)),
          card: roundMoney(Number(row.card_amount)),
          other: roundMoney(Number(row.other_amount)),
        };
      };

      // 1. مبيعات التجزئة داخل المحل
      const retail = await getSalesSummaryByType(['retail', 'pos']);

      // 2. مبيعات الجملة (Wholesale)
      const wholesale = await getSalesSummaryByType(['wholesale']);

      // 3. مبيعات الأمس للمقارنة
      const yesterdayDate = new Date(`${todayStr}T00:00:00`);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

      const yesterdayRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_amount, COUNT(*)::int AS count 
         FROM sales 
         WHERE sale_date = $1 AND status != 'cancelled'`,
        [yesterdayStr],
      );

      // 4. الوردية الحالية: بعض قواعد البيانات القديمة لا تحتوي جداول/أعمدة
      // الورديات الجديدة، لذلك لا نسمح بفشل التقرير كله بسبب هذا الجزء الاختياري.
      const activeShiftRes = { rows: [] as any[] };

      // 5. المصروفات اليومية
      const expensesRes = await query(
        `SELECT COALESCE(SUM(amount), 0) AS total_expenses, COUNT(*)::int AS count 
         FROM expenses 
         WHERE expense_date = $1 AND deleted_at IS NULL`,
        [todayStr],
      );

      // 6. أحدث الفواتير المسجلة اليوم (Live Stream)
      const recentSalesRes = await query(
        `SELECT 
          s.id, s.sale_number, s.sale_type,
          COALESCE((SELECT p.payment_method FROM payments p WHERE p.reference_type = 'sale' AND p.reference_id = s.id ORDER BY p.created_at DESC LIMIT 1), 'cash') AS payment_method,
          s.total_amount, s.created_at,
          'كاشير' AS cashier_name, c.name_ar AS customer_name
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         WHERE s.sale_date = $1 AND s.status != 'cancelled'
         ORDER BY s.created_at DESC
         LIMIT 10`,
        [todayStr],
      );

      // 7. عدد الموافقات المعلقة
      const pendingApprovalsCount = await query(
        `SELECT COUNT(*)::int AS count FROM manager_approval_requests WHERE status = 'pending'`,
      );

      const grandTotal = roundMoney(retail.total + wholesale.total);
      const totalCount = retail.count + wholesale.count;
      const yesterdayTotal = roundMoney(Number(yesterdayRes.rows[0].total_amount));
      const growthPercent =
        yesterdayTotal > 0 ? roundMoney(((grandTotal - yesterdayTotal) / yesterdayTotal) * 100) : 0;
      const totalExpenses = roundMoney(Number(expensesRes.rows[0].total_expenses));
      const totalCashIn = roundMoney(retail.cash + wholesale.cash);
      const netCashflow = roundMoney(totalCashIn - totalExpenses);
      const averageOrderValue = totalCount > 0 ? roundMoney(grandTotal / totalCount) : 0;

      res.json({
        success: true,
        data: {
          date: todayStr,
          grandTotal,
          totalCount,
          yesterdayTotal,
          growthPercent,
          averageOrderValue,
          retail,
          wholesale,
          paymentTotals: {
            cash: totalCashIn,
            instapay: roundMoney(retail.instapay + wholesale.instapay),
            card: roundMoney(retail.card + wholesale.card),
            other: roundMoney(retail.other + wholesale.other),
          },
          expenses: {
            total: totalExpenses,
            count: Number(expensesRes.rows[0].count),
          },
          netCashflow,
          activeShift: activeShiftRes.rows[0]
            ? {
                ...activeShiftRes.rows[0],
                current_expected_cash: roundMoney(
                  Number(activeShiftRes.rows[0].current_expected_cash),
                ),
              }
            : null,
          recentSales: recentSalesRes.rows.map((row) => ({
            id: row.id,
            saleNumber: row.sale_number,
            saleType: row.sale_type,
            paymentMethod: row.payment_method,
            totalAmount: roundMoney(Number(row.total_amount)),
            createdAt: row.created_at,
            cashierName: row.cashier_name || 'كاشير',
            customerName: row.customer_name || 'عميل نقدي',
          })),
          pendingApprovalsCount: Number(pendingApprovalsCount.rows[0].count),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * تقرير المخزون والقيمة المالية الإجمالية بالجنيه والنواقص
   */
  async getInventoryValuation(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. القيمة المالية الإجمالية للمخزون
      const valuationRes = await query(
        `SELECT 
          COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) AS total_valuation,
          COALESCE(SUM(i.quantity * COALESCE(p.sale_price, 0)), 0) AS total_retail_value,
          COALESCE(SUM(i.quantity), 0) AS total_quantity,
          COUNT(DISTINCT i.product_id)::int AS products_in_stock
         FROM inventory i
         JOIN products p ON i.product_id = p.id
         WHERE p.deleted_at IS NULL AND p.is_active = TRUE`,
      );

      // 2. تقسيم القيمة والكمية حسب الأقسام
      const categoryBreakdownRes = await query(
        `SELECT 
          COALESCE(c.name_ar, 'أخرى') AS category_name,
          COALESCE(c.slug, 'other') AS category_slug,
          COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) AS valuation,
          COALESCE(SUM(i.quantity), 0) AS total_qty,
          COUNT(DISTINCT p.id)::int AS product_count
         FROM products p
         LEFT JOIN product_categories c ON p.category_id = c.id
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.deleted_at IS NULL AND p.is_active = TRUE
         GROUP BY c.id, c.name_ar, c.slug
         ORDER BY valuation DESC`,
      );

      // 3. قائمة الأصناف التي أوشكت على النفاد (Low Stock Items)
      const lowStockRes = await query(
        `SELECT 
          p.id, p.name_ar, p.sku, p.unit, p.min_stock,
          COALESCE(c.name_ar, 'عام') AS category_name,
          COALESCE(SUM(i.quantity), 0) AS current_stock,
          COALESCE(p.purchase_price, 0) AS cost_price,
          (COALESCE(SUM(i.quantity), 0) * COALESCE(p.purchase_price, 0)) AS stock_value
         FROM products p
         LEFT JOIN product_categories c ON p.category_id = c.id
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.deleted_at IS NULL AND p.is_active = TRUE
         GROUP BY p.id, p.name_ar, p.sku, p.unit, p.min_stock, p.purchase_price, c.name_ar
         HAVING COALESCE(SUM(i.quantity), 0) <= COALESCE(p.min_stock, 5)
         ORDER BY current_stock ASC
         LIMIT 20`,
      );

      const roundQty = (val: any) => Math.round((Number(val) || 0) * 1000) / 1000;

      res.json({
        success: true,
        data: {
          totalValuation: roundMoney(Number(valuationRes.rows[0].total_valuation)),
          totalRetailValue: roundMoney(Number(valuationRes.rows[0].total_retail_value)),
          totalQuantity: roundQty(valuationRes.rows[0].total_quantity),
          productsInStock: Number(valuationRes.rows[0].products_in_stock),
          categories: categoryBreakdownRes.rows.map((row) => ({
            name: row.category_name,
            slug: row.category_slug,
            valuation: roundMoney(Number(row.valuation)),
            totalQuantity: roundQty(row.total_qty),
            productCount: Number(row.product_count),
          })),
          lowStockItems: lowStockRes.rows.map((row) => ({
            id: row.id,
            name: row.name_ar,
            sku: row.sku,
            unit: row.unit,
            category: row.category_name,
            minLimit: Number(row.min_limit),
            currentStock: roundQty(row.current_stock),
            costPrice: roundMoney(Number(row.cost_price)),
            stockValue: roundMoney(Number(row.stock_value)),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * استرجاع قائمة طلبات الموافقات الإدارية (المعلقة والحديثة)
   */
  async listApprovals(req: Request, res: Response, next: NextFunction) {
    try {
      const status = (req.query.status as string) || 'pending';
      const whereClause = status === 'all' ? '' : `WHERE r.status = $1`;
      const params = status === 'all' ? [] : [status];

      const approvalsRes = await query(
        `SELECT 
          r.*,
          u.full_name AS requester_name,
          u.username AS requester_username,
          mgr.full_name AS decided_by_name
         FROM manager_approval_requests r
         LEFT JOIN users u ON r.requester_user_id = u.id
         LEFT JOIN users mgr ON r.decided_by_user_id = mgr.id
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT 50`,
        params,
      );

      res.json({
        success: true,
        data: approvalsRes.rows,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * إنشاء طلب موافقة من الكاشير (Remote Approval Request)
   */
  async createApprovalRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const requesterId = (req as any).user.id;
      const { request_type, action_label, details, pos_shift_id, terminal_id } = req.body;

      if (!action_label) {
        throw new AppError('تفاصيل العملية مطلوبة', 400);
      }

      const insertRes = await query(
        `INSERT INTO manager_approval_requests (
          request_type, requester_user_id, pos_shift_id, terminal_id, action_label, details, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
        [
          request_type || 'discount',
          requesterId,
          pos_shift_id || null,
          terminal_id || null,
          action_label,
          JSON.stringify(details || {}),
        ],
      );

      const request = insertRes.rows[0];

      // إحضار اسم الكاشير لبثه في الإشعار
      const userRes = await query(`SELECT full_name, username FROM users WHERE id = $1`, [
        requesterId,
      ]);
      const requesterName = userRes.rows[0]?.full_name || userRes.rows[0]?.username || 'الكاشير';

      const payload = {
        ...request,
        requester_name: requesterName,
      };

      // بث الحدث عبر WebSocket لجميع مدراء النظام على الموبايل
      broadcast('approval:requested', payload);

      res.json({
        success: true,
        data: payload,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * قرار المدير (موافقة أو رفض) لطلب الخصم
   */
  async decideApproval(req: Request, res: Response, next: NextFunction) {
    try {
      const managerId = (req as any).user.id;
      const requestId = Number(req.params.id);
      const { decision } = req.body; // 'approved' | 'rejected'

      if (!['approved', 'rejected'].includes(decision)) {
        throw new AppError('القرار يجب أن يكون approved أو rejected', 400);
      }

      const reqRes = await query(`SELECT * FROM manager_approval_requests WHERE id = $1`, [
        requestId,
      ]);

      if (!reqRes.rows[0]) {
        throw new AppError('طلب الموافقة غير موجود', 404);
      }

      const approvalReq = reqRes.rows[0];

      if (approvalReq.status !== 'pending') {
        throw new AppError(`تم اتخاذ قرار مسبقاً بهذا الطلب (${approvalReq.status})`, 400);
      }

      let overrideToken: string | null = null;
      if (decision === 'approved') {
        // توليد توكن التجاوز المعتمد
        const tokenObj = await issueManagerOverrideToken(
          managerId,
          approvalReq.requester_user_id || managerId,
        );
        overrideToken = tokenObj.token;
      }

      const updateRes = await query(
        `UPDATE manager_approval_requests 
         SET status = $1, override_token = $2, decided_by_user_id = $3, decided_at = NOW(), updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [decision, overrideToken, managerId, requestId],
      );

      const managerRes = await query(`SELECT full_name, username FROM users WHERE id = $1`, [
        managerId,
      ]);
      const managerName = managerRes.rows[0]?.full_name || managerRes.rows[0]?.username || 'المدير';

      const resultPayload = {
        ...updateRes.rows[0],
        manager_name: managerName,
      };

      // بث النتيجة للكاشير فوراً لفك القفل وإتمام الفاتورة
      broadcast('approval:decided', resultPayload);

      res.json({
        success: true,
        data: resultPayload,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * فحص حالة طلب موافقة محدد (Polling fallback للكاشير)
   */
  async checkApprovalStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const requestId = Number(req.params.id);
      const reqRes = await query(
        `SELECT r.*, mgr.full_name AS decided_by_name 
         FROM manager_approval_requests r
         LEFT JOIN users mgr ON r.decided_by_user_id = mgr.id
         WHERE r.id = $1`,
        [requestId],
      );

      if (!reqRes.rows[0]) {
        throw new AppError('طلب الموافقة غير موجود', 404);
      }

      const row = reqRes.rows[0];
      const currentUserId = (req as any).user?.id || (req as any).user?.userId;
      const userRole = (req as any).user?.role_name || (req as any).user?.role;
      const isPrivileged =
        (ADMIN_ROLES as readonly string[]).includes(userRole) || userRole === 'manager';
      const isOwner = currentUserId && Number(row.requester_user_id) === Number(currentUserId);

      // يمنع أي مستخدم آخر غير صاحب الطلب أو المديرين من استطلاع الطلب
      if (!isPrivileged && !isOwner) {
        throw new AppError('غير مصرح لك بالاطلاع على هذا الطلب', 403);
      }

      // توكن التجاوز لا يُعاد إلا للكاشير صاحب الطلب حصراً لحمايته من السرقة
      const responseData = { ...row };
      if (!isOwner) {
        delete responseData.override_token;
      }

      res.json({
        success: true,
        data: responseData,
      });
    } catch (err) {
      next(err);
    }
  },
};
