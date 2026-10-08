import { beforeEach, describe, expect, it, vi } from 'vitest';

// محاكاة قاعدة البيانات وخدمة تشغيل الأتمتة والمسجّل
const { query, runAutomationNow, loggerError } = vi.hoisted(() => ({
  query: vi.fn(),
  runAutomationNow: vi.fn(),
  loggerError: vi.fn(),
}));
vi.mock('../src/database/pool.ts', () => ({ query }));
vi.mock('../src/services/workflowGraphService.ts', () => ({
  default: { runAutomationNow },
  WorkflowGraphService: { runAutomationNow },
}));
vi.mock('../src/services/loggerService.ts', () => ({
  default: { error: loggerError, warn: vi.fn(), info: vi.fn() },
}));

import {
  emitAutomationEvent,
  emitAutomationEventAsync,
} from '../src/services/automationEventBus.ts';

let taskRow: any = null;
let claimed = true;
let runError: Error | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  claimed = true;
  runError = null;
  taskRow = {
    id: 7,
    key: 'void_invoice_alert',
    config: null,
  };
  runAutomationNow.mockResolvedValue({ success: true, message: 'ok' });
  query.mockImplementation(async (sql: string, params?: any[]) => {
    if (sql.includes('FROM automations') && sql.includes('SELECT')) {
      // مطابقة مهمة الحدث المفعّلة
      const key = params?.[0];
      if (!taskRow || taskRow.key !== key) return { rows: [] };
      return { rows: [{ id: taskRow.id, key: taskRow.key, config: taskRow.config }] };
    }
    if (sql.includes('UPDATE automations') && sql.includes('RETURNING id')) {
      return { rows: claimed ? [{ id: taskRow.id }] : [] };
    }
    return { rows: [] };
  });
  runAutomationNow.mockImplementation(async () => {
    if (runError) throw runError;
    return { success: true, message: 'ok' };
  });
});

