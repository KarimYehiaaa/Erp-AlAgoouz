/**
 * config/automationGraph.ts — السجل المركزي لشبكة الأتمتة (Centralized Automation Registry)
 * ═════════════════════════════════════════════════════════════════════════════════════
 * المصدر الوحيد للحقيقة (Single Source of Truth) الذي يعرف:
 *   - كل عقد الشبكة: بوت تليجرام (Trigger)، محرك الأتمتة، الوكلاء (Agents)، القنوات.
 *   - كل الروابط بينها: أوامر البوت، التوزيع، التسليم، ومسارات سير العمل الجانبية.
 *
 * أي إضافة وكيل/بوت جديد تتم هنا فقط، وتنعكس تلقائياً على:
 *   - نقطة النهاية GET /automations/graph التي تغذي اللوحة ثلاثية الأبعاد.
 *   - اختبارات سلامة الربط (tests/automation-graph.test.ts).
 */

/** نوع العقدة داخل شبكة الأتمتة */
export type GraphNodeKind = 'trigger' | 'engine' | 'agent' | 'channel';

export type AutomationCategory = 'sales' | 'inventory' | 'security' | 'system' | 'general';

export interface GraphNodeDef {
  /** معرّف فريد للعقدة داخل الرسم البياني */
  id: string;
  kind: GraphNodeKind;
  /** الاسم المعروض بالعربية */
  label_ar: string;
  description_ar?: string;
  /** رمز تعبيري يُرسم على العقدة ثلاثية الأبعاد */
  icon: string;
  /** لون العقدة بصيغة HEX */
  color: string;
  category?: AutomationCategory;
  /** ربط بالصف الفعلي في جدول automations (للوكلاء فقط) */
  automationKey?: string;
}

export type GraphLinkKind = 'command' | 'dispatch' | 'deliver' | 'flow';

export interface GraphLinkDef {
  from: string;
  to: string;
  kind: GraphLinkKind;
}

/** ألوان فئات الأتمتة الموحدة (كانت مكررة في الواجهة — الآن من هنا فقط) */
export const CATEGORY_COLORS: Record<AutomationCategory, string> = {
  sales: '#f59e0b',
  inventory: '#22c55e',
  security: '#ef4444',
  system: '#38bdf8',
  general: '#d4a373',
};

/** معرفات العقد الثابتة (البوت، المحرك، القنوات) */
export const TELEGRAM_TRIGGER_NODE_ID = 'telegram-bot';
export const ENGINE_NODE_ID = 'automation-engine';
export const CHANNEL_TELEGRAM_NODE_ID = 'channel-telegram';
export const CHANNEL_IN_APP_NODE_ID = 'channel-in-app';

/** ── عقد البنية الأساسية: بوت تليجرام + المحرك + قنوات التسليم ── */
const INFRASTRUCTURE_NODES: GraphNodeDef[] = [
  {
    id: TELEGRAM_TRIGGER_NODE_ID,
    kind: 'trigger',
    label_ar: 'بوت تليجرام التفاعلي',
    description_ar: 'نقطة الانطلاق: يستقبل أوامر المالك عبر تليجرام ويطلق مسارات الأتمتة فوراً',
    icon: '✈️',
    color: '#229ed9',
  },
  {
    id: ENGINE_NODE_ID,
    kind: 'engine',
    label_ar: 'محرك الأتمتة المركزي',
    description_ar: 'قلب النظام: يستقبل المحفزات، ينفذ منطق العمل، ويوزع النتائج على القنوات',
    icon: '⚙️',
    color: '#d4a373',
  },
  {
    id: CHANNEL_TELEGRAM_NODE_ID,
    kind: 'channel',
    label_ar: 'قناة تليجرام',
    description_ar: 'تسليم التقارير والإنذارات إلى شات تليجرام الخاص بالإدارة',
    icon: '📲',
    color: '#229ed9',
  },
  {
    id: CHANNEL_IN_APP_NODE_ID,
    kind: 'channel',
    label_ar: 'قناة الإشعارات الداخلية',
    description_ar: 'أرشفة التنبيهات في سجلات النظام الداخلية (automation_logs)',
    icon: '🔔',
    color: '#38bdf8',
  },
];

