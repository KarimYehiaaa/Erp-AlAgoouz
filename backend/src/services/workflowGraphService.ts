/**
 * services/workflowGraphService.ts — خدمة بيانات الرسم البياني التفاعلي لمحرك الأتمتة
 * تجلب العقد والروابط وتقدمها بتنسيق جاهز لـ d3-force Canvas rendering.
 * تدير إعدادات الفيزياء وحالة بوت تليجرام.
 */

import crypto from 'node:crypto';
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
          (12, 'action', 'Warehouse Stock Update',  'تحديث مخزون المخزن',      'inventory', '{"icon": "refresh-cw", "color": "#0ea5e9"}'::jsonb,  220,  220)
        ON CONFLICT DO NOTHING;

        SELECT setval('workflows_nodes_id_seq', (SELECT MAX(id) FROM workflows_nodes));

        INSERT INTO workflows_edges (source_node_id, target_node_id, condition, label) VALUES
          (7, 10, 'sale_type = manual', 'تسجيل عادي'),
          (10, 2, NULL, 'خصم من المخزن'),
          (8, 10, 'sale_type = wholesale', 'جملة → خصم مباشر'),
          (9, 11, 'sale_type = cashier_import', 'يمر عبر محرك الوصفات إلزامياً'),
          (11, 3, NULL, 'تفكيك وصفات ثم خصم'),
          (3, 12, NULL, 'تحديث رصيد المخزن'),
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

  static async getExecutionLogs(limit = 50, offset = 0) {
    const logs = await query(
      `SELECT l.id, l.execution_id, l.automation_id, a.key, a.name_ar,
              l.event_name, l.status, l.title, l.message, l.payload,
              l.trigger_source, l.attempt, l.started_at, l.finished_at,
              l.duration_ms, l.error_message, l.created_at
       FROM automation_logs l
       LEFT JOIN automations a ON a.id = l.automation_id
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const count = await query(`SELECT COUNT(*)::int AS total FROM automation_logs`);
    return { logs: logs.rows, total: count.rows[0]?.total || 0 };
  }

  /**
   * تشغيل فوري لمهمة أتمتة مع إرسال إشعار تليجرام وتوثيق السجل
   */
  static async runAutomationNow(
    key: string,
    options: { triggerSource?: string; executionId?: string; scheduledFor?: Date } = {},
  ): Promise<{ success: boolean; message: string; payload?: any }> {
    const aliases: Record<string, string> = {
      daily_summary: 'daily_sales_report',
      daily_summary_report: 'daily_sales_report',
      warehouse_stock_balancing: 'warehouse_balancing',
      warehouse_stock_rebalance: 'warehouse_balancing',
      // توافق رجعي مع قواعد الأتمتة المحفوظة قبل توحيد نموذج المحل الواحد.
      branch_balancing: 'warehouse_balancing',
      branch_stock_balancing: 'warehouse_balancing',
      branch_stock_rebalance: 'warehouse_balancing',
    };
    const canonicalKey = aliases[key] || key;
    const supportedKeys = new Set([
      'daily_sales_report',
      'low_stock_alert',
      'void_invoice_alert',
      'anti_fraud_sentinel',
      'warehouse_balancing',
      'system_health',
      'daily_backup_reminder',
    ]);
    const executionId = options.executionId || crypto.randomUUID();
    const triggerSource = options.triggerSource || 'manual';
    const startedAt = new Date();
    let automationId: number;
    let persistedKey = key;
    let logId: number | null = null;

    let notificationText = '';
    let status: 'success' | 'failed' | 'warning' = 'success';
    let title = `تشغيل الأتمتة: ${key}`;

    try {
      const automationRes = await query(
        `SELECT id, key, is_enabled FROM automations
         WHERE key IN ($1, $2)
         ORDER BY CASE WHEN key = $1 THEN 0 ELSE 1 END LIMIT 1`,
        [canonicalKey, key],
      );
      if (!automationRes.rows[0]) {
        return { success: false, message: 'مهمة الأتمتة غير موجودة.' };
      }
      automationId = Number(automationRes.rows[0].id);
      persistedKey = automationRes.rows[0].key;
      if (!automationRes.rows[0].is_enabled) {
        return { success: false, message: 'مهمة الأتمتة معطلة حاليًا.' };
      }
      if (!supportedKeys.has(canonicalKey)) {
        await query(
          `UPDATE automations SET last_run_at = NOW(), last_status = 'warning', updated_at = NOW() WHERE key = $1`,
          [persistedKey],
        );
        return { success: false, message: `لا يوجد معالج تنفيذ فعلي للمهمة: ${key}` };
      }

      const logRes = await query(
        `INSERT INTO automation_logs
          (automation_id, event_name, status, title, message, payload, execution_id, trigger_source, started_at)
         VALUES ($1, $2, 'running', $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          automationId,
          canonicalKey,
          `تشغيل الأتمتة: ${key}`,
          'بدأ تنفيذ مهمة الأتمتة',
          JSON.stringify({ requestedKey: key, canonicalKey }),
          executionId,
          triggerSource,
          startedAt,
        ],
      );
      logId = Number(logRes.rows[0]?.id || 0) || null;

      const { default: TelegramBotService } = await import('./telegramBotService.ts');
      const { default: TelegramService } = await import('./telegramService.ts');
      const creds = await TelegramBotService.getBotCredentials();

      if (canonicalKey === 'daily_sales_report') {
        const businessDateParts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Cairo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(options.scheduledFor || new Date());
        const datePart = (type: string) =>
          businessDateParts.find((part) => part.type === type)?.value || '';
        const reportDate = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
        title = `ملخص مبيعات المحل ليوم ${reportDate}`;
        const salesRes = await query(
          `SELECT
             COUNT(*) as invoice_count,
             COALESCE(SUM(total_amount), 0) as net_revenue,
             COALESCE(SUM(profit_amount), 0) as total_profit
           FROM sales
           WHERE sale_date = $1::date AND deleted_at IS NULL AND status = 'completed'`,
          [reportDate],
        );
        const expRes = await query(
          `SELECT COALESCE(SUM(amount), 0) as total_expenses
           FROM expenses WHERE expense_date = $1::date AND deleted_at IS NULL`,
          [reportDate],
        );
        const topRes = await query(
          `SELECT p.name_ar, SUM(si.quantity) as qty
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           JOIN products p ON p.id = si.product_id
           WHERE s.sale_date = $1::date AND s.deleted_at IS NULL AND s.status = 'completed'
           GROUP BY p.name_ar
           ORDER BY qty DESC LIMIT 3`,
          [reportDate],
        );

        const s = salesRes.rows[0];
        const e = expRes.rows[0];
        const topList =
          topRes.rows
            .map((r: any) => `  • ${r.name_ar}: ${Number(r.qty).toFixed(1)} كجم/قطعة`)
            .join('\n') || '  • لا توجد مبيعات تفصيلية مسجلة لهذا اليوم';

        notificationText = `
📊 <b>ملخص مبيعات المحل — ${reportDate}</b>
━━━━━━━━━━━━━━━━━━━━
💰 <b>إجمالي المبيعات المسجلة:</b> ${Number(s.net_revenue).toLocaleString('ar-EG')} ج.م
🧾 <b>عدد الفواتير:</b> ${s.invoice_count}
💸 <b>إجمالي المصروفات:</b> ${Number(e.total_expenses).toLocaleString('ar-EG')} ج.م
💵 <b>مجمل الربح المسجل قبل المصروفات:</b> ${Number(s.total_profit).toLocaleString('ar-EG')} ج.م
━━━━━━━━━━━━━━━━━━━━
🔥 <b>أعلى المنتجات مبيعاً في اليوم:</b>
${topList}
⏱ <i>وقت إرسال الملخص: ${new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })}</i>
        `.trim();
      } else if (canonicalKey === 'low_stock_alert') {
        title = 'إنذار نواقص المخزون وخامات البن';
        const lowRes = await query(
          `SELECT p.name_ar, p.sku,
                  COALESCE(SUM(i.quantity), 0) AS current_stock,
                  COALESCE(p.min_stock, 5) AS min_stock
           FROM products p
           LEFT JOIN inventory i ON i.product_id = p.id
           WHERE p.is_active = true AND p.deleted_at IS NULL
           GROUP BY p.id, p.name_ar, p.sku, p.min_stock
           HAVING COALESCE(SUM(i.quantity), 0) <= COALESCE(p.min_stock, 5)
           ORDER BY current_stock ASC LIMIT 10`,
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
                `  ⚠️ <b>${r.name_ar}</b>: رصيد حالي <code>${r.current_stock}</code> (الحد الأدنى: ${r.min_stock || 5})`,
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
      } else if (canonicalKey === 'void_invoice_alert' || canonicalKey === 'anti_fraud_sentinel') {
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
      } else if (canonicalKey === 'warehouse_balancing') {
        title = 'إعادة توازن مخزون المخازن';
        const { default: WarehouseBalancingService } =
          await import('./warehouseBalancingService.ts');
        const bal = await WarehouseBalancingService.generateBalancingRecommendations();
        notificationText = bal.htmlReport;
      } else if (canonicalKey === 'system_health') {
        title = 'فحص سلامة النظام';
        const { checkHealth } = await import('../database/pool.ts');
        const dbHealth = await checkHealth();
        if (!dbHealth.ok) status = 'warning';
        notificationText = `
🖥️ <b>تقرير فحص سلامة النظام والخادم</b>
━━━━━━━━━━━━━━━━━━━━
🟢 <b>حالة الخدمة:</b> تم تشغيل الفحص
🗄️ <b>قاعدة البيانات:</b> ${dbHealth.ok ? 'اتصال ناجح' : 'تعذر الاتصال'} (${dbHealth.latencyMs}ms)
⏱ ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
        `.trim();
      } else if (canonicalKey === 'daily_backup_reminder') {
        title = 'تذكير بالتحقق من النسخ الاحتياطية';
        status = 'warning';
        notificationText = `
🔒 <b>تذكير بفحص النسخ الاحتياطية</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ لم يتم التحقق من وجود نسخة احتياطية حديثة قابلة للاستعادة في هذا الفحص.
راجع آخر ملف محفوظ، وموقع التخزين الخارجي، ونتيجة تجربة الاستعادة قبل اعتبار النسخ سليمة.
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
        [status, persistedKey],
      );

      if (logId) {
        const finishedAt = new Date();
        await query(
          `UPDATE automation_logs
           SET status = $1, title = $2, message = $3, payload = $4,
               finished_at = $5, duration_ms = $6
           WHERE id = $7`,
          [
            status,
            title,
            `اكتمل تنفيذ ${title}`,
            JSON.stringify({
              status,
              notificationSent: Boolean(creds.token && creds.defaultChatId),
            }),
            finishedAt,
            finishedAt.getTime() - startedAt.getTime(),
            logId,
          ],
        );
      }

      // تسجيل في logs
      await this.logTelegramMessage({
        chat_id: creds.defaultChatId || 'system',
        direction: 'out',
        message: notificationText,
        automation_key: persistedKey,
      });

      return {
        success: true,
        message: `تم تشغيل ${title} بنجاح${creds.token && creds.defaultChatId ? ' وإرسال الإشعار لتليجرام' : ''}.`,
        payload: { notificationText, status, executionId },
      };
    } catch (err: any) {
      logger.error(`فشل تشغيل الأتمتة ${key}:`, err.message);
      await query(
        `UPDATE automations
         SET last_run_at = NOW(), last_status = 'failed', updated_at = NOW()
         WHERE key = $1`,
        [persistedKey],
      );
      if (logId) {
        const finishedAt = new Date();
        await query(
          `UPDATE automation_logs
           SET status = 'failed', title = $1, message = $2, error_message = $3,
               finished_at = $4, duration_ms = $5
           WHERE id = $6`,
          [
            `فشل تشغيل الأتمتة: ${key}`,
            'فشل تنفيذ مهمة الأتمتة',
            err.message || 'خطأ غير معروف',
            finishedAt,
            finishedAt.getTime() - startedAt.getTime(),
            logId,
          ],
        );
      }
      return {
        success: false,
        message: `فشل تشغيل الأتمتة: ${err.message}`,
      };
    }
  }
}

export default WorkflowGraphService;
