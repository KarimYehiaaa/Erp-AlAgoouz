import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useCartStore = defineStore('cart', () => {
  const items = ref([]);
  const customerId = ref(null);
  const saleType = ref('retail'); // 'retail', 'wholesale', 'delivery'
  const discountAmount = ref(0);
  const taxRate = ref(0); // e.g. 0.14 for 14% VAT if enabled

  // Computed properties
  const itemCount = computed(() =>
    items.value.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  );

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => {
      const price = Number(item.price || item.sale_price || 0);
      const qty = Number(item.quantity || 0);
      return sum + (price * qty);
    }, 0)
  );

  const totalDiscount = computed(() => Math.min(Number(discountAmount.value || 0), subtotal.value));
  const totalTax = computed(() => Math.max(0, (subtotal.value - totalDiscount.value) * Number(taxRate.value || 0)));
  const grandTotal = computed(() => Math.max(0, subtotal.value - totalDiscount.value + totalTax.value));

  // Cart actions
  const addItem = (product, qty = 1) => {
    const existing = items.value.find((i) => i.product_id === product.id || i.id === product.id);
    if (existing) {
      existing.quantity = Math.max(0.001, (Number(existing.quantity) || 0) + Number(qty));
    } else {
      items.value.push({
        id: product.id,
        product_id: product.id,
        name_ar: product.name_ar,
        sku: product.sku,
        unit: product.unit || 'count',
        price: Number(product.sale_price || product.price || 0),
        sale_price: Number(product.sale_price || product.price || 0),
        purchase_price: Number(product.purchase_price || 0),
        quantity: Math.max(0.001, Number(qty)),
      });
    }
  };

  const updateQuantity = (productId, qty) => {
    const item = items.value.find((i) => i.product_id === productId || i.id === productId);
    if (item) {
      const newQty = Number(qty);
      if (newQty <= 0) {
        removeItem(productId);
      } else {
        item.quantity = newQty;
      }
    }
  };

  const updatePrice = (productId, newPrice) => {
    const item = items.value.find((i) => i.product_id === productId || i.id === productId);
    if (item) {
      item.price = Math.max(0, Number(newPrice));
    }
  };

  const removeItem = (productId) => {
    items.value = items.value.filter((i) => i.product_id !== productId && i.id !== productId);
  };

  const clearCart = () => {
    items.value = [];
    discountAmount.value = 0;
  };

  return {
    items,
    customerId,
    saleType,
    discountAmount,
    taxRate,
    itemCount,
    subtotal,
    totalDiscount,
    totalTax,
    grandTotal,
    addItem,
    updateQuantity,
    updatePrice,
    removeItem,
    clearCart,
  };
});
