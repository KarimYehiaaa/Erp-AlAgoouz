/**
 * controllers/workflowGraphController.ts — متحكم الرسم البياني التفاعلي لمحرك الأتمتة
 * يقدم RESTful API لخدمة بيانات الـ Force-Graph وإعدادات الفيزياء وسجلات تليجرام.
 */

import type { Request, Response } from 'express';
import WorkflowGraphService from '../services/workflowGraphService.ts';
import TelegramBotService from '../services/telegramBotService.ts';

/**
 * GET /automation/graph
 * جلب كل العقد والروابط بتنسيق d3-force
 */
export const getGraph = async (_req: Request, res: Response) => {
  const data = await WorkflowGraphService.getGraphData();
  res.json({ success: true, data });
};

/**
 * GET /automation/nodes
 * قائمة العقد
 */
export const getNodes = async (_req: Request, res: Response) => {
  const nodes = await WorkflowGraphService.getNodes();
  res.json({ success: true, data: nodes });
};

/**
 * POST /automation/nodes
 * إنشاء عقدة جديدة
 */
export const createNode = async (req: Request, res: Response) => {
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
};

/**
 * PUT /automation/nodes/:id
 * تحديث عقدة (بيانات أو موقع)
 */
export const updateNode = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    return res.status(400).json({ success: false, message: 'معرّف العقدة غير صالح' });
  }

  const node = await WorkflowGraphService.updateNode(id, req.body);
  if (!node) {
    return res.status(404).json({ success: false, message: 'العقدة غير موجودة' });
  }
  res.json({ success: true, data: node });
};

/**
 * DELETE /automation/nodes/:id
 * حذف عقدة (مع الروابط المرتبطة — CASCADE)
 */
export const deleteNode = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = await WorkflowGraphService.deleteNode(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'العقدة غير موجودة' });
  }
  res.json({ success: true, message: 'تم حذف العقدة بنجاح' });
};

/**
 * PUT /automation/nodes/positions
 * حفظ مواقع العقد بعد السحب (Batch)
 */
export const updateNodePositions = async (req: Request, res: Response) => {
  const { positions } = req.body;
  if (!Array.isArray(positions)) {
    return res.status(400).json({ success: false, message: 'يجب إرسال مصفوفة positions' });
  }

  await WorkflowGraphService.updateNodePositions(positions);
  res.json({ success: true, message: 'تم حفظ المواقع بنجاح' });
};

/**
 * POST /automation/edges
 * إنشاء رابط جديد بين عقدتين
 */
export const createEdge = async (req: Request, res: Response) => {
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
};

/**
 * DELETE /automation/edges/:id
 * حذف رابط
 */
export const deleteEdge = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const deleted = await WorkflowGraphService.deleteEdge(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'الرابط غير موجود' });
  }
  res.json({ success: true, message: 'تم حذف الرابط بنجاح' });
};

/**
 * GET /automation/physics
 * جلب إعدادات الفيزياء
 */
export const getPhysics = async (_req: Request, res: Response) => {
  const settings = await WorkflowGraphService.getPhysicsSettings();
  res.json({ success: true, data: settings });
};

/**
 * PUT /automation/physics
 * تحديث إعدادات الفيزياء
 */
export const updatePhysics = async (req: Request, res: Response) => {
  const settings = await WorkflowGraphService.updatePhysicsSettings(req.body);
  res.json({ success: true, data: settings });
};

/**
 * GET /automation/telegram-logs
 * سجل محادثات تليجرام
 */
export const getTelegramLogs = async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const result = await WorkflowGraphService.getTelegramLogs(limit, offset);
  res.json({ success: true, data: result });
};

/**
 * POST /automation/telegram/toggle
 * تشغيل/إيقاف بوت تليجرام
 */
export const toggleTelegramBot = async (req: Request, res: Response) => {
  const { enabled } = req.body;

  if (enabled) {
    await TelegramBotService.startListening();
    res.json({ success: true, message: 'تم تشغيل بوت تليجرام بنجاح', data: { active: true } });
  } else {
    TelegramBotService.stopListening();
    res.json({ success: true, message: 'تم إيقاف بوت تليجرام', data: { active: false } });
  }
};

/**
 * GET /automation/telegram/status
 * حالة البوت التفاعلي
 */
export const getTelegramBotStatus = async (_req: Request, res: Response) => {
  const creds = await TelegramBotService.getBotCredentials();
  res.json({
    success: true,
    data: {
      isPolling: TelegramBotService.isCurrentlyPolling(),
      hasToken: Boolean(creds.token),
      hasDefaultChatId: Boolean(creds.defaultChatId),
    },
  });
};

/**
 * POST /automation/telegram/test-send
 * إرسال رسالة تجريبية لتليجرام
 */
export const sendTelegramTestMessage = async (req: Request, res: Response) => {
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
};

/**
 * POST /automation/graph/reset-defaults
 * إعادة ضبط العقد والروابط الافتراضية
 */
export const resetGraphDefaults = async (_req: Request, res: Response) => {
  const data = await WorkflowGraphService.resetToDefaults();
  res.json({ success: true, message: 'تمت إعادة ضبط شبكة الأتمتة بنجاح', data });
};

/**
 * POST /automation/ai/test
 * اختبار سؤال للذكاء الاصطناعي (Gemini)
 */
export const testAiPrompt = async (req: Request, res: Response) => {
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
};

/**
 * GET /automation/tasks
 * جلب قائمة مهام الأتمتة المسجلة وحالتها
 */
export const getAutomationsList = async (_req: Request, res: Response) => {
  const list = await WorkflowGraphService.getAutomations();
  res.json({ success: true, data: list });
};

/**
 * POST /automation/tasks/:key/toggle
 * تفعيل / تعطيل أتمتة
 */
export const toggleAutomationTask = async (req: Request, res: Response) => {
  const key = String(req.params.key);
  const { is_enabled } = req.body;
  const updated = await WorkflowGraphService.toggleAutomation(key, Boolean(is_enabled));
  if (!updated) {
    return res.status(404).json({ success: false, message: 'مهمة الأتمتة غير موجودة' });
  }
  res.json({ success: true, message: 'تم تحديث حالة الأتمتة بنجاح', data: updated });
};

/**
 * POST /automation/tasks/:key/run
 * تشغيل فوري لمهمة أتمتة
 */
export const runAutomationTaskNow = async (req: Request, res: Response) => {
  const key = String(req.params.key);
  const result = await WorkflowGraphService.runAutomationNow(key);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }
  res.json(result);
};
