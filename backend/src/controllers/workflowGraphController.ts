/**
 * controllers/workflowGraphController.ts — متحكم الرسم البياني التفاعلي لمحرك الأتمتة
 * يقدم RESTful API لخدمة بيانات الـ Force-Graph وإعدادات الفيزياء وسجلات تليجرام.
 */

import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import WorkflowGraphService from '../services/workflowGraphService.ts';
import TelegramBotService from '../services/telegramBotService.ts';
import config from '../config/index.ts';
import { tickDueAutomations } from '../services/automationSchedulerService.ts';
import { wrap } from './helper.ts';

/**
 * GET /automation/graph
 * جلب كل العقد والروابط بتنسيق d3-force
 */
export const getGraph = wrap(async (_req: Request, res: Response) => {
  const data = await WorkflowGraphService.getGraphData();
  res.json({ success: true, data });
});

/**
 * GET /automation/nodes
 * قائمة العقد
 */
export const getNodes = wrap(async (_req: Request, res: Response) => {
  const nodes = await WorkflowGraphService.getNodes();
  res.json({ success: true, data: nodes });
});

/**
 * POST /automation/nodes
 * إنشاء عقدة جديدة
 */
export const createNode = wrap(async (req: Request, res: Response) => {
  const { type, label, label_ar, group_name, settings, position_x, position_y } = req.body;
  if (!type || !label) {
    return res.status(400).json({ success: false, message: 'الحقول المطلوبة: type, label' });
  }

  const node = await WorkflowGraphService.createNode({
    type,
    label,
    label_ar,
    group_name,
    settings,
    position_x,
    position_y,
  });
  res.status(201).json({ success: true, data: node });
});

/**
 * PUT /automation/nodes/:id
 * تحديث عقدة (بيانات أو موقع)
 */
export const updateNode = wrap(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    return res.status(400).json({ success: false, message: 'معرّف العقدة غير صالح' });
  }

  const node = await WorkflowGraphService.updateNode(id, req.body);
  if (!node) {
    return res.status(404).json({ success: false, message: 'العقدة غير موجودة' });
  }
  res.json({ success: true, data: node });
});

/**
 * DELETE /automation/nodes/:id
 * حذف عقدة (مع الروابط المرتبطة — CASCADE)
 */
export const deleteNode = wrap(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = await WorkflowGraphService.deleteNode(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'العقدة غير موجودة' });
  }
  res.json({ success: true, message: 'تم حذف العقدة بنجاح' });
});

/**
 * PUT /automation/nodes/positions
 * حفظ مواقع العقد بعد السحب (Batch)
 */
export const updateNodePositions = wrap(async (req: Request, res: Response) => {
  const { positions } = req.body;
  if (!Array.isArray(positions)) {
    return res.status(400).json({ success: false, message: 'يجب إرسال مصفوفة positions' });
  }

  await WorkflowGraphService.updateNodePositions(positions);
  res.json({ success: true, message: 'تم حفظ المواقع بنجاح' });
});

/**
 * POST /automation/edges
 * إنشاء رابط جديد بين عقدتين
 */
export const createEdge = wrap(async (req: Request, res: Response) => {
  const { source_node_id, target_node_id, condition, label } = req.body;
  if (!source_node_id || !target_node_id) {
    return res
      .status(400)
      .json({ success: false, message: 'الحقول المطلوبة: source_node_id, target_node_id' });
  }

  try {
    const edge = await WorkflowGraphService.createEdge({
      source_node_id,
      target_node_id,
      condition,
      label,
    });
    res.status(201).json({ success: true, data: edge });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'هذا الرابط موجود بالفعل' });
    }
    throw err;
  }
});

/**
 * DELETE /automation/edges/:id
 * حذف رابط
 */
export const deleteEdge = wrap(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = await WorkflowGraphService.deleteEdge(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'الرابط غير موجود' });
  }
  res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
});

/**
 * GET /automation/physics
 * جلب إعدادات الفيزياء
 */
export const getPhysics = wrap(async (_req: Request, res: Response) => {
  const settings = await WorkflowGraphService.getPhysicsSettings();
  res.json({ success: true, data: settings });
});

/**
 * PUT /automation/physics
 * تحديث إعدادات الفيزياء
 */
export const updatePhysics = wrap(async (req: Request, res: Response) => {
  const settings = await WorkflowGraphService.updatePhysicsSettings(req.body);
  res.json({ success: true, data: settings });
});

/**
 * GET /automation/telegram-logs
 * سجل محادثات تليجرام
 */
export const getTelegramLogs = wrap(async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const result = await WorkflowGraphService.getTelegramLogs(limit, offset);
  res.json({ success: true, data: result });
});

/**
 * POST /automation/telegram/toggle
 * تشغيل/إيقاف بوت تليجرام
 */