/** ── عقد الوكلاء (Agents): كل أتمتة معرفة في قاعدة البيانات ── */
export const AGENT_NODES: GraphNodeDef[] = [
  {
    id: 'agent-daily-sales-report',
    kind: 'agent',
    label_ar: 'وكيل تقرير الإغلاق اليومي',
    icon: '📊',
    color: CATEGORY_COLORS.sales,
    category: 'sales',
    automationKey: 'daily_sales_report',
    description_ar: 'تجميع مبيعات وأرباح ومصروفات اليوم وإرسال تقرير الإغلاق ليلاً',
  },
  {
    id: 'agent-low-stock-alert',
    kind: 'agent',
    label_ar: 'وكيل إنذار نواقص المخزون',
    icon: '🚨',
    color: CATEGORY_COLORS.inventory,
    category: 'inventory',
    automationKey: 'low_stock_alert',
    description_ar: 'رصد خامات البن والأصناف التي بلغت حد إعادة الطلب',
  },
  {
    id: 'agent-void-invoice-alert',
    kind: 'agent',
    label_ar: 'وكيل كشف إلغاء الفواتير',
    icon: '⚠️',
    color: CATEGORY_COLORS.security,
    category: 'security',
    automationKey: 'void_invoice_alert',
    description_ar: 'تنبيه فوري عند إلغاء أي فاتورة بعد إصدارها (Anti-Fraud)',
  },
  {
    id: 'agent-large-discount-alert',
    kind: 'agent',
    label_ar: 'وكيل تنبيه الخصومات المرتفعة',
    icon: '💸',
    color: CATEGORY_COLORS.security,
    category: 'security',
    automationKey: 'large_discount_alert',
    description_ar: 'إشعار لحظي عند تطبيق خصم يتجاوز الحد المسموح',
  },
  {
    id: 'agent-daily-backup-reminder',
    kind: 'agent',
    label_ar: 'وكيل فحص النسخ الاحتياطي',
    icon: '🛡️',
    color: CATEGORY_COLORS.system,
    category: 'system',
    automationKey: 'daily_backup_reminder',
    description_ar: 'مراقبة دورية لسلامة قاعدة البيانات والسيرفر والنسخ اليومي',
  },
  {
    id: 'agent-branch-stock-balancing',
    kind: 'agent',
    label_ar: 'وكيل المناقلات الذكية',
    icon: '🔄',
    color: CATEGORY_COLORS.inventory,
    category: 'inventory',
    automationKey: 'branch_stock_balancing',
    description_ar: 'اقتراح مناقلات المخزون بين الفروع الراكدة والنشطة',
  },
  {
    id: 'agent-cashflow-risk-shield',
    kind: 'agent',
    label_ar: 'وكيل درع السيولة',
    icon: '💰',
    color: CATEGORY_COLORS.sales,
    category: 'sales',
    automationKey: 'cashflow_risk_shield',
    description_ar: 'تنبؤ استباقي بالعجز المالي مقارنة الالتزامات بالإيرادات المتوقعة',
  },
  {
    id: 'agent-shift-handover-reconciliation',
    kind: 'agent',
    label_ar: 'وكيل مطابقة العهدة والشيفت',
    icon: '💵',
    color: CATEGORY_COLORS.security,
    category: 'security',
    automationKey: 'shift_handover_reconciliation',
    description_ar: 'مطابقة نقدية درج الكاشير مع مبيعات الشيفت وإنذار عند العجز',
  },
  {
    id: 'agent-roastery-recipe-waste-guard',
    kind: 'agent',
    label_ar: 'وكيل حارس الهدر والتحميص',
    icon: '🫘',
    color: CATEGORY_COLORS.inventory,
    category: 'inventory',
    automationKey: 'roastery_recipe_waste_guard',
    description_ar: 'مقارنة استهلاك الخامات بالوصفات وإنذار عند تجاوز نسبة الهدر',
  },
  {
    id: 'agent-supplier-payment-due-alert',
    kind: 'agent',
    label_ar: 'وكيل استحقاقات الموردين',
    icon: '🚚',
    color: CATEGORY_COLORS.sales,
    category: 'sales',
    automationKey: 'supplier_payment_due_alert',
    description_ar: 'تنبيه قبل موعد استحقاق دفعات فواتير الموردين الآجلة',
  },
  {
    id: 'agent-customer-loyalty-dormant-winback',
    kind: 'agent',
    label_ar: 'وكيل استعادة العملاء المنقطعين',
    icon: '🎁',
    color: CATEGORY_COLORS.sales,
    category: 'sales',
    automationKey: 'customer_loyalty_dormant_winback',
    description_ar: 'رصد العملاء الغائبين وتجهيز عروض ترويجية لاستعادتهم',
  },
  {
    id: 'agent-daily-profit-margin-anomaly',
    kind: 'agent',
    label_ar: 'وكيل كاشف هوامش الربح',
    icon: '📈',
    color: CATEGORY_COLORS.sales,
    category: 'sales',
    automationKey: 'daily_profit_margin_anomaly',
    description_ar: 'مراقبة هامش الربح اليومي وإنذار عند التراجع عن المستهدف',
  },
];

