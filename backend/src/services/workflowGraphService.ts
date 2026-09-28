/**
 * services/workflowGraphService.ts — خدمة بيانات الرسم البياني التفاعلي لمحرك الأتمتة
 * تجلب العقد والروابط وتقدمها بتنسيق جاهز لـ d3-force Canvas rendering.
 * تدير إعدادات الفيزياء وحالة بوت تليجرام.
 */

import crypto from 'node:crypto';
import { query, withTransaction } from '../database/pool.ts';
import logger from './loggerService.ts';
import { AppError } from '../types/errors.ts';

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

// ملاحظة: مرادفا daily_summary و daily_summary_report حُذفا — ترحيل 083 يحذف الصف المكرر من قاعدة البيانات.
const AUTOMATION_ALIASES: Record<string, string> = {
  warehouse_stock_balancing: 'warehouse_balancing',
  warehouse_stock_rebalance: 'warehouse_balancing',
};

const EXECUTABLE_AUTOMATION_KEYS = new Set([
  'daily_sales_report',
  'low_stock_alert',
  'void_invoice_alert',
  'anti_fraud_sentinel',
  'large_discount_alert',
  'warehouse_balancing',
  'system_health',
  'daily_backup_reminder',
  'supplier_payment_due_alert',
  'daily_profit_margin_anomaly',
  'cashflow_risk_shield',
  'shift_handover_reconciliation',
  'roastery_recipe_waste_guard',
  'customer_loyalty_dormant_winback',
  'ai_copilot_assistant',
  'error_tracker_alert',
  'webhook_listener',
  'scheduled_cron_task',
  'telegram_notifier',
  'debt_credit_sentinel',
  'purchase_stock_ingestion_guard',
  'coffee_bags_cups_reconciler',
]);

const AUTOMATED_TRIGGER_KEYS = new Set([
  'daily_sales_report',
  'low_stock_alert',
  'warehouse_balancing',
  'system_health',
  'daily_backup_reminder',
  'supplier_payment_due_alert',
  'daily_profit_margin_anomaly',
  'cashflow_risk_shield',
  'roastery_recipe_waste_guard',
  'customer_loyalty_dormant_winback',
  'scheduled_cron_task',
  'error_tracker_alert',
  'webhook_listener',
  'telegram_notifier',
  'debt_credit_sentinel',
  'purchase_stock_ingestion_guard',
  'coffee_bags_cups_reconciler',
]);

const canonicalAutomationKey = (key: string) => AUTOMATION_ALIASES[key] || key;
const canRunAutomation = (key: string) =>
  EXECUTABLE_AUTOMATION_KEYS.has(canonicalAutomationKey(key));
const hasAutomatedTrigger = (key: string, triggerType: string, cronExpression: string | null) => {
  const canonical = canonicalAutomationKey(key);
  if (!EXECUTABLE_AUTOMATION_KEYS.has(canonical)) {
    return false;
  }
  if (triggerType === 'cron') {
    return Boolean(cronExpression);
  }
  if (triggerType === 'event') {
    return true;
  }
  return false;
};
// ─── خدمة الـ Graph ──────────────────────────────────────