export const toggleTelegramBot = wrap(async (req: Request, res: Response) => {
  const { enabled } = req.body;

  if (enabled) {
    await TelegramBotService.startListening();
    res.json({ success: true, message: 'تم تشغيل بوت تليجرام بنجاح', data: { active: true } });
  } else {
    TelegramBotService.stopListening();
    res.json({ success: true, message: 'تم إيقاف بوت تليجرام', data: { active: false } });
  }
});

/**
 * GET /automation/telegram/status
 * حالة البوت التفاعلي المفصلة والتحقق من الاتصال
 */
export const getTelegramBotStatus = wrap(async (_req: Request, res: Response) => {
  const status = await TelegramBotService.getBotStatus();
  res.json({
    success: true,
    data: status,
  });
});

/**
 * POST /automation/telegram/settings
 * حفظ وتفعيل إعدادات بوت تليجرام في قاعدة البيانات
 */
export const saveTelegramSettings = wrap(async (req: Request, res: Response) => {
  const { bot_token, chat_id, allowed_chats } = req.body;

  if (!bot_token || typeof bot_token !== 'string' || !bot_token.trim()) {
    return res.status(400).json({ success: false, message: 'رمز البوت (Bot Token) مطلوب' });
  }

  if (!chat_id || typeof chat_id !== 'string' || !chat_id.trim()) {
    return res.status(400).json({ success: false, message: 'معرف الشات (Chat ID) مطلوب' });
  }

  const tokenTrimmed = bot_token.trim();
  const chatIdTrimmed = chat_id.trim();

  // فحص الاتصال بالرمز مع Telegram Bot API للتأكد من صحته
  const check = await TelegramBotService.verifyCredentials(tokenTrimmed);
  if (!check.ok) {
    return res.status(400).json({
      success: false,
      message: check.error || 'رمز البوت غير صالح أو لم يتم قبوله من تليجرام',
    });
  }

  const { upsertSetting } = await import('../services/userService.ts');
  const userId = (req as any).user?.id || null;

  await upsertSetting(
    'telegram',
    {
      bot_token: tokenTrimmed,
      chat_id: chatIdTrimmed,
      allowed_chats: typeof allowed_chats === 'string' ? allowed_chats.trim() : '',
    },
    userId,
    'إعدادات بوت تليجرام والإشعارات',
  );

  // إعادة تشغيل الاستماع التفاعلي بالرمز الجديد
  await TelegramBotService.restartListening();

  res.json({
    success: true,
    message: `تم حفظ الإعدادات وتوصيل البوت بنجاح! (@${check.bot?.username})`,
    data: check.bot,
  });
});

/**
 * POST /automation/telegram/verify
 * فحص صلاحية رمز البوت قبل الحفظ
 */
export const verifyTelegramCredentials = wrap(async (req: Request, res: Response) => {
  const { bot_token } = req.body;
  const result = await TelegramBotService.verifyCredentials(bot_token);
  if (!result.ok) {
    return res.status(400).json({ success: false, message: result.error });
  }
  res.json({ success: true, data: result.bot });
});

/**
 * POST /automation/telegram/test-send
 * إرسال رسالة تجريبية لتليجرام
 */
