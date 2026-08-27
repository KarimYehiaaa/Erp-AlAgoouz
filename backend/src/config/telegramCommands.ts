/**
 * config/telegramCommands.ts — سجل أوامر بوت تليجرام المركزي (Centralized Command Registry)
 * ═════════════════════════════════════════════════════════════════════════════════════
 * التقاط كافة مسارات/معالجات البوت السابقة (سلاسل if-else القديمة) وإعادة تنظيمها
 * في سجل واحد برمجي، بحيث يصبح كل أمر متصلاً مباشرة بمحرك الأتمتة:
 *
 *   رسالة تليجرام → normalizeCommand → findCommand → run() → محرك الأتمتة → رد فوري
 *
 * إضافة أمر جديد = إضافة مدخل هنا فقط (وسيظهر تلقائياً في قائمة /help).
 */

import AutomationService from '../services/automationService.ts';
import BranchBalancingService from '../services/branchBalancingService.ts';
import db from '../database/pool.ts';

export interface TelegramCommandContext {
  /** نص الأمر بعد التوحيد */
  normalized: string;
  /** النص الخام كما وصل */
  rawText: string;
  /** معرف الشات المرسل */
  chatId: string;
  /** اسم المرسل للترحيب */
  userName: string;
  /** دالة الرد الجاهزة على تليجرام */
  reply: (htmlContent: string) => Promise<void>;
}

export interface TelegramCommandDef {
  /** معرّف فريد للأمر (يُستخدم أيضاً كعقدة مسار في الشبكة) */
  id: string;
  /** كل الكلمات المفتاحية العربية والإنجليزية التي تستدعي الأمر */
  aliases: string[];
  /** وصف مختصر يظهر في قائمة الأوامر */
  description_ar: string;
  /** تنفيذ الأمر: يتصل بمحرك الأتمتة ويرجع نص HTML أُرسل فعلياً */
  run: (ctx: TelegramCommandContext) => Promise<string>;
}

