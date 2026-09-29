import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardMetrics from '../DashboardMetrics.vue';

// Mock pinia stores
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    hasPermission: () => true,
  }),
}));

const mockStats = {
  month: {
    sales: 150000,
    salesCount: 320,
    netProfit: 45000,
    collectionRate: 92,
    cost: 85000,
    expenses: 20000,
    expensesCount: 45,
    avgDailySales: 5000,
  },
  comparison: {
    sales: 14.5,
    netProfit: 8.2,
    expenses: -3.4,
  },
  salesTrend: [
    { sales: 10000, profit: 3000 },
    { sales: 15000, profit: 4500 },
  ],
  expenseTrend: [{ expenses: 2000 }, { expenses: 1800 }],
  realIncomeMonth: 65000,
  cashDetails: {
    estimateNote: 'تقدير نقدي',
    oldDebtCollections: 5000,
  },
  inventoryStats: {
    inventory_value: 340000,
    products: 120,
  },
  stockAlerts: 4,
  unpaidInvoices: {
    amount: 18500,
    count: 6,
  },
  monthCards: {
    purchases: 90000,
    purchasesCount: 15,
  },
};

describe('DashboardMetrics.vue (Executive KPI Bento Grid)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const createWrapper = () => {
    return mount(DashboardMetrics, {
      props: { stats: mockStats },
      global: {
        stubs: {
          RouterLink: {
            template: '<a :class="$attrs.class"><slot /></a>',
          },
          AppIcon: true,
          AnimatedNumber: {
            props: ['value', 'format'],
            template: '<span>{{ format ? format(value) : value }}</span>',
          },
          Sparkline: true,
        },
        directives: {
          spotlight: {},
        },
      },
    });
  };

  it('renders the executive bento hub with 6 core cards by default', () => {
    const wrapper = createWrapper();
    expect(wrapper.exists()).toBe(true);

    const cards = wrapper.findAll('.bento-kpi-card');
    // Default core view should show 6 cards
    expect(cards.length).toBe(6);

    // Verify presence of the 3 Hero cards
    const heroCards = wrapper.findAll('.hero-card');
    expect(heroCards.length).toBe(3);

    // Verify presence of the 3 Secondary cards
    const secondaryCards = wrapper.findAll('.secondary-card');
    expect(secondaryCards.length).toBe(3);
  });

  it('embeds margin percentage badge inside the Net Profit hero card', () => {
    const wrapper = createWrapper();
    const marginBadge = wrapper.find('.kpi-margin-badge');
    expect(marginBadge.exists()).toBe(true);
    expect(marginBadge.text()).toContain('30.0%');
  });

  it('displays real dynamic deltas from stats.comparison', () => {
    const wrapper = createWrapper();
    const deltaPills = wrapper.findAll('.trend-delta-pill');
    expect(deltaPills.length).toBeGreaterThan(0);

    const text = wrapper.text();
    // Sales delta +14.5%
    expect(text).toContain('+14.5%');
    // Net profit delta +8.2%
    expect(text).toContain('+8.2%');
    // Expenses delta -3.4%
    expect(text).toContain('-3.4%');
  });

  it('displays cash status safety pill for available liquidity', () => {
    const wrapper = createWrapper();
    const statusBadge = wrapper.find('.kpi-status-badge');
    expect(statusBadge.exists()).toBe(true);
    expect(statusBadge.classes()).toContain('safe');
    expect(statusBadge.text()).toContain('سيولة آمنة');
  });

  it('displays low stock alerts and debtors count badges', () => {
    const wrapper = createWrapper();
    const warningChip = wrapper.find('.kpi-warning-chip');
    expect(warningChip.exists()).toBe(true);
    expect(warningChip.text()).toContain('4 حرج');

    const dangerChip = wrapper.find('.kpi-danger-chip');
    expect(dangerChip.exists()).toBe(true);
    expect(dangerChip.text()).toContain('6 عميل');
  });

  it('switches between core (6) and detailed (8) density modes', async () => {
    const wrapper = createWrapper();
    expect(wrapper.findAll('.bento-kpi-card').length).toBe(6);

    const detailedBtn = wrapper.findAll('.density-btn')[1];
    await detailedBtn.trigger('click');

    // In detailed view, 8 cards should be displayed (including Purchases & COGS)
    expect(wrapper.findAll('.bento-kpi-card').length).toBe(8);
    expect(wrapper.text()).toContain('المشتريات والتوريدات');
    expect(wrapper.text()).toContain('تكلفة البضاعة المباعة');
  });

  it('does NOT render removed redundant cards (purchases_sales_ratio, total_assets, active_customers)', () => {
    const wrapper = createWrapper();
    const text = wrapper.text();
    expect(text).not.toContain('نسبة الشراء للبيع');
    expect(text).not.toContain('إجمالي أصول المنشأة');
    expect(text).not.toContain('العملاء النشطون');
  });
});
