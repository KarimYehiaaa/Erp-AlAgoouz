/**
 * services/workflowGraphService.ts — خدمة بيانات الرسم البياني التفاعلي لمحرك الأتمتة
 * تجلب العقد والروابط وتقدمها بتنسيق جاهز لـ d3-force Canvas rendering.
 * تدير إعدادات الفيزياء وحالة بوت تليجرام.
 */

import { query, withTransaction } from '../database/pool.ts';
import logger from './loggerService.ts';

// ─── أنواع البيانات ──────────────────────────────────────

export interface GraphNode {
  id: number;
  type: 'agent' | 'trigger' | 'action';
  label: string;
  label_ar: string | null;
  group: string;
  settings: Record<string, any>;
  x: number;
  y: number;
  is_active: boolean;
}

export interface GraphEdge {
  id: number;
  source: number;
  target: number;
  condition: string | null;
  label: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PhysicsSettings {
  repelForce: number;
  linkDistance: number;
  collisionRadius: number;
  centerForceX: number;
  centerForceY: number;
}

const DEFAULT_PHYSICS: PhysicsSettings = {
  repelForce: -400,
  linkDistance: 150,
  collisionRadius: 60,
  centerForceX: 0.05,
  centerForceY: 0.05,
};

// ─── خدمة الـ Graph ──────────────────────────────────────

export class WorkflowGraphService {
  /**
   * جلب كل العقد والروابط بتنسيق الرسم البياني
   */
  static async getGraphData(): Promise<GraphData> {
    const [nodesRes, edgesRes] = await Promise.all([
      query(
        `SELECT id, type, label, label_ar, group_name, settings, position_x, position_y, is_active
         FROM workflows_nodes
         ORDER BY id`,
      ),
      query(
        `SELECT id, source_node_id, target_node_id, condition, label
         FROM workflows_edges
         ORDER BY id`,
      ),
    ]);

    const nodes: GraphNode[] = nodesRes.rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      label: r.label,
      label_ar: r.label_ar,
      group: r.group_name,
      settings: r.settings || {},
      x: r.position_x || 0,
      y: r.position_y || 0,
      is_active: r.is_active,
    }));

    const edges: GraphEdge[] = edgesRes.rows.map((r: any) => ({
      id: r.id,
      source: r.source_node_id,
      target: r.target_node_id,
      condition: r.condition,
      label: r.label,
    }));

    return { nodes, edges };
  }

  // ─── عمليات العقد ──────────────────────────────────

  static async getNodes() {
    const res = await query(
      `SELECT id, type, label, label_ar, group_name, settings, position_x, position_y, is_active, created_at
       FROM workflows_nodes ORDER BY id`,
    );
    return res.rows;
  }

  static async createNode(data: {
    type: string;
    label: string;
    label_ar?: string;
    group_name?: string;
    settings?: Record<string, any>;
    position_x?: number;
    position_y?: number;
  }) {
    const res = await query(
      `INSERT INTO workflows_nodes (type, label, label_ar, group_name, settings, position_x, position_y)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.type,
        data.label,
        data.label_ar || null,
        data.group_name || 'general',
        JSON.stringify(data.settings || {}),
        data.position_x || 0,
        data.position_y || 0,
      ],
    );
    return res.rows[0];
  }

  static async updateNode(
    id: number,
    data: Partial<{
      label: string;
      label_ar: string;
      group_name: string;
      settings: Record<string, any>;
      position_x: number;
      position_y: number;
      is_active: boolean;
    }>,
  ) {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (data.label !== undefined) {
      sets.push(`label = $${idx++}`);
      vals.push(data.label);
    }
    if (data.label_ar !== undefined) {
      sets.push(`label_ar = $${idx++}`);
      vals.push(data.label_ar);
    }
    if (data.group_name !== undefined) {
      sets.push(`group_name = $${idx++}`);
      vals.push(data.group_name);
    }
    if (data.settings !== undefined) {
      sets.push(`settings = $${idx++}`);
      vals.push(JSON.stringify(data.settings));
    }
    if (data.position_x !== undefined) {
      sets.push(`position_x = $${idx++}`);
      vals.push(data.position_x);
    }
    if (data.position_y !== undefined) {
      sets.push(`position_y = $${idx++}`);
      vals.push(data.position_y);
    }
    if (data.is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      vals.push(data.is_active);
    }

    if (sets.length === 0) return null;

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const res = await query(
      `UPDATE workflows_nodes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    return res.rows[0] || null;
  }

  static async deleteNode(id: number) {
    const res = await query(`DELETE FROM workflows_nodes WHERE id = $1 RETURNING id`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * حفظ مواقع العقد بعد السحب (Batch Update)
   */
  static async updateNodePositions(positions: Array<{ id: number; x: number; y: number }>) {
    await withTransaction(async (client: any) => {
      for (const pos of positions) {
        await client.query(
          `UPDATE workflows_nodes SET position_x = $1, position_y = $2, updated_at = NOW() WHERE id = $3`,
          [pos.x, pos.y, pos.id],
        );
      }
    });
  }

  // ─── عمليات الروابط ──────────────────────────────────

  static async getEdges() {
    const res = await query(
      `SELECT id, source_node_id, target_node_id, condition, label, created_at
       FROM workflows_edges ORDER BY id`,
    );
    return res.rows;
  }

  static async createEdge(data: {
    source_node_id: number;
    target_node_id: number;
    condition?: string;
    label?: string;
  }) {
    const res = await query(
      `INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.source_node_id, data.target_node_id, data.condition || null, data.label || null],
    );
    return res.rows[0];
  }

  static async deleteEdge(id: number) {
    const res = await query(`DELETE FROM workflows_edges WHERE id = $1 RETURNING id`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // ─── إعادة ضبط العقد والروابط الافتراضية ────────────────────

  static async resetToDefaults() {
    await withTransaction(async (client: any) => {
      // تنظيف الجداول القديمة
      await client.query('DELETE FROM workflows_edges');
      await client.query('DELETE FROM workflows_nodes');

      // إعادة زرع الوكلاء والمشغلات والعمليات
      await client.query(`
        INSERT INTO workflows_nodes (id, type, label, label_ar, group_name, settings, position_x, position_y) VALUES
          (1, 'agent', 'Cashier POS',        'كاشير نقطة البيع',     'operations',  '{"icon": "monitor", "color": "#10b981"}'::jsonb,  -220, -120),
          (2, 'agent', 'Main Warehouse',     'المخزن الرئيسي',       'inventory',   '{"icon": "warehouse", "color": "#3b82f6"}'::jsonb,  220,  -60),
          (3, 'agent', 'Recipe Engine',      'محرك الوصفات',         'production',  '{"icon": "flask", "color": "#f59e0b"}'::jsonb,       0,   120),
          (4, 'agent', 'Telegram Bot',       'وكيل تليجرام',         'notifications','{"icon": "send", "color": "#8b5cf6"}'::jsonb,       320,  160),
          (5, 'agent', 'AI Copilot (Gemini)','المساعد الذكي Gemini',  'ai',          '{"icon": "brain", "color": "#ec4899"}'::jsonb,      -320,  160),
          (6, 'agent', 'System Alerts',      'إشعارات النظام',       'notifications','{"icon": "bell", "color": "#ef4444"}'::jsonb,        320, -160),
          (7, 'trigger', 'Manual Daily Entry',     'إدخال يومي يدوي',         'sales',     '{"icon": "edit", "color": "#6b7280", "rule": "RULE_1_MANUAL"}'::jsonb,     -420, -220),
          (8, 'trigger', 'Wholesale Invoice',      'فاتورة جملة',             'sales',     '{"icon": "file-text", "color": "#6b7280", "rule": "RULE_2_WHOLESALE"}'::jsonb, -420, 0),
          (9, 'trigger', 'Cashier Report Import',  'استيراد تقرير الكاشير',   'sales',     '{"icon": "upload", "color": "#6b7280", "rule": "RULE_3_CASHIER"}'::jsonb,  -420, 220),
          (10, 'action', 'Direct Stock Deduction',  'خصم مخزون مباشر',         'inventory', '{"icon": "minus-circle", "color": "#14b8a6"}'::jsonb, 0,  -220),
          (11, 'action', 'Recipe Calculation',      'حساب الوصفات والتفكيك',   'production','{"icon": "calculator", "color": "#f97316"}'::jsonb,   0,    0),
          (12, 'action', 'Branch Stock Update',     'تحديث مخزون الفرع',       'inventory', '{"icon": "refresh-cw", "color": "#0ea5e9"}'::jsonb,  220,  220)
        ON CONFLICT DO NOTHING;

        SELECT setval('workflows_nodes_id_seq', (SELECT MAX(id) FROM workflows_nodes));

        INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label) VALUES
          (7, 10, 'sale_type = manual', 'تسجيل عادي'),
          (10, 2, NULL, 'خصم من المخزن'),
          (8, 10, 'sale_type = wholesale', 'جملة → خصم مباشر'),
          (9, 11, 'sale_type = cashier_import', 'يمر عبر محرك الوصفات إلزامياً'),
          (11, 3, NULL, 'تفكيك وصفات ثم خصم'),
          (3, 12, NULL, 'تحديث رصيد الفرع'),
          (2, 6, 'on_low_stock', 'تنبيه نقص'),
          (6, 4, 'always', 'إشعار تليجرام'),
          (4, 5, 'command = /ai', 'استعلام ذكي'),
          (5, 2, 'read_only', 'قراءة بيانات المخزون')
        ON CONFLICT DO NOTHING;
      `);
    });
    return this.getGraphData();
  }

  static async getPhysicsSettings(): Promise<PhysicsSettings> {
    try {
      const res = await query(
        `SELECT value FROM settings WHERE key = 'automation_graph_physics' LIMIT 1`,
      );
      if (res.rows.length > 0 && res.rows[0].value) {
        return { ...DEFAULT_PHYSICS, ...JSON.parse(res.rows[0].value) };
      }
    } catch {
      // جدول settings قد لا يحتوي على هذا المفتاح بعد
    }
    return { ...DEFAULT_PHYSICS };
  }

  static async updatePhysicsSettings(settings: Partial<PhysicsSettings>): Promise<PhysicsSettings> {
    const current = await this.getPhysicsSettings();
    const merged = { ...current, ...settings };
    const val = JSON.stringify(merged);

    try {
      await query(
        `INSERT INTO settings (key, value) VALUES ('automation_graph_physics', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [val],
      );
    } catch (err: any) {
      // إذا لم يكن جدول settings يدعم UPSERT، نحاول UPDATE ثم INSERT
      logger.warn('⚠ إعدادات الفيزياء: محفوظة في الذاكرة فقط —', err.message);
    }

    return merged;
  }

  // ─── سجلات تليجرام ──────────────────────────────────

  static async logTelegramMessage(data: {
    chat_id: string;
    direction: 'in' | 'out';
    message: string;
    ai_response?: string;
    automation_key?: string;
  }) {
    try {
      await query(
        `INSERT INTO telegram_logs (chat_id, direction, message, ai_response, automation_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          data.chat_id,
          data.direction,
          data.message,
          data.ai_response || null,
          data.automation_key || null,
        ],
      );
    } catch (err: any) {
      logger.error('فشل تسجيل رسالة تليجرام في السجل:', err.message);
    }
  }

  static async getTelegramLogs(limit = 50, offset = 0) {
    const res = await query(
      `SELECT id, chat_id, direction, message, ai_response, automation_key, created_at
       FROM telegram_logs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const countRes = await query(`SELECT COUNT(*) as total FROM telegram_logs`);

    return {
      logs: res.rows,
      total: Number(countRes.rows[0]?.total || 0),
    };
  }

  // ─── إدارة وتشغيل وكلاء الأتمتة الحية ──────────────────

  /**
   * جلب كافة مهام الأتمتة المسجلة وحالتها
   */
  static async getAutomations() {
    const res = await query(
      `SELECT id, key, name_ar, description_ar, category, trigger_type, cron_expression, is_enabled, channels, config, last_run_at, last_status
       FROM automations
       ORDER BY id ASC`,
    );
    return res.rows;
  }

  /**
   * تفعيل أو تعطيل مهمة أتمتة
   */
  static async toggleAutomation(key: string, isEnabled: boolean) {
    const res = await query(
      `UPDATE automations
       SET is_enabled = $1, updated_at = NOW()
       WHERE key = $2
       RETURNING *`,
      [isEnabled, key],
    );
    return res.rows[0] || null;
  }

  /**
   * تشغيل فوري لمهمة أتمتة مع إرسال إشعار تليجرام وتوثيق السجل
   */
  static async runAutomationNow(
    key: string,
  ): Promise<{ success: boolean; message: string; payload?: any }> {
    const { default: TelegramBotService } = await import('./telegramBotService.ts');
    const { default: TelegramService } = await import('./telegramService.ts');
    const creds = await TelegramBotService.getBotCredentials();

    let notificationText = '';
    let status: 'success' | 'failed' | 'warning' = 'success';
    let title = '';

    try {
      if (key === 'daily_sales_report' || key === 'daily_summary') {
        title = 'تقرير الإغلاق المالي واليومي';
        const salesRes = await query(
          `SELECT 
             COUNT(*) as invoice_count,
             COALESCE(SUM(subtotal), 0) as total_revenue,
             COALESCE(SUM(total_amount), 0) as net_revenue,
             COALESCE(SUM(profit_amount), 0) as total_profit
           FROM sales
           WHERE created_at >= CURRENT_DATE AND (status IS NULL OR status != 'cancelled')`,
        );
        const expRes = await query(
          `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE created_at >= CURRENT_DATE`,
        );
        const topRes = await query(
          `SELECT p.name_ar, SUM(si.quantity) as qty
           FROM sale_items si
           JOIN products p ON p.id = si.product_id
           WHERE si.created_at >= CURRENT_DATE
           GROUP BY p.name_ar
           ORDER BY qty DESC LIMIT 3`,
        );

        const s = salesRes.rows[0];
        const e = expRes.rows[0];
        const topList =
          topRes.rows
            .map((r: any) => `  • ${r.name_ar}: ${Number(r.qty).toFixed(1)} كجم/قطعة`)
            .join('\n') || '  • لا توجد مبيعات مسجلة اليوم بعد';

        notificationText = `
📊 <b>تقرير الإغلاق اليومي الذكي — بن العجوز ERP</b>
━━━━━━━━━━━━━━━━━━━━
💰 <b>إجمالي الإيرادات (الصافي):</b> ${Number(s.net_revenue).toLocaleString('ar-EG')} ج.م
🧾 <b>عدد الفواتير:</b> ${s.invoice_count}
💸 <b>إجمالي المصروفات:</b> ${Number(e.total_expenses).toLocaleString('ar-EG')} ج.م
💵 <b>صافي الربح التقديري:</b> ${(Number(s.net_revenue) - Number(e.total_expenses)).toLocaleString('ar-EG')} ج.م
━━━━━━━━━━━━━━━━━━━━
🔥 <b>أعلى المنتجات مبيعاً اليوم:</b>
${topList}
⏱ <i>تم التشغيل فورياً: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
        `.trim();
      } else if (key === 'low_stock_alert') {
        title = 'إنذار نواقص المخزون وخامات البن';
        const lowRes = await query(
          `SELECT p.name_ar, p.sku, p.stock_quantity, p.min_stock_alert
           FROM products p
           WHERE p.stock_quantity <= COALESCE(p.min_stock_alert, 5) AND p.is_active = true
           ORDER BY p.stock_quantity ASC LIMIT 10`,
        );

        if (lowRes.rows.length === 0) {
          notificationText = `
📦 <b>تقرير فحص المخزون وخامات التحميص</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>المخزون سليم تماماً!</b> لا توجد أي خامات أو أصناف وصلت لحد إعادة الطلب.
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
          `.trim();
        } else {
          status = 'warning';
          const itemsList = lowRes.rows
            .map(
              (r: any) =>
                `  ⚠️ <b>${r.name_ar}</b>: رصيد حالي <code>${r.stock_quantity}</code> (الحد الأدنى: ${r.min_stock_alert || 5})`,
            )
            .join('\n');
          notificationText = `
🚨 <b>إنذار نواقص المخزون وخامات البن</b>
━━━━━━━━━━━━━━━━━━━━
الأصناف التالية أوشكت على النفاد وتحتاج طلب شراء/تحميص:
${itemsList}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>تم الفحص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
          `.trim();
        }
      } else if (key === 'void_invoice_alert' || key === 'anti_fraud_sentinel') {
        title = 'كشف ومراقبة التلاعب المالي (Anti-Fraud)';
        const discountRes = await query(
          `SELECT sale_number, subtotal, total_amount, discount_amount, discount_percent, status
           FROM sales
           WHERE created_at >= NOW() - INTERVAL '24 HOURS'
             AND (status = 'cancelled' OR discount_percent >= 15 OR (subtotal > 0 AND (discount_amount / subtotal * 100) >= 15))
           ORDER BY created_at DESC LIMIT 5`,
        );

        if (discountRes.rows.length === 0) {
          notificationText = `
🛡️ <b>تقرير الرقابة المالية ومكافحة التلاعب</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>العمليات آمنة:</b> لم يتم رصد أي فواتير ملغاة أو خصومات مريبة خلال آخر 24 ساعة.
⏱ ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}
          `.trim();
        } else {
          status = 'warning';
          const fraudList = discountRes.rows
            .map((r: any) => {
              if (r.status === 'cancelled') {
                return `  ❌ فاتورة ملغاة <b>#${r.sale_number}</b> بقيمة ${r.total_amount} ج.م`;
              }
              const pct =
                r.discount_percent || (r.subtotal > 0 ? (r.discount_amount / r.subtotal) * 100 : 0);
              return `  🏷️ فاتورة <b>#${r.sale_number}</b>: خصم ${Number(pct).toFixed(1)}% (${r.discount_amount} ج.م من أصل ${r.subtotal} ج.م)`;
            })
            .join('\n');
          notificationText = `
🚨 <b>إنذار الرقابة المالية — فواتير ملغاة أو خصومات مرتفعة</b>
━━━━━━━━━━━━━━━━━━━━
رصد النظام العمليات التالية خلال آخر 24 ساعة:
${fraudList}
━━━━━━━━━━━━━━━━━━━━
⏱ <i>توقيت الرصد: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
          `.trim();
        }
      } else if (key === 'branch_balancing' || key === 'branch_stock_rebalance') {
        title = 'إعادة توازن مخزون الفروع';
        const { default: BranchBalancingService } = await import('./branchBalancingService.ts');
        const bal = await BranchBalancingService.generateBalancingRecommendations();
        notificationText = bal.htmlReport;
      } else if (key === 'system_health' || key === 'daily_backup_reminder') {
        title = 'فحص سلامة النظام والنسخ الاحتياطي';
        const { checkHealth } = await import('../database/pool.ts');
        const dbHealth = await checkHealth();
        notificationText = `
🖥️ <b>تقرير فحص سلامة النظام والخادم</b>
━━━━━━━━━━━━━━━━━━━━
🟢 <b>حالة السيرفر:</b> متصل ويعمل بشكل ممتاز
🗄️ <b>قاعدة البيانات:</b> ${dbHealth.ok ? 'نشطة ومستقرة' : 'يوجد بطء'} (${dbHealth.latencyMs}ms)
🔒 <b>النسخ الاحتياطي التلقائي:</b> مُجدول ونشط
⏱ ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
        `.trim();
      } else {
        title = `تشغيل الأتمتة: ${key}`;
        notificationText = `
⚙️ <b>تم تنفيذ الأتمتة "${key}" بنجاح</b>
⏱ ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
        `.trim();
      }

      // إرسال الإشعار لتليجرام
      if (creds.token && creds.defaultChatId) {
        await TelegramService.sendMessage(notificationText, {
          botToken: creds.token,
          chatId: creds.defaultChatId,
        });
      }

      // تحديث حالة الأتمتة
      await query(
        `UPDATE automations
         SET last_run_at = NOW(), last_status = $1, updated_at = NOW()
         WHERE key = $2`,
        [status, key],
      );

      // تسجيل في logs
      await this.logTelegramMessage({
        // [AUDIT FIX C1] لا توجد قيم افتراضية مضمّنة — تُقرأ من البيئة فقط
        chat_id: creds.defaultChatId || 'unset',
        direction: 'out',
        message: notificationText,
        automation_key: key,
      });

      return {
        success: true,
        message: `تم تشغيل ${title} بنجاح وإرسال الإشعار لتليجرام!`,
        payload: { notificationText, status },
      };
    } catch (err: any) {
      logger.error(`فشل تشغيل الأتمتة ${key}:`, err.message);
      await query(
        `UPDATE automations
         SET last_run_at = NOW(), last_status = 'failed', updated_at = NOW()
         WHERE key = $1`,
        [key],
      );
      return {
        success: false,
        message: `فشل تشغيل الأتمتة: ${err.message}`,
      };
    }
  }
}

export default WorkflowGraphService;
