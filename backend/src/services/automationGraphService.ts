/**
 * services/automationGraphService.ts — بناء خريطة شبكة الأتمتة الحية
 * ═════════════════════════════════════════════════════════════════
 * يدمج السجل المركزي (config/automationGraph.ts) مع الحالة الفعلية:
 *   - حالة تفعيل كل وكيل وآخر تشغيل له من جدول automations.
 *   - حالة بوت تليجرام (مهيأ/يستمع) بدون كشف أي أسرار.
 *   - المهام المجدولة الفعالة من SchedulerService.
 * الناتج هو العقود الوحيدة التي ترسمها اللوحة ثلاثية الأبعاد في الواجهة.
 */

import {
  AUTOMATION_GRAPH_LINKS,
  AUTOMATION_GRAPH_NODES,
  TELEGRAM_TRIGGER_NODE_ID,
  type GraphNodeDef,
} from '../config/automationGraph.ts';
import AutomationService, { type AutomationRecord } from './automationService.ts';
import TelegramBotService from './telegramBotService.ts';
import SchedulerService from './schedulerService.ts';
import logger from './loggerService.ts';

export interface LiveGraphNode extends GraphNodeDef {
  /** الحالة الفعلية من قاعدة البيانات (لوكلاء فقط — null للبنية التحتية غير المرتبطة) */
  live: {
    dbId: number | null;
    is_enabled: boolean;
    trigger_type: 'cron' | 'event' | null;
    cron_expression: string | null;
    last_run_at: string | null;
    last_status: string | null;
  } | null;
}

export interface AutomationGraphPayload {
  nodes: LiveGraphNode[];
  links: typeof AUTOMATION_GRAPH_LINKS;
  telegram: {
    nodeId: string;
    configured: boolean;
    listening: boolean;
    commandsCount: number;
    lastActivityAt: string | null;
  };
  scheduler: {
    activeCronTasks: string[];
  };
  stats: {
    totalNodes: number;
    totalLinks: number;
    enabledAgents: number;
    totalAgents: number;
  };
}

export class AutomationGraphService {
  /**
   * بناء الخريطة الحية الكاملة لشبكة الأتمتة
   */
  static async buildLiveGraph(): Promise<AutomationGraphPayload> {
    let rows: AutomationRecord[] = [];
    try {
      rows = await AutomationService.listAutomations();
    } catch (err: any) {
      // قاعدة البيانات غير متاحة؟ نرسم الهيكل الثابت على أي حال بدل انهيار الشاشة
      logger.warn(`[AutomationGraph] تعذر جلب حالة الأتمتة الحية: ${err.message}`);
    }

    const byKey = new Map(rows.map((r) => [r.key, r]));

    const nodes: LiveGraphNode[] = AUTOMATION_GRAPH_NODES.map((def) => {
      if (!def.automationKey) {
        return { ...def, live: null };
      }
      const row = byKey.get(def.automationKey);
      return {
        ...def,
        live: row
          ? {
              dbId: row.id,
              is_enabled: Boolean(row.is_enabled),
              trigger_type: row.trigger_type ?? null,
              cron_expression: row.cron_expression ?? null,
              last_run_at: row.last_run_at ?? null,
              last_status: row.last_status ?? null,
            }
          : null,
      };
    });

    const creds = await this.safeTelegramCredentials();
    const botStatus = TelegramBotService.getStatus();

    const agentNodes = nodes.filter((n) => n.kind === 'agent');
    const payload: AutomationGraphPayload = {
      nodes,
      links: AUTOMATION_GRAPH_LINKS,
      telegram: {
        nodeId: TELEGRAM_TRIGGER_NODE_ID,
        configured: Boolean(creds.token && creds.defaultChatId),
        listening: botStatus.listening,
        commandsCount: botStatus.commandsCount,
        lastActivityAt: botStatus.lastActivityAt,
      },
      scheduler: {
        activeCronTasks: SchedulerService.getActiveTasksList(),
      },
      stats: {
        totalNodes: nodes.length,
        totalLinks: AUTOMATION_GRAPH_LINKS.length,
        enabledAgents: agentNodes.filter((n) => n.live?.is_enabled).length,
        totalAgents: agentNodes.length,
      },
    };

    return payload;
  }

  private static async safeTelegramCredentials() {
    try {
      return await TelegramBotService.getBotCredentials();
    } catch {
      return { token: '', defaultChatId: '' };
    }
  }
}

export default AutomationGraphService;
