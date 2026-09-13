import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { posShiftService } from '../services/posShiftService.ts';
import { createDailySale } from '../services/salesService.ts';
import { query } from '../database/pool.ts';
import { issueManagerOverrideToken } from '../middleware/managerOverride.ts';
import { getAllowedWarehouses } from '../middleware/branchIsolation.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';

// متتبع محاولات PIN الفاشلة لمنع التخمين (Lockout)
const pinLockoutMap = new Map<string, { attempts: number; lockedUntil: number }>();

export const posShiftController = {
  async openShift(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const shift = await posShiftService.openShift(userId, req.body);
      res.json({ success: true, data: shift });
    } catch (err) {
      next(err);
    }
  },

  async getCurrentShift(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const shift = await posShiftService.getCurrentShift(userId);
      res.json({ success: true, data: shift });
    } catch (err) {
      next(err);
    }
  },

  async recordCashMovement(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const movement = await posShiftService.recordCashMovement(userId, req.body);
      res.json({ success: true, data: movement });
    } catch (err) {
      next(err);
    }
  },

  async closeShift(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const shiftId = Number(req.params.id);
      const closedShift = await posShiftService.closeShift(userId, shiftId, req.body);
      res.json({ success: true, data: closedShift });
    } catch (err) {
      next(err);
    }
  },

  async listShifts(req: Request, res: Response, next: NextFunction) {
    try {
      const shifts = await posShiftService.listShifts(req.query);
      res.json({ success: true, data: shifts });
    } catch (err) {
      next(err);
    }
  },

  /**
   * مزامنة دفعة فواتير صادرة دون اتصال مع فرض عزل الفروع (Offline Batch Sync)
   */
  async batchSyncSales(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const userId = user?.id || user?.userId;
      const userRole = user?.role_name || user?.role;
      const isAdmin = ADMIN_ROLES.includes(userRole);
      const allowedWarehouses = isAdmin ? [] : await getAllowedWarehouses(userId);

      const salesBatch = Array.isArray(req.body.sales) ? req.body.sales : [];
      const results: any[] = [];

      for (const salePayload of salesBatch) {
        // التحقق من عزل الفروع لكل فاتورة في الدفعة
        if (
          !isAdmin &&
          salePayload.warehouse_id &&
          !allowedWarehouses.includes(Number(salePayload.warehouse_id))
        ) {
          results.push({
            sync_id: salePayload.sync_id,
            status: 'FAILED',
            error: 'غير مصرح لك بتسجيل مبيعات على هذا المخزن/الفرع',
          });
          continue;
        }

        try {
          const result = await createDailySale(salePayload, userId);
          results.push({
            sync_id: salePayload.sync_id,
            status: 'SYNCED',
            sale_id: result.id,
            sale_number: result.sale_number,
          });
        } catch (err: any) {
          results.push({
            sync_id: salePayload.sync_id,
            status: 'FAILED',
            error: err.message,
          });
        }
      }

      res.json({ success: true, results });
    } catch (err) {
      next(err);
    }
  },

  /**
   * التحقق من الجهاز وتسجيله (Terminal Handshake)
   */
  async verifyTerminal(req: Request, res: Response, next: NextFunction) {
    try {
      const { terminal_code, device_fingerprint } = req.body;
      const tRes = await query(
        `SELECT t.*, w.name_ar as warehouse_name 
         FROM pos_terminals t
         JOIN warehouses w ON t.warehouse_id = w.id
         WHERE t.terminal_code = $1 AND t.is_active = TRUE`,
        [terminal_code],
      );

      if (tRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'نقطة البيع غير مسجلة أو معطلة' });
      }

      // تحديث آخر تواجد للجهاز
      await query(
        `UPDATE pos_terminals SET last_sync_at = NOW(), device_fingerprint = COALESCE($1, device_fingerprint) WHERE id = $2`,
        [device_fingerprint || null, tRes.rows[0].id],
      );

      res.json({ success: true, data: tRes.rows[0] });
    } catch (err) {
      next(err);
    }
  },

  /**
   * التحقق من رمز PIN للمدير للمصادقة على العمليات الحساسة مع حماية القفل المسبق (Manager PIN Override)
   */
  async verifyPin(req: Request, res: Response, next: NextFunction) {
    try {
      const { pin, action, manager_id } = req.body;
      if (!pin) {
        return res.status(400).json({ success: false, message: 'رمز PIN مطلوب' });
      }

      const pinKey = `user:${(req as any).user?.id || req.ip}`;
      const lockInfo = pinLockoutMap.get(pinKey);

      // فحص القفل المؤقت ضد التخمين المتكرر
      if (lockInfo && lockInfo.lockedUntil > Date.now()) {
        const remainingMins = Math.ceil((lockInfo.lockedUntil - Date.now()) / (60 * 1000));
        return res.status(429).json({
          success: false,
          verified: false,
          message: `تم قفل محاولات التحقق من PIN مؤقتاً لمدة ${remainingMins} دقيقة بسبب محاولات متكررة خاطئة`,
        });
      }

      // تحسين الأداء: إذا تم تمرير manager_id يتم الاستعلام المباشر عنه بدلاً من جلب كافة المدراء
      let managersQuery = `
        SELECT u.id, u.username, u.full_name, u.pos_pin_hash, u.password_hash, r.name as role_name 
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.is_active = TRUE AND r.name IN ('admin', 'manager')
      `;
      const params: any[] = [];
      if (manager_id) {
        managersQuery += ` AND u.id = $1`;
        params.push(manager_id);
      }

      const managersRes = await query(managersQuery, params);

      let matchedManager: any = null;

      for (const mgr of managersRes.rows) {
        if (mgr.pos_pin_hash) {
          const isMatch = await bcrypt.compare(String(pin), mgr.pos_pin_hash);
          if (isMatch) {
            matchedManager = mgr;
            break;
          }
        } else if (mgr.password_hash) {
          const isMatch = await bcrypt.compare(String(pin), mgr.password_hash);
          if (isMatch) {
            matchedManager = mgr;
            break;
          }
        }
      }

      if (!matchedManager) {
        const attempts = (lockInfo?.attempts || 0) + 1;
        if (attempts >= 5) {
          pinLockoutMap.set(pinKey, { attempts, lockedUntil: Date.now() + 15 * 60 * 1000 });
          return res.status(429).json({
            success: false,
            verified: false,
            message: 'تم قفل محاولات التحقق من PIN مؤقتاً لمدة 15 دقيقة بعد 5 محاولات غير صحيحة',
          });
        } else {
          pinLockoutMap.set(pinKey, { attempts, lockedUntil: 0 });
        }
        return res.status(401).json({
          success: false,
          verified: false,
          message: `رمز PIN غير صحيح أو غير مصرح (متبقي ${5 - attempts} محاولات قبل القفل)`,
        });
      }

      // تصفير عداد المحاولات الفاشلة عند النجاح
      pinLockoutMap.delete(pinKey);

      // تسجيل المصادقة في سجل النشاط
      const currentUserId = (req as any).user?.id || matchedManager.id;
      await query(
        `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1, 'pos', $2, $3)`,
        [
          currentUserId,
          `مصادقة مدير (${matchedManager.full_name || matchedManager.username})`,
          JSON.stringify({
            action: action || 'عملية POS خاصة',
            manager_id: matchedManager.id,
            timestamp: new Date().toISOString(),
          }),
        ],
      );

      res.json({
        success: true,
        verified: true,
        manager: {
          id: matchedManager.id,
          name: matchedManager.full_name || matchedManager.username,
          role: matchedManager.role_name,
        },
        override_token: issueManagerOverrideToken(
          matchedManager.id,
          (req as any).user?.id || matchedManager.id,
        ),
      });
    } catch (err) {
      next(err);
    }
  },
};
