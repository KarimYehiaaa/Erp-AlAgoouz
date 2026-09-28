import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface CartItem {
  id: string;
  product_id: number;
  name_ar: string;
  unit: string;
  unit_price: number;
  quantity: number;
  sale_price: number;
  custom_notes?: string;
}

export interface SplitPaymentRow {
  payment_method: string;
  amount: number;
}

export const usePosCartStore = defineStore('posCart', () => {
  const items = ref<CartItem[]>([]);
  const discountAmount = ref<number>(0);
  const loyaltyPointsRedeemed = ref<number>(0);
  const paymentMethod = ref<string>('cash');
  const payments = ref<SplitPaymentRow[] | null>(null);
  const customerId = ref<number | null>(null);
  const selectedCustomer = ref<any | null>(null);
  const orderType = ref<'takeaway' | 'dinein' | 'delivery'>('takeaway');
  const notes = ref<string>('');

  const subtotal = computed(() => {
    const sum = items.value.reduce(
      (s, item) => s + (item.unit_price || 0) * (item.quantity || 0),
      0,
    );
    return Math.round(sum * 100) / 100;
  });

  const loyaltyDiscount = computed(() => {
    return Math.round(((Number(loyaltyPointsRedeemed.value) || 0) / 10) * 100) / 100;
  });

  const effectiveDiscount = computed(() => {
    const manualDiscount = Math.max(0, Number(discountAmount.value) || 0);
    const totalDisc = manualDiscount + loyaltyDiscount.value;
    return Math.min(totalDisc, subtotal.value);
  });

  const total = computed(() => {
    const t = subtotal.value - effectiveDiscount.value;
    return t > 0 ? Math.round(t * 100) / 100 : 0;
  });

  const itemsCount = computed(() => {
    return items.value.reduce((sum, item) => sum + (item.quantity || 0), 0);
  });

  const addItem = (product: any, customQty = 1, customNotes?: string) => {
    const existing = items.value.find(
      (i) => i.product_id === product.id && i.custom_notes === (customNotes || undefined),
    );

    if (existing) {
      existing.quantity = Math.round((existing.quantity + customQty) * 1000) / 1000;
    } else {
      items.value.push({
        id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        product_id: product.id,
        name_ar: product.name_ar,
        unit: product.unit || 'قطعة',
        unit_price: Number(product.sale_price || 0),
        sale_price: Number(product.sale_price || 0),
        quantity: Math.round(customQty * 1000) / 1000,
        custom_notes: customNotes,
      });
    }
  };

  const updateQty = (index: number, qty: number) => {
    if (qty <= 0) {
      items.value.splice(index, 1);
    } else if (items.value[index]) {
      items.value[index].quantity = Math.round(qty * 1000) / 1000;
    }
  };

  const removeItem = (index: number) => {
    items.value.splice(index, 1);
  };

  const clearCart = () => {
    items.value = [];
    discountAmount.value = 0;
    loyaltyPointsRedeemed.value = 0;
    paymentMethod.value = 'cash';
    payments.value = null;
    customerId.value = null;
    selectedCustomer.value = null;
    notes.value = '';
    orderType.value = 'takeaway';
  };

  const getItemQty = (productId: number) => {
    return items.value
      .filter((i) => i.product_id === productId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  const isProductInCart = (productId: number) => {
    return items.value.some((i) => i.product_id === productId);
  };

  return {
    items,
    discountAmount,
    loyaltyPointsRedeemed,
    loyaltyDiscount,
    effectiveDiscount,
    paymentMethod,
    payments,
    customerId,
    selectedCustomer,
    orderType,
    notes,
    subtotal,
    total,
    itemsCount,
    addItem,
    updateQty,
    removeItem,
    clearCart,
    getItemQty,
    isProductInCart,
  };
});