/** توحيد نص الأمر الوارد: إزالة الرموز واللواحق وتوحيد الحالة */
export function normalizeCommand(rawText: string): string {
  return rawText
    .replace(/^[/\\#@]/, '')
    .split('@')[0]
    .trim()
    .toLowerCase();
}

/** ── 1. الترحيب وقائمة الأوامر ── */
async function runHelp(ctx: TelegramCommandContext): Promise<string> {
  const lines = TELEGRAM_COMMANDS.filter((c) => c.id !== 'help')
    .map((c) => `▫️ <b>/${c.aliases[0]}</b> — ${c.description_ar}`)
    .join('\n');

  const welcomeText = `
☕ <b>أهلاً بك في بوت بن العجوز ERP الذكي</b> 🤖
═════════════════════════
مرحباً <b>${ctx.userName}</b>، يمكنك التحكم في النظام عبر الأوامر التالية:

${lines}

═════════════════════════
🚀 <i>اكتب أي أمر مباشرة وسأجيبك بأحدث أرقام النظام فوراً!</i>
  `.trim();
  await ctx.reply(welcomeText);
  return welcomeText;
}

/** ── 2. تقرير الخزينة والسيولة النقدية الحية ── */
async function runCashReport(ctx: TelegramCommandContext): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const cashRes = await db.query(
    `SELECT
       COALESCE(SUM(total_amount), 0) as total_collected,
       COALESCE(SUM(profit_amount), 0) as total_profit
     FROM sales
     WHERE (sale_date = $1 OR DATE(created_at AT TIME ZONE 'Africa/Cairo') = $1)
       AND status = 'completed' AND deleted_at IS NULL`,
    [today],
  );
  const c = cashRes.rows[0];

  const expRes = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as exp_today FROM expenses WHERE DATE(expense_date) = $1 AND deleted_at IS NULL`,
    [today],
  );
  const expToday = Number(expRes.rows[0]?.exp_today || 0);
  const netCash = Number(c.total_collected) - expToday;

  const cashMsg = `
💵 <b>تقرير الخزينة والسيولة النقدية اليوم</b> 🏦
═════════════════════════
📅 <b>التاريخ:</b> ${today}

💰 <b>إجمالي المبيعات المحصلة:</b> ${Number(c.total_collected).toLocaleString()} ج.م
📈 <b>أرباح اليوم التقديرية:</b> ${Number(c.total_profit).toLocaleString()} ج.م
📉 <b>مصروفات نقدية خرجت اليوم:</b> ${expToday.toLocaleString()} ج.م
⚖️ <b>صافي السيولة النقدية بالدرج:</b> <b>${netCash.toLocaleString()} ج.م</b>
  `.trim();
  await ctx.reply(cashMsg);
  return cashMsg;
}

/**
 * السجل المركزي للأوامر — كل مدخل يلتقط معالجة كانت موجودة سابقاً
 * كسلسلة if-else داخل telegramBotService.ts.
 */
export const TELEGRAM_COMMANDS: TelegramCommandDef[] = [
  {
    id: 'help',
    aliases: [
      'start',
      'help',
      'اوامر',
      'أوامر',
      'الاوامر',
      'الأوامر',
      'مساعدة',
      'مساعده',
      'هلا',
      'مرحبا',
      'سلام',
      'menu',
    ],
    description_ar: 'قائمة الأوامر التفاعلية المتاحة',
    run: runHelp,
  },
  {
    id: 'sales-report',
    aliases: ['sales', 'مبيعات', 'المبيعات', 'تقرير_المبيعات', 'تقرير', 'التقرير', 'تقرير_اليوم'],
    description_ar: 'تقرير مبيعات وأرباح اليوم الحية',
    run: async (ctx) => {
      const auto = await AutomationService.getAutomationByKey('daily_sales_report');
      const report = await AutomationService.generateDailySalesReport(auto?.config || {});
      await ctx.reply(report.htmlMessage);
      return report.htmlMessage;
    },
  },
  {
    id: 'stock-alert',
    aliases: ['stock', 'نواقص', 'النواقص', 'مخزون', 'المخزون', 'خامات', 'الخامات'],
    description_ar: 'فحص خامات البن والأصناف الناقصة',
    run: async (ctx) => {
      const stockAlert = await AutomationService.generateLowStockAlert({});
      await ctx.reply(stockAlert.htmlMessage);
      return stockAlert.htmlMessage;
    },
  },
  {
    id: 'cash-report',
    aliases: [
      'cash',
      'خزينة',
      'الخزينة',
      'خزينه',
      'الخزينه',
      'كاش',
      'الكاش',
      'درج',
      'الدرج',
      'فلوس',
    ],
    description_ar: 'إجمالي السيولة النقدية والمصروفات',
    run: runCashReport,
  },
  {
    id: 'branch-balance',
    aliases: ['balance', 'مناقلات', 'المناقلات', 'فروع', 'الفروع', 'توازن'],
    description_ar: 'اقتراحات توازن المخزون بين الفروع',
    run: async (ctx) => {
      const bal = await BranchBalancingService.generateBalancingRecommendations();
      await ctx.reply(bal.htmlReport);
      return bal.htmlReport;
    },
  },
  {
    id: 'cashflow-shield',
    aliases: ['cashflow', 'سيولة', 'السيولة', 'سيوله', 'السيوله', 'تدفق', 'التدفق'],
    description_ar: 'درع وتوقعات السيولة للـ 14 يوماً القادمة',
    run: async (ctx) => {
      const shield = await AutomationService.generateCashFlowRiskReport();
      await ctx.reply(shield.htmlMessage);
      return shield.htmlMessage;
    },
  },
  {
    id: 'system-health',
    aliases: ['health', 'سيرفر', 'السيرفر', 'سيستم', 'السيستم', 'فحص', 'الفحص'],
    description_ar: 'حالة السيرفر وسلامة قاعدة البيانات',
    run: async (ctx) => {
      const health = await AutomationService.generateSystemHealthSummary();
      await ctx.reply(health.htmlMessage);
      return health.htmlMessage;
    },
  },
];

/** خريطة سريعة: الكلمة الموحدة ← تعريف الأمر */
const COMMAND_BY_ALIAS: Map<string, TelegramCommandDef> = new Map(
  TELEGRAM_COMMANDS.flatMap((cmd) => cmd.aliases.map((alias) => [alias, cmd] as const)),
);

/** البحث عن الأمر المناسب من النص الموحد */
export function findCommand(normalizedText: string): TelegramCommandDef | undefined {
  return COMMAND_BY_ALIAS.get(normalizedText);
}

/** رسالة عدم التعرف على الأمر */
export const UNKNOWN_COMMAND_REPLY = (rawText: string) =>
  `
❓ <b>عفواً، لم أتعرف على الأمر "${rawText}".</b>
اكتب <b>/اوامر</b> لعرض قائمة الأوامر التفاعلية المتاحة للنظام. ☕
  `.trim();