/** ── الروابط المركزية للشبكة ── */
function buildLinks(): GraphLinkDef[] {
  const links: GraphLinkDef[] = [
    // بوت تليجرام → محرك الأتمتة (مسار الأوامر التفاعلية)
    { from: TELEGRAM_TRIGGER_NODE_ID, to: ENGINE_NODE_ID, kind: 'command' },
  ];

  for (const agent of AGENT_NODES) {
    // المحرك يوزع المهام على الوكلاء
    links.push({ from: ENGINE_NODE_ID, to: agent.id, kind: 'dispatch' });
    // الوكلاء يسلمون المخرجات إلى القنوات (حسب بذور migrations: تليجرام + داخلي)
    links.push({ from: agent.id, to: CHANNEL_TELEGRAM_NODE_ID, kind: 'deliver' });
    links.push({ from: agent.id, to: CHANNEL_IN_APP_NODE_ID, kind: 'deliver' });
  }

  // مسارات سير العمل الجانبية بين الوكلاء ذوي الصلة (Data Streams)
  const flowPairs: Array<[string, string]> = [
    ['daily_sales_report', 'cashflow_risk_shield'],
    ['cashflow_risk_shield', 'supplier_payment_due_alert'],
    ['shift_handover_reconciliation', 'daily_sales_report'],
    ['void_invoice_alert', 'large_discount_alert'],
    ['low_stock_alert', 'roastery_recipe_waste_guard'],
    ['roastery_recipe_waste_guard', 'branch_stock_balancing'],
    ['daily_profit_margin_anomaly', 'daily_sales_report'],
    ['customer_loyalty_dormant_winback', 'daily_sales_report'],
  ];
  for (const [a, b] of flowPairs) {
    const from = AGENT_NODES.find((n) => n.automationKey === a)?.id;
    const to = AGENT_NODES.find((n) => n.automationKey === b)?.id;
    if (from && to) links.push({ from, to, kind: 'flow' });
  }

  return links;
}

/** جميع عقد الشبكة (بنية تحتية + وكلاء) */
export const AUTOMATION_GRAPH_NODES: GraphNodeDef[] = [...INFRASTRUCTURE_NODES, ...AGENT_NODES];

/** جميع روابط الشبكة */
export const AUTOMATION_GRAPH_LINKS: GraphLinkDef[] = buildLinks();

/** خريطة سريعة: معرّف العقدة ← التعريف */
export const NODE_BY_ID: Map<string, GraphNodeDef> = new Map(
  AUTOMATION_GRAPH_NODES.map((n) => [n.id, n]),
);

/** بحث معرّف عدة الوكيل من مفتاح الأتمتة في قاعدة البيانات */
export function nodeIdForAutomationKey(automationKey: string): string | undefined {
  return AGENT_NODES.find((n) => n.automationKey === automationKey)?.id;
}

/** ملخص السجل (لاختبارات السلامة والتشخيص السريع) */
export function getRegistrySummary() {
  return {
    totalNodes: AUTOMATION_GRAPH_NODES.length,
    agents: AGENT_NODES.length,
    triggers: AUTOMATION_GRAPH_NODES.filter((n) => n.kind === 'trigger').length,
    engines: AUTOMATION_GRAPH_NODES.filter((n) => n.kind === 'engine').length,
    channels: AUTOMATION_GRAPH_NODES.filter((n) => n.kind === 'channel').length,
    totalLinks: AUTOMATION_GRAPH_LINKS.length,
  };
}
