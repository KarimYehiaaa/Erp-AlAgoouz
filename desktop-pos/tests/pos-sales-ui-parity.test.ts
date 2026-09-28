import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePosCartStore } from '../src/stores/posCart';

describe('Desktop POS Web Parity & Sales Workflows', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('PosCart Store Parity', () => {
    it('initializes with empty cart and default cash payment', () => {
      const store = usePosCartStore();
      expect(store.items).toEqual([]);
      expect(store.subtotal).toBe(0);
      expect(store.total).toBe(0);
      expect(store.paymentMethod).toBe('cash');
      expect(store.orderType).toBe('takeaway');
    });

    it('adds items with fractional weights (e.g. 1/8 kg, 1/4 kg coffee) accurately', () => {
      const store = usePosCartStore();
      const coffee = {
        id: 101,
        name_ar: 'بن برازيلي سادة',
        sale_price: 480,
        unit: 'كجم',
      };

      // Add 250g (0.25 kg)
      store.addItem(coffee, 0.25, 'فاتح - مطحون تركي');
      expect(store.items.length).toBe(1);
      expect(store.items[0].quantity).toBe(0.25);
      expect(store.items[0].unit_price).toBe(480);
      expect(store.subtotal).toBe(120);
      expect(store.total).toBe(120);

      // Add another 125g (0.125 kg) with same custom specs
      store.addItem(coffee, 0.125, 'فاتح - مطحون تركي');
      expect(store.items[0].quantity).toBe(0.375);
      expect(store.subtotal).toBe(180);
      expect(store.total).toBe(180);
    });

    it('calculates loyalty points redemption discount correctly (10 points = 1 EGP)', () => {
      const store = usePosCartStore();
      store.addItem({ id: 1, name_ar: 'منتج', sale_price: 200, unit: 'قطعة' }, 1);
      expect(store.subtotal).toBe(200);

      // Redeem 50 loyalty points -> 5 EGP discount
      store.loyaltyPointsRedeemed = 50;
      expect(store.loyaltyDiscount).toBe(5);
      expect(store.effectiveDiscount).toBe(5);
      expect(store.total).toBe(195);

      // Add manual discount of 15 EGP -> total discount 20 EGP
      store.discountAmount = 15;
      expect(store.effectiveDiscount).toBe(20);
      expect(store.total).toBe(180);
    });

    it('caps total discount at subtotal so total is never negative', () => {
      const store = usePosCartStore();
      store.addItem({ id: 1, name_ar: 'منتج', sale_price: 50, unit: 'قطعة' }, 1);
      store.discountAmount = 100;
      expect(store.effectiveDiscount).toBe(50);
      expect(store.total).toBe(0);
    });

    it('clears all cart items, discounts, and customer details on clearCart()', () => {
      const store = usePosCartStore();
      store.addItem({ id: 1, name_ar: 'منتج', sale_price: 100 }, 2);
      store.discountAmount = 20;
      store.loyaltyPointsRedeemed = 30;
      store.customerId = 5;
      store.selectedCustomer = { id: 5, name: 'عميل' };
      store.paymentMethod = 'card';

      store.clearCart();
      expect(store.items).toEqual([]);
      expect(store.discountAmount).toBe(0);
      expect(store.loyaltyPointsRedeemed).toBe(0);
      expect(store.customerId).toBeNull();
      expect(store.selectedCustomer).toBeNull();
      expect(store.paymentMethod).toBe('cash');
      expect(store.total).toBe(0);
    });
  });

  describe('Split Payment & Change Computation', () => {
    it('computes split payment remaining balance properly', () => {
      const cartTotal = 350;
      const splitRows = [
        { key: 'cash', amount: 200 },
        { key: 'card', amount: 100 },
        { key: 'transfer', amount: 0 },
        { key: 'credit', amount: 0 },
      ];

      const totalSplit = splitRows.reduce((sum, r) => sum + r.amount, 0);
      expect(totalSplit).toBe(300);
      const remaining = cartTotal - totalSplit;
      expect(remaining).toBe(50);

      // Fulfilling remaining amount via transfer
      splitRows[2].amount = 50;
      const newTotalSplit = splitRows.reduce((sum, r) => sum + r.amount, 0);
      expect(cartTotal - newTotalSplit).toBe(0);
    });

    it('computes cash change due properly', () => {
      const cartTotal = 165;
      const cashGiven = 200;
      const changeDue = cashGiven - cartTotal;
      expect(changeDue).toBe(35);
    });
  });

  describe('Held Orders Lifecycle', () => {
    it('supports saving and restoring held orders', () => {
      const store = usePosCartStore();
      store.addItem({ id: 10, name_ar: 'اسبريسو', sale_price: 35 }, 2);
      store.discountAmount = 5;

      const heldOrder = {
        id: Date.now(),
        items: JSON.parse(JSON.stringify(store.items)),
        total: store.total,
        discountAmount: store.discountAmount,
        paymentMethod: store.paymentMethod,
      };

      store.clearCart();
      expect(store.items.length).toBe(0);

      // Restore held order
      for (const itm of heldOrder.items) {
        store.addItem(itm, itm.quantity, itm.custom_notes);
      }
      store.discountAmount = heldOrder.discountAmount;

      expect(store.items.length).toBe(1);
      expect(store.items[0].name_ar).toBe('اسبريسو');
      expect(store.subtotal).toBe(70);
      expect(store.total).toBe(65);
    });
  });
});
