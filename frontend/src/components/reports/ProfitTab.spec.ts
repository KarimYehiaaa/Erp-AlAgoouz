import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProfitTab from './ProfitTab.vue';
import { formatMoney } from '@/utils/currency';

describe('historical category profit presentation', () => {
  it.each([
    [null, 'تكلفة تاريخية غير مسجلة', false],
    [0, formatMoney(0), true],
  ])(
    'presents category profit %s without confusing missing costs with zero',
    (profit, text, known) => {
      const view = mount(ProfitTab, {
        props: {
          profit: {
            daily: [],
            byCategory: [
              {
                category_name: 'Test category',
                products_count: 1,
                total_revenue: 60,
                net_profit: profit,
              },
            ],
          },
          totalRevenue: 60,
          totalCost: 20,
          totalNet: 40,
        },
      });
      try {
        const row = view
          .findAll('tbody tr')
          .find((entry) => entry.text().includes('Test category'));
        expect(row).toBeDefined();
        const cell = row!.findAll('td')[3];
        if (!cell) throw new Error('Category row is missing its profit cell');
        expect(cell.text()).toBe(text);
        expect(cell.classes().includes('profit-pos')).toBe(known);
        expect(cell.classes()).not.toContain('profit-neg');
      } finally {
        view.unmount();
      }
    },
  );
});