describe('automationEventBus', () => {
  it('يشغّل المهمة المفعّلة المطابقة للحدث بمصدر triggerSource=event', async () => {
    await emitAutomationEventAsync('void_invoice_alert', {
      sale_number: 'SL-100',
      total_amount: 250,
      cashier_user_id: 3,
    });
    expect(runAutomationNow).toHaveBeenCalledTimes(1);
    expect(runAutomationNow).toHaveBeenCalledWith('void_invoice_alert', {
      triggerSource: 'event',
    });
  });

  it('يتجاهل المهام المعطلة (is_enabled = FALSE)', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM automations') && sql.includes('SELECT')) return { rows: [] };
      return { rows: [] };
    });
    await emitAutomationEventAsync('void_invoice_alert', { sale_number: 'SL-100' });
    expect(runAutomationNow).not.toHaveBeenCalled();
  });

  it('يتجاهل المهام ذات نوع مشغّل غير event', async () => {
    // المحاكاة أعلاه ترجع الصفوف فقط للاستعلام الذي يشترط trigger_type='event' —
    // وهنا نحاكي استعلامًا لا يشترطه لنتأكد أن الناقل يفرض الشرط بنفسه
    query.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM automations') && sql.includes('SELECT')) {
        if (!sql.includes("trigger_type = 'event'")) {
          return { rows: [{ id: 7, key: params?.[0], config: null }] };
        }
        return { rows: [] };
      }
      if (sql.includes('UPDATE automations') && sql.includes('RETURNING id')) {
        return { rows: [{ id: 7 }] };
      }
      return { rows: [] };
    });
    await emitAutomationEventAsync('void_invoice_alert', { sale_number: 'SL-100' });
    expect(runAutomationNow).not.toHaveBeenCalled();
  });

  it('يخنق الإطلاق المتكرر لنفس المهمة قبل انقضاء نافذة الخنق', async () => {
    claimed = false; // last_run_at ما زال داخل الـ 5 دقائق
    await emitAutomationEventAsync('void_invoice_alert', { sale_number: 'SL-101' });
    expect(runAutomationNow).not.toHaveBeenCalled();
    // ثم ينجح الإطلاق بعد انقضاء النافذة
    claimed = true;
    await emitAutomationEventAsync('void_invoice_alert', { sale_number: 'SL-102' });
    expect(runAutomationNow).toHaveBeenCalledTimes(1);
  });

  it('لا يرمي عند فشل تنفيذ المهمة — الفشل يُسجل فقط', async () => {
    runError = new Error('boom');
    expect(() =>
      emitAutomationEvent('void_invoice_alert', { sale_number: 'SL-100' }),
    ).not.toThrow();
    await emitAutomationEventAsync('void_invoice_alert', { sale_number: 'SL-100' }).catch(() => {});
    // المسار غير الحاجب يبتلع الخطأ عبر logger ولا يسمح بالانفجار
    const dispatch = emitAutomationEventAsync('void_invoice_alert', {});
    await expect(dispatch).rejects.toThrow('boom');
    expect(loggerError).toHaveBeenCalled();
  });

  it('لا يشغّل تنبيه الخصم الكبير تحت الحد الافتراضي 15% ويشغّله عند تجاوزه', async () => {
    taskRow = { id: 8, key: 'large_discount_alert', config: null };
    await emitAutomationEventAsync('large_discount_alert', {
      sale_number: 'SL-200',
      subtotal: 100,
      discount_amount: 14,
    });
    expect(runAutomationNow).not.toHaveBeenCalled();

    await emitAutomationEventAsync('large_discount_alert', {
      sale_number: 'SL-201',
      subtotal: 100,
      discount_amount: 15,
    });
    expect(runAutomationNow).toHaveBeenCalledWith('large_discount_alert', {
      triggerSource: 'event',
    });
  });

  it('يقرأ حد الخصم من config المهمة max_discount_pct عند توفره', async () => {
    taskRow = { id: 8, key: 'large_discount_alert', config: { max_discount_pct: 20 } };
    await emitAutomationEventAsync('large_discount_alert', {
      sale_number: 'SL-202',
      subtotal: 100,
      discount_amount: 18,
    });
    // 18% دون حد 20% المخصص → لا تشغيل
    expect(runAutomationNow).not.toHaveBeenCalled();

    await emitAutomationEventAsync('large_discount_alert', {
      sale_number: 'SL-203',
      subtotal: 100,
      discount_amount: 20,
    });
    expect(runAutomationNow).toHaveBeenCalledWith('large_discount_alert', {
      triggerSource: 'event',
    });
  });

  it('لا يشغّل مطابقة العهدة عند فرق أقل من 10 ج.م ويشغّلها عند 10 فأكثر', async () => {
    taskRow = { id: 9, key: 'shift_handover_reconciliation', config: null };
    await emitAutomationEventAsync('shift_handover_reconciliation', {
      shift_id: 12,
      cash_difference: 9.99,
    });
    expect(runAutomationNow).not.toHaveBeenCalled();

    await emitAutomationEventAsync('shift_handover_reconciliation', {
      shift_id: 12,
      cash_difference: -10,
    });
    expect(runAutomationNow).toHaveBeenCalledWith('shift_handover_reconciliation', {
      triggerSource: 'event',
    });
  });

  it('emitAutomationEvent غير الحاجبة لا ترفع استثناءً مهما فشل التنفيذ', async () => {
    taskRow = { id: 10, key: 'error_tracker_alert', config: null };
    runError = new Error('handler crashed');
    expect(() =>
      emitAutomationEvent('error_tracker_alert', { message: 'unhandled', path: '/sales' }),
    ).not.toThrow();
    // انتظار اكتمال مسار fire-and-forget قبل انتهاء الاختبار
    await vi.waitFor(() => expect(loggerError).toHaveBeenCalled());
  });
});
