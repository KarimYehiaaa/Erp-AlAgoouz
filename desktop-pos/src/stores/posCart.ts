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

export const usePosCartStore = defineStore('posCart', () => {
  const items = ref<CartItem[]>([]);
  const discountAmount = ref<number>(0);
  const paymentMethod = ref<'cash' | 'card' | 'instapay' | 'credit'>('cash');
  const customerId = ref<number | null>(null);

  const subtotal = computed(() => {
    return items.value.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  });

  const total = computed(() => {
    const t = subtotal.value - discountAmount.value;
    return t > 0 ? Math.round(t * 100) / 100 : 0;
  });

  const itemsCount = computed(() => {
    return items.value.reduce((sum, item) => sum + item.quantity, 0);
  });

  const addItem = (product: any, customQty = 1, customNotes?: string) => {
    const existing = items.value.find(
      (i) => i.product_id === product.id && i.custom_notes === (customNotes || undefined)
    );

    if (existing) {
      existing.quantity += customQty;
    } else {
      items.value.push({
        id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        product_id: product.id,
        name_ar: product.name_ar,
        unit: product.unit || 'قطعة',
        unit_price: Number(product.sale_price || 0),
        sale_price: Number(product.sale_price || 0),
        quantity: customQty,
        custom_notes: customNotes,
      });
    }
  };

  const updateQty = (index: number, qty: number) => {
    if (qty <= 0) {
      items.value.splice(index, 1);
    } else {
      items.value[index].quantity = qty;
    }
  };

  const removeItem = (index: number) => {
    items.value.splice(index, 1);
  };

  const clearCart = () => {
    items.value = [];
    discountAmount.value = 0;
    customerId.value = null;
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
    paymentMethod,
    customerId,
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