export const sendTelegramTestMessage = wrap(async (req: Request, res: Response) => {
  const { message } = req.body;
  const creds = await TelegramBotService.getBotCredentials();
  const text =
    message ||
    `☕ <b>بن العجوز ERP — اختبار الاتصال المباشر</b>\n\n✅ تم إرسال هذه الرسالة بنجاح عبر محرك الأتمتة والتحكم.\n⏱ ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;

  const { default: TelegramService } = await import('../services/telegramService.ts');
  const result = await TelegramService.sendMessage(text, {
    botToken: creds.token,
    chatId: creds.defaultChatId,
  });

  if (result.success) {
    await WorkflowGraphService.logTelegramMessage({
      chat_id: creds.defaultChatId,
      direction: 'out',
      message: text,
      automation_key: 'manual_test',
    });
    res.json({ success: true, message: 'تم إرسال الرسالة إلى تليجرام بنجاح!' });
  } else {
    res.status(400).json({ success: false, message: result.error || 'فشل إرسال الرسالة' });
  }
});

/**
 * POST /automation/graph/reset-defaults
 * إعادة ضبط العقد والروابط الافتراضية
 */
export const resetGraphDefaults = wrap(async (_req: Request, res: Response) => {
  const data = await WorkflowGraphService.resetToDefaults();
  res.json({ success: true, message: 'تمت إعادة ضبط شبكة الأتمتة بنجاح', data });
});

/**
 * POST /automation/ai/test
 * اختبار سؤال للذكاء الاصطناعي (Gemini)
 */
export const testAiPrompt = wrap(async (req: Request, res: Response) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, message: 'يرجى إدخال نص السؤال' });
  }

  const { askCopilot } = await import('../services/aiCopilotService.ts');
  const reply = await askCopilot(prompt);
  res.json({
    success: true,
    data: {
      reply: typeof reply === 'string' ? reply : (reply as any)?.text || '',
    },
  });
});

/**
 * GET /automation/tasks
 * جلب قائمة مهام الأتمتة المسجلة وحالتها
 */
export const getAutomationsList = wrap(async (_req: Request, res: Response) => {
  const list = await WorkflowGraphService.getAutomations();
  res.json({ success: true, data: list });
});

/**
 * POST /automation/tasks/:key/toggle
 * تفعيل / تعطيل أتمتة
 */
export const toggleAutomationTask = wrap(async (req: Request, res: Response) => {
  const key = String(req.params.key);
  const { is_enabled } = req.body;
  const updated = await WorkflowGraphService.toggleAutomation(key, Boolean(is_enabled));
  if ((updated as any)?.unsupported) {
    return res.status(409).json({
      success: false,
      message: 'لا يمكن تفعيل المهمة آلياً لعدم توفر معالج وجدولة مدعومين لها.',
    });
  }
  if (!updated) {
    return res.status(404).json({ success: false, message: 'مهمة الأتمتة غير موجودة' });
  }
  res.json({ success: true, message: 'تم تحديث حالة الأتمتة بنجاح', data: updated });
});

/**
 * POST /automation/tasks/:key/run
 * تشغيل فوري لمهمة أتمتة
 */
export const runAutomationTaskNow = wrap(async (req: Request, res: Response) => {
  const key = String(req.params.key);
  const result = await WorkflowGraphService.runAutomationNow(key);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }
  res.json(result);
});

/**
 * GET /automation/execution-logs
 * سجل تشغيل الأتمتة ونتائجها — يقبل ?key= اختياريًا للتصفية حسب المهمة.
 */
export const getAutomationExecutionLogs = wrap(async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const key =
    typeof req.query.key === 'string' && req.query.key.trim() ? req.query.key.trim() : undefined;
  const result = await WorkflowGraphService.getExecutionLogs(limit, offset, key);
  res.json({ success: true, data: result });
});

/**
 * PUT /automation/tasks/:key/config
 * تحديث إعدادات مهمة أتمتة (config) مع تحقق من المدخلات.
 */
export const updateAutomationTaskConfig = wrap(async (req: Request, res: Response) => {
  const key = String(req.params.key || '').trim();
  if (!key || !/^[a-z0-9_]+$/i.test(key)) {
    return res.status(400).json({ success: false, message: 'مفتاح المهمة غير صالح' });
  }
  const { config: taskConfig } = req.body;
  // كائن مسطح بمفاتيح ثعبانية وقيم أولية فقط — يمنع حقن مفاتيح شاذة أو كائنات متداخلة
  if (!taskConfig || typeof taskConfig !== 'object' || Array.isArray(taskConfig)) {
    return res.status(400).json({ success: false, message: 'يجب إرسال config ككائن JSON صالح' });
  }
  const MAX_CONFIG_BYTES = 8 * 1024;
  const clean: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(taskConfig as Record<string, unknown>)) {
    if (!/^[a-z0-9_]+$/i.test(field)) {
      return res.status(400).json({ success: false, message: `مفتاح إعداد غير صالح: ${field}` });
    }
    const allowed =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null;
    if (!allowed) {
      return res.status(400).json({
        success: false,
        message: `قيمة غير مدعومة للمفتاح ${field} — مسموح فقط: نص/رقم/منطقي/null`,
      });
    }
    clean[field] = value;
  }
  if (Buffer.byteLength(JSON.stringify(clean), 'utf8') > MAX_CONFIG_BYTES) {
    return res.status(400).json({ success: false, message: 'حجم الإعدادات يتجاوز الحد المسموح' });
  }

  const updated = await WorkflowGraphService.updateAutomationConfig(key, clean);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'مهمة الأتمتة غير موجودة' });
  }
  res.json({ success: true, message: 'تم تحديث إعدادات المهمة بنجاح', data: updated });
});

/**
 * POST|GET /automation/scheduler/tick
 * نقطة تشغيل آمنة للـ Cron الخارجي على Vercel أو أي مزود جدولة.
 * Vercel Cron يرسل GET مع Authorization: Bearer <secret> — ندعم الطريقتين مع مقارنة ثابتة الزمن.
 */
export const runAutomationSchedulerTick = wrap(async (req: Request, res: Response) => {
  // السر من الإعداد المركزي (AUTOMATION_CRON_SECRET) مع احتياط CRON_SECRET
  const expected = config.automation.cronSecret || (process.env.CRON_SECRET || '').trim();
  const headerSecret = String(req.get('x-automation-cron-secret') || '');
  const authHeader = String(req.get('authorization') || '');
  const bearerSecret = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const provided = headerSecret || bearerSecret;
  if (!expected || !provided) {
    return res.status(503).json({ success: false, message: 'لم يتم إعداد سر جدولة الأتمتة.' });
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return res.status(401).json({ success: false, message: 'بيانات اعتماد المجدول غير صحيحة.' });
  }
  const result = await tickDueAutomations();
  res.json({ success: true, data: result });
});
