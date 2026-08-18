/**
 * اختبار واجهة تسجيل الدفعات على رصيد العميل (CustomersView.vue):
 *   1. زر "سداد كامل المستحق" يملأ المبلغ الصحيح = المستحق القابل للدفع فقط
 *      (بدون رصيد بداية المدة) كما يعرضه حقل payable_total من كشف الحساب.
 *   2. بعد تسجيل الدفعة تظهر لوحة توزيعها على الفواتير (رقم الفاتورة +
 *      المبلغ + الحالة) وتبقى ظاهرة حتى بعد صفر المستحق واختفاء النموذج.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CustomersView from '../CustomersView.vue';

// ─── Mock واجهة الـ API (الواجهة تستورد `customers` فقط) ─────────────────────
const apiMock = vi.hoisted(() => ({
  customers: {
    list: vi.fn(),
    statement: vi.fn(),
    recordPayment: vi.fn(),
  },
}));
vi.mock('@/api', () => apiMock);

const CUSTOMER = {
  id: 1,
  code: 'C-1',
  name_ar: 'عميل اختبار',
  customer_type: 'wholesale',
  total_balance: 500,
  balance: 500,
  total_purchased: 800,
  total_paid: 300,
  credit_limit: 0,
};

// كشف حساب: 3 فواتير (100 + 120 + 80 = 300) + رصيد بداية مدة 500
// → total_balance = 500 لكن payable_total = 300
const STATEMENT_OPEN = {
  customer: { id: 1, code: 'C-1', name_ar: 'عميل اختبار' },
  summary: {
    total_purchased: 800,
    total_paid: 300,
    total_balance: 500,
    payable_total: 300,
  },
  transactions: [
    {
      entry_type: 'sale',
      id: 10,
      sale_number: 'SL-1',
      entry_number: 'SL-1',
      entry_date: '2026-08-01',
      total_amount: 100,
      paid_amount: 0,
      payment_status: 'unpaid',
      status: 'completed',
    },
    {
      entry_type: 'sale',
      id: 11,
      sale_number: 'SL-2',
      entry_number: 'SL-2',
      entry_date: '2026-08-02',
      total_amount: 120,
      paid_amount: 0,
      payment_status: 'unpaid',
      status: 'completed',
    },
    {
      entry_type: 'invoice',
      id: 12,
      invoice_number: 'INV-3',
      entry_number: 'INV-3',
      entry_date: '2026-08-03',
      total_amount: 80,
      paid_amount: 0,
      payment_status: 'unpaid',
      status: 'completed',
    },
    {
      entry_type: 'opening_balance',
      id: 'opening',
      entry_number: 'رصيد افتتاحي',
      entry_date: '2026-01-01',
      total_amount: 500,
      paid_amount: 0,
      payment_status: 'unpaid',
      status: 'completed',
    },
  ],
};

// بعد السداد الكامل: كل الفواتير مدفوعة → payable_total = 0
const STATEMENT_SETTLED = {
  ...STATEMENT_OPEN,
  summary: { total_purchased: 800, total_paid: 800, total_balance: 500, payable_total: 0 },
  transactions: STATEMENT_OPEN.transactions.map((t: any) =>
    t.entry_type === 'opening_balance'
      ? t
      : { ...t, paid_amount: t.total_amount, payment_status: 'paid' },
  ),
};

// استجابة الخادم لتسجيل الدفعة: توزيع FIFO على الفواتير الثلاث
const PAYMENT_RESPONSE = {
  data: {
    success: true,
    amount: 300,
    customer_name: 'عميل اختبار',
    allocations: [
      { type: 'sale', id: 10, number: 'SL-1', amount: 100, new_status: 'paid' },
      { type: 'sale', id: 11, number: 'SL-2', amount: 120, new_status: 'paid' },
      { type: 'invoice', id: 12, number: 'INV-3', amount: 80, new_status: 'paid' },
    ],
  },
};

const mountView = () =>
  mount(CustomersView, {
    global: {
      stubs: { AppIcon: true },
      directives: { permission: () => {} },
    },
  });

describe('CustomersView.vue — تسجيل دفعة على رصيد عميل', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.customers.list.mockResolvedValue({ data: [CUSTOMER] });
    apiMock.customers.statement.mockResolvedValue({ data: STATEMENT_OPEN });
    apiMock.customers.recordPayment.mockResolvedValue(PAYMENT_RESPONSE);
  });

  it('زر "سداد كامل المستحق" يملأ المستحق القابل للدفع فقط (بدون رصيد بداية المدة)', async () => {
    const wrapper = mountView();
    await flushPromises();

    // فتح كشف الحساب
    await wrapper.find('button[title="الحساب الجاري"]').trigger('click');
    await flushPromises();

    // نموذج الدفع ظاهر لأن المستحق القابل للدفع 300 > 0
    const form = wrapper.find('.payment-form');
    expect(form.exists()).toBe(true);

    // الحقل الأقصى = payable_total (300) وليس total_balance (500)
    const input = wrapper.find('input[type="number"]');
    expect((input.element as HTMLInputElement).max).toBe('300');

    // الضغط على "سداد كامل المستحق" → يملأ 300
    await wrapper.find('.payment-actions .btn-outline').trigger('click');
    expect((input.element as HTMLInputElement).value).toBe('300');
  });

  it('بعد تسجيل الدفعة يعرض التوزيع على الفواتير ويبقى ظاهرًا بعد صفر المستحق', async () => {
    // أول استدعاء لكشف الحساب يعيد الحالة المفتوحة، ثم يعيد الحالة المسددة
    apiMock.customers.statement
      .mockReset()
      .mockResolvedValueOnce({ data: STATEMENT_OPEN })
      .mockResolvedValue({ data: STATEMENT_SETTLED });

    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('button[title="الحساب الجاري"]').trigger('click');
    await flushPromises();

    // نلتقط المبلغ لحظة الإرسال (الـ form يُصفَّر بعد النجاح فيتغيّر محتواه)
    let sentAmount: number | null = null;
    apiMock.customers.recordPayment.mockImplementation((_id: any, data: any) => {
      sentAmount = data.amount;
      return Promise.resolve(PAYMENT_RESPONSE);
    });

    // ملء المبلغ بالكامل وتسجيل الدفعة
    await wrapper.find('input[type="number"]').setValue(300);
    await wrapper.find('.btn-save').trigger('click');
    await flushPromises();

    // أُرسل للخادم المبلغ الصحيح (300) — بدون رصيد بداية المدة
    expect(apiMock.customers.recordPayment).toHaveBeenCalledTimes(1);
    expect(apiMock.customers.recordPayment).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ payment_method: 'cash' }),
    );
    expect(sentAmount).toBe(300);

    // المستحق صفر الآن → نموذج الدفع اختفى...
    expect(wrapper.find('.payment-form').exists()).toBe(false);

    // ...لكن لوحة النتيجة والتوزيع ما زالت ظاهرة
    const result = wrapper.find('.pay-result');
    expect(result.exists()).toBe(true);
    expect(result.text()).toContain('تم تسجيل دفعة');
    expect(result.text()).toContain('300.00');

    // التوزيع: 3 فواتير بأرقامها ومبالغها وحالتها
    const items = wrapper.findAll('.alloc-item');
    expect(items.length).toBe(3);

    const [first, second, third] = items.map((li) => li.text());
    expect(first).toContain('SL-1');
    expect(first).toContain('100.00');
    expect(second).toContain('SL-2');
    expect(second).toContain('120.00');
    expect(third).toContain('INV-3');
    expect(third).toContain('80.00');

    // كل الفواتير مدفوعة
    for (const li of items) expect(li.text()).toContain('مدفوع');

    // زر الإغلاق يخفي اللوحة
    await wrapper.find('.pay-result .btn-outline').trigger('click');
    expect(wrapper.find('.pay-result').exists()).toBe(false);
  });
});
