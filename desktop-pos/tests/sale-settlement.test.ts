import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePosCartStore } from '../src/stores/posCart';
import { resolveSaleSettlement } from '../../shared/saleSettlement';

describe('POS actual collections and credit settlement', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('keeps a fully credit cart unpaid', () => {
    const cart = usePosCartStore();
    cart.addItem({ id: 1, name_ar: 'بن', sale_price: 100, unit: 'قطعة' }, 1);
    cart.paymentMethod = 'credit';
    expect(
      resolveSaleSettlement({ total_amount: cart.total, payment_method: cart.paymentMethod }),
    ).toEqual({ paid_amount: 0, outstanding_amount: 100, payment_status: 'unpaid', payments: [] });
  });

  it('sends only cash receipts for a mixed cash and credit cart', () => {
    const cart = usePosCartStore();
    cart.addItem({ id: 1, name_ar: 'بن', sale_price: 100, unit: 'قطعة' }, 1);
    cart.paymentMethod = 'split';
    cart.payments = [
      { payment_method: 'cash', amount: 40 },
      { payment_method: 'credit', amount: 60 },
    ];
    const settlement = resolveSaleSettlement({
      total_amount: cart.total,
      payment_method: cart.paymentMethod,
      payments: cart.payments,
    });
    expect(settlement).toEqual({
      paid_amount: 40,
      outstanding_amount: 60,
      payment_status: 'partial',
      payments: [{ payment_method: 'cash', amount: 40 }],
    });
    // Reprocessing the payload on the server retains the same debt.
    expect(
      resolveSaleSettlement({ total_amount: 100, payment_method: 'split', ...settlement }),
    ).toEqual(settlement);
  });

  it('settles fractional currency without a floating-point remainder', () => {
    expect(
      resolveSaleSettlement({ total_amount: 0.3, payments: [{ amount: 0.1 }, { amount: 0.2 }] })
        .outstanding_amount,
    ).toBe(0);
  });

  it.each([
    { total_amount: 100, payments: [{ amount: 101 }] },
    { total_amount: 100, payments: [{ amount: NaN }] },
    { total_amount: 100, payments: [{ amount: -1 }] },
    { total_amount: 100, payment_method: 'split' },
    { total_amount: 100, payment_method: 'credit', paid_amount: 10 },
  ])('rejects an invalid collection before queuing a sale: %j', (input) => {
    expect(() => resolveSaleSettlement(input)).toThrow(RangeError);
  });
});