export class WorkflowGraphService {
  /**
   * جلب كل العقد والروابط بتنسيق الرسم البياني
   */
  static async getGraphData(): Promise<GraphData> {
    let [nodesRes, edgesRes] = await Promise.all([
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

    // إذا كانت العقد فارغة (مثلاً بعد تصفير بيانات أو تهيئة أولى)، استعد الافتراضيات ذاتياً
    if (nodesRes.rows.length === 0) {
      logger.warn(
        '[WorkflowGraphService] لم يتم العثور على عقد سير العمل — جاري استعادة العقد والروابط الافتراضية تلقائياً...',
      );
      await WorkflowGraphService.resetToDefaults();
      [nodesRes, edgesRes] = await Promise.all([
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
    }

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
          (1, 'agent', 'Cashier POS',        'كاشير POS',            'operations',  '{"icon": "monitor", "color": "#10b981"}'::jsonb,  -220, -120),
          (2, 'agent', 'Main Warehouse',     'المخزن الرئيسي',       'inventory',   '{"icon": "warehouse", "color": "#3b82f6"}'::jsonb,  220,  -60),
          (3, 'agent', 'Recipe Engine',      'محرك الوصفات',         'production',  '{"icon": "flask", "color": "#f59e0b"}'::jsonb,       0,   120),
          (4, 'agent', 'Telegram Bot',       'وكيل تليجرام',         'notifications','{"icon": "send", "color": "#8b5cf6"}'::jsonb,       320,  160),
          (5, 'agent', 'AI Copilot (Gemini)','المساعد Gemini',       'ai',          '{"icon": "brain", "color": "#ec4899"}'::jsonb,      -320,  160),
          (6, 'agent', 'System Alerts',      'إشعارات النظام',       'notifications','{"icon": "bell", "color": "#ef4444"}'::jsonb,        320, -160),
          (7, 'trigger', 'Manual Daily Entry',     'إدخال يدوي',            'sales',     '{"icon": "edit", "color": "#6b7280", "rule": "RULE_1_MANUAL"}'::jsonb,     -420, -220),
          (8, 'trigger', 'Wholesale Invoice',      'فاتورة جملة',           'sales',     '{"icon": "file-text", "color": "#6b7280", "rule": "RULE_2_WHOLESALE"}'::jsonb, -420, 0),
          (9, 'trigger', 'Cashier Report Import',  'تقرير الكاشير',         'sales',     '{"icon": "upload", "color": "#6b7280", "rule": "RULE_3_CASHIER"}'::jsonb,  -420, 220),
          (10, 'action', 'Direct Stock Deduction',  'خصم مخزون مباشر',       'inventory', '{"icon": "minus-circle", "color": "#14b8a6"}'::jsonb, 0,  -220),
          (11, 'action', 'Recipe Calculation',      'حساب الوصفات',          'production','{"icon": "calculator", "color": "#f97316"}'::jsonb,   0,    0),
          (12, 'action', 'Warehouse Stock Update',  'تحديث المخزن',          'inventory', '{"icon": "refresh-cw", "color": "#0ea5e9"}'::jsonb,  220,  220),
          (13, 'agent', 'Debt & Credit Sentinel',      'وكيل المديونيات',      'sales',      '{"icon": "credit-card", "color": "#f59e0b"}'::jsonb, -220,   60),
          (14, 'agent', 'Purchase Ingestion Guard',    'وكيل المشتريات',        'inventory',  '{"icon": "truck",       "color": "#10b981"}'::jsonb,    0,  -60),
          (15, 'agent', 'Coffee Bags & Cups Counter',  'مطابق الأكواب والبن',   'production', '{"icon": "coffee",      "color": "#8b5cf6"}'::jsonb,  220,   60)
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
          (5, 2, 'read_only', 'قراءة بيانات المخزون'),
          (8, 13, 'is_credit = true', 'بيع آجل / فواتير جملة'),
          (13, 6, 'limit_breached', 'تنبيه تجاوز الائتمان'),
          (14, 2, NULL, 'تحديث رصيد المخزن آلياً'),
          (14, 6, 'on_cost_increase', 'إنذار ارتفاع سعر التكلفة'),
          (1, 15, NULL, 'مبيعات الكاشير (مشروبات + أكياس)'),
          (15, 2, NULL, 'مطابقة المنصرف من الأكواب والبن'),
          (15, 6, 'variance > 5%', 'إنذار هدر الأكواب/البن')
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
      // فشل الحفظ لا يُبتلع — يُرفع للمتحكم كي تعيد الواجهة رسالة خطأ صادقة بحالة HTTP مناسبة
      logger.error('⚠ فشل حفظ إعدادات الفيزياء في جدول settings —', err.message);
      throw new AppError(`فشل حفظ إعدادات الفيزياء: ${err.message || 'خطأ غير معروف'}`, 500);
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
    return res.rows.map((automation: any) => ({
      ...automation,
      execution_supported: canRunAutomation(automation.key),
      trigger_supported: hasAutomatedTrigger(
        automation.key,
        automation.trigger_type,
        automation.cron_expression,
      ),
    }));
  }

  /**
   * تفعيل أو تعطيل مهمة أتمتة
   */
  static async toggleAutomation(key: string, isEnabled: boolean) {
    const canonicalKey = canonicalAutomationKey(key);
    if (isEnabled) {
      const current = await query(
        `SELECT trigger_type, cron_expression FROM automations WHERE key IN ($1, $2) LIMIT 1`,
        [canonicalKey, key],
      );
      const automation = current.rows[0];
      if (
        !automation ||
        !canRunAutomation(canonicalKey) ||
        !hasAutomatedTrigger(canonicalKey, automation.trigger_type, automation.cron_expression)
      ) {
        return { unsupported: true };
      }
    }
    const res = await query(
      `UPDATE automations
       SET is_enabled = $1, updated_at = NOW()
       WHERE key IN ($2, $3)
       RETURNING *`,
      [isEnabled, canonicalKey, key],
    );
    return res.rows[0] || null;
  }

  static async getExecutionLogs(limit = 50, offset = 0, key?: string) {
    // تصفية اختيارية حسب المهمة (تُطبَّع عبر المرادفات المعروفة)
    const canonicalKey = key && key.trim() ? canonicalAutomationKey(key.trim()) : null;
    const logs = await query(
      `SELECT l.id, l.execution_id, l.automation_id, a.key, a.name_ar,
              l.event_name, l.status, l.title, l.message, l.payload,
              l.trigger_source, l.attempt, l.started_at, l.finished_at,
              l.duration_ms, l.error_message, l.created_at
       FROM automation_logs l
       LEFT JOIN automations a ON a.id = l.automation_id
       ${canonicalKey ? 'WHERE a.key = $3' : ''}
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      canonicalKey ? [limit, offset, canonicalKey] : [limit, offset],
    );
    const count = canonicalKey
      ? await query(
          `SELECT COUNT(*)::int AS total
           FROM automation_logs l
           LEFT JOIN automations a ON a.id = l.automation_id
           WHERE a.key = $1`,
          [canonicalKey],
        )
      : await query(`SELECT COUNT(*)::int AS total FROM automation_logs`);
    return { logs: logs.rows, total: count.rows[0]?.total || 0 };
  }

  /**
   * تحديث إعدادات (config) مهمة أتمتة — التحقق من المدخلات يتم في المتحكم
   */
  static async updateAutomationConfig(key: string, taskConfig: Record<string, unknown>) {
    const canonicalKey = canonicalAutomationKey(key);
    const res = await query(
      `UPDATE automations
       SET config = $1::jsonb, updated_at = NOW()
       WHERE key IN ($2, $3)
       RETURNING id, key, name_ar, config, updated_at`,
      [JSON.stringify(taskConfig), canonicalKey, key],
    );
    return res.rows[0] || null;
  }

  /**
   * تشغيل فوري لمهمة أتمتة مع إرسال إشعار تليجرام وتوثيق السجل
   */
  static async runAutomationNow(
    key: string,
    options: { triggerSource?: string; executionId?: string; scheduledFor?: Date } = {},
  ): Promise<{ success: boolean; message: string; payload?: any }> {
    const canonicalKey = canonicalAutomationKey(key);
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
        `SELECT id, key, is_enabled, config FROM automations
         WHERE key IN ($1, $2)
         ORDER BY CASE WHEN key = $1 THEN 0 ELSE 1 END LIMIT 1`,
        [canonicalKey, key],
      );
      if (!automationRes.rows[0]) {
        return { success: false, message: 'مهمة الأتمتة غير موجودة.' };
      }
      automationId = Number(automationRes.rows[0].id);
      persistedKey = automationRes.rows[0].key;
      if (triggerSource === 'scheduler' && !automationRes.rows[0].is_enabled) {
        return { success: false, message: 'مهمة الأتمتة معطلة حاليًا.' };
      }
      if (!canRunAutomation(canonicalKey)) {
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

      // تنفيذ المعالج المناسب من السجل (key → handler) لجمع العنوان والنص والحالة
      const { AUTOMATION_HANDLERS } = await import('./automationHandlers.ts');
      const handler = AUTOMATION_HANDLERS[canonicalKey];
      if (handler) {
        const result = await handler({
          key: canonicalKey,
          config: automationRes.rows[0].config || {},
          scheduledFor: options.scheduledFor || new Date(),
        });
        title = result.title;
        notificationText = result.text;
        status = result.status;
      }

      // قناة in_app: إنشاء إشعار داخلي عبر خدمة الإشعارات عند طلب المهمة ذلك
      let inAppNotificationSent = false;
      try {
        const channelsRes = await query(`SELECT channels FROM automations WHERE key = $1 LIMIT 1`, [
          persistedKey,
        ]);
        const channels = channelsRes.rows[0]?.channels || {};
        if (channels.in_app) {
          const { sendAlert } = await import('./notificationService.ts');
          await sendAlert(
            title,
            notificationText.replace(/<[^>]*>/g, '').trim(),
            status === 'warning' ? 'warning' : 'info',
          );
          inAppNotificationSent = true;
        }
      } catch (err: any) {
        logger.warn(`فشل إنشاء الإشعار الداخلي للمهمة ${persistedKey}: ${err.message}`);
      }

      // إرسال الإشعار لتليجرام مع قراءة النتيجة الفعلية — الفشل لا يُبتلع كنجاح
      let telegramSent = false;
      let telegramError: string | null = null;
      if (creds.token && creds.defaultChatId) {
        const sendResult = await TelegramService.sendMessage(notificationText, {
          botToken: creds.token,
          chatId: creds.defaultChatId,
        });
        telegramSent = sendResult.success;
        if (!sendResult.success) {
          telegramError = sendResult.error || 'فشل إرسال الإشعار إلى تليجرام';
          status = 'warning';
        }
      }

      // تحديث حالة الأتمتة وتصفير عداد إعادة المحاولة عند النجاح
      await query(
        `UPDATE automations
         SET last_run_at = NOW(), last_status = $1, updated_at = NOW(),
             retry_count = 0, next_retry_at = NULL
         WHERE key = $2`,
        [status, persistedKey],
      );

      if (logId) {
        const finishedAt = new Date();
        await query(
          `UPDATE automation_logs
           SET status = $1, title = $2, message = $3, payload = $4,
               error_message = $5, finished_at = $6, duration_ms = $7
           WHERE id = $8`,
          [
            status,
            title,
            telegramError
              ? `اكتمل تنفيذ ${title} لكن فشل إرسال الإشعار: ${telegramError}`
              : `اكتمل تنفيذ ${title}`,
            JSON.stringify({
              status,
              notificationSent: telegramSent,
              inAppNotificationSent,
              notificationError: telegramError,
            }),
            telegramError,
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
        message: telegramError
          ? `تم تنفيذ ${title} لكن فشل إرسال إشعار تليجرام: ${telegramError}`
          : `تم تشغيل ${title} بنجاح${telegramSent ? ' وإرسال الإشعار لتليجرام' : ''}.`,
        payload: {
          notificationText,
          status,
          executionId,
          notificationSent: telegramSent,
          inAppNotificationSent,
          notificationError: telegramError,
        },
      };
    } catch (err: any) {
      logger.error(`فشل تشغيل الأتمتة ${key}:`, err.message);
      // تسجيل الفشل وزيادة عداد المحاولات مع backoff متزايد: دقيقة ثم 5 ثم 15
      // (العمودان retry_count و next_retry_at يضيفهما ترحيل 083 ويقرأهما المجدول)
      await query(
        `UPDATE automations
         SET last_run_at = NOW(), last_status = 'failed', updated_at = NOW(),
             retry_count = COALESCE(retry_count, 0) + 1,
             next_retry_at = NOW() + (CASE COALESCE(retry_count, 0) + 1
               WHEN 1 THEN interval '1 minute'
               WHEN 2 THEN interval '5 minutes'
               ELSE interval '15 minutes' END)
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
