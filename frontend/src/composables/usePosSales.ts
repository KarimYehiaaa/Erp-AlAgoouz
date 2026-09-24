import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  sales as salesApi,
  products as productsApi,
  forecasting as forecastingApi,
  users as userApi,
  customers as customersApi,
} from '@/api';
import { posApi } from '@/api/pos.api';
import { roundMoney } from '@/utils/money';
import { parseLocalizedNumber } from '@/utils/numberParsing';
import { useProductMeta } from '@/composables/useProductMeta';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { localDb } from '@/services/localDb';
import { directPrinter } from '@/services/directPrinter';
import { usePosShift } from '@/composables/usePosShift';

/**
 * usePosSales — منطق نقطة البيع للمحل كاملاً: حالة السلة، الدفع، الطباعة،
 * المزامنة دون اتصال، وسجل المبيعات.
 */
export function usePosSales() {
  const authStore = useAuthStore();

  // ─── helpers ───────────────────────────────────────────────────────────────
  const localTodayYmd = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const today = localTodayYmd();

  const formatDate = (d: any) => {
    const val = d?.split?.('T')?.[0] || d;
    if (!val) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [y, m, day] = val.split('-');
      return `${day}/${m}/${y}`;
    }
    return new Date(val).toLocaleDateString('en-GB');
  };

  const { categories, loadMeta } = useProductMeta();

  // ─── state ─────────────────────────────────────────────────────────────────
  const showMode = ref('manual');
  const showCheckoutDrawer = ref(false);
  const activeTab = ref('products'); // 'products' or 'cart'
  const loadingProducts = ref(false);
  const loadingHistory = ref(false);
  const saving = ref(false);
  const saleError = ref('');
  const downloadingTemplate = ref(false);
  const todayStr = today;

  // ─── PWA & Printing State ───
  const appStore = useAppStore();
  const autoPrint = ref(localStorage.getItem('auto_print_receipt') !== 'false');
  const printerName = ref(directPrinter.getSelectedPrinterName() || '');
  const lastSavedSale = ref<any>(null);

  const cart = ref<any[]>([]);
  const saleForm = ref({
    sale_date: today,
    payment_method: 'cash',
    discount_amount: 0,
    warehouse_id: null,
    customer_id: null as number | null,
    pos_shift_id: null as number | null,
    terminal_id: null as number | null,
    loyalty_points_redeemed: 0,
    payments: null as any[] | null,
    notes: '',
  });

  const productsPanelRef = ref<any>(null);
  const cartPanelRef = ref<any>(null);
  const companySettings = ref({
    name_ar: 'بن العجوز',
    phone: '',
    address: '',
    tagline: 'للبن التركي',
  });

  let sharedAudioCtx: AudioContext | null = null;
  const getAudioContext = (): AudioContext | null => {
    try {
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        const AudioCtx: typeof AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) sharedAudioCtx = new AudioCtx();
      }
      if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      return sharedAudioCtx;
    } catch {
      return null;
    }
  };

  const playBeep = (type = 'success') => {
    const soundEnabled = localStorage.getItem('sound_enabled') !== 'false';
    if (!soundEnabled) return;
    const soundVolume = parseFloat(localStorage.getItem('sound_volume') || '0.08');

    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      if (type === 'success') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime);
        gain.gain.setValueAtTime(soundVolume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc1.start();
        osc2.start();
        osc1.stop(audioCtx.currentTime + 0.25);
        osc2.stop(audioCtx.currentTime + 0.25);
      } else if (type === 'warning') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        gain.gain.setValueAtTime(soundVolume * 1.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } else if (type === 'error') {
        const gain = audioCtx.createGain();
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(soundVolume * 2, audioCtx.currentTime);
        const playTone = (freq: any, duration: any, delay: any) => {
          const osc = audioCtx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          osc.connect(gain);
          osc.start(audioCtx.currentTime + delay);
          osc.stop(audioCtx.currentTime + delay + duration);
        };
        playTone(130, 0.1, 0);
        playTone(130, 0.1, 0.12);
        playTone(130, 0.15, 0.24);
      } else if (type === 'click') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(soundVolume * 0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      }
    } catch (err: any) {
      console.error('Audio play failed:', err);
    }
  };
  const shortcutsModal = ref(false);
  const returnsModal = ref(false);
  const returnInvoiceSearch = ref('');

  // ─── ⏸ Held Orders (الطلبات المعلقة) ───
  const HELD_ORDERS_KEY = 'pos_held_orders';
  const heldOrders = ref<any[]>([]);

  const loadHeldOrders = () => {
    try {
      const raw = localStorage.getItem(HELD_ORDERS_KEY);
      if (raw) {
        heldOrders.value = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to load held orders', err);
      heldOrders.value = [];
    }
  };

  const saveHeldOrders = () => {
    try {
      localStorage.setItem(HELD_ORDERS_KEY, JSON.stringify(heldOrders.value));
    } catch (err) {
      console.error('Failed to save held orders', err);
    }
  };

  const holdCurrentOrder = () => {
    if (!cart.value.length) {
      appStore.addToast('السلة فارغة، لا يوجد طلب لتعليقه', 'warning');
      playBeep('warning');
      return;
    }
    const now = new Date();
    const heldItem = {
      id: 'hold_' + Date.now(),
      items: JSON.parse(JSON.stringify(cart.value)),
      discount_amount: saleForm.value.discount_amount,
      payment_method: saleForm.value.payment_method,
      total: cartTotal.value,
      items_count: cart.value.length,
      time: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    };
    heldOrders.value.unshift(heldItem);
    saveHeldOrders();
    clearCart();
    playBeep('click');
    appStore.addToast(`تم تعليق الطلب (${heldItem.items_count} صنف) بنجاح ⏸`, 'success');
  };

  const resumeHeldOrder = (held: any) => {
    if (cart.value.length > 0) {
      if (!window.confirm('توجد أصناف حالية في السلة. هل تريد استبدالها بالطلب المعلق؟')) {
        return;
      }
    }
    cart.value = JSON.parse(JSON.stringify(held.items));
    saleForm.value.discount_amount = held.discount_amount || 0;
    saleForm.value.payment_method = held.payment_method || 'cash';
    heldOrders.value = heldOrders.value.filter((h: any) => h.id !== held.id);
    saveHeldOrders();
    playBeep('success');
    appStore.addToast('تم استرجاع الطلب المعلق للسلة بنجاح ', 'success');
  };

  const deleteHeldOrder = (heldId: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الطلب المعلق نهائياً؟')) {
      heldOrders.value = heldOrders.value.filter((h: any) => h.id !== heldId);
      saveHeldOrders();
      playBeep('warning');
      appStore.addToast('تم حذف الطلب المعلق', 'info');
    }
  };

  // ───  Invoices Filter & Quick Reprint ───
  const filteredInvoicesForReturn = computed(() => {
    if (!returnInvoiceSearch.value.trim()) return salesHistory.value;
    const q = returnInvoiceSearch.value.trim().toLowerCase();
    return salesHistory.value.filter(
      (s: any) =>
        String(s.id).includes(q) ||
        String(s.sale_number || '')
          .toLowerCase()
          .includes(q) ||
        String(s.total_amount || '').includes(q),
    );
  });

  const reprintLastSale = () => {
    if (lastSavedSale.value) {
      printReceipt(lastSavedSale.value);
      return;
    }
    if (salesHistory.value.length > 0) {
      printReceipt(salesHistory.value[0]);
      return;
    }
    appStore.addToast('لا توجد فاتورة سابقة لإعادة طباعتها', 'warning');
    playBeep('warning');
  };

  // ─── ⌨ Global POS Shortcuts Listener ───
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    const shortcutsEnabled = localStorage.getItem('shortcuts_enabled') !== 'false';
    if (!shortcutsEnabled) return;

    const targetTag = (e.target as HTMLElement)?.tagName;
    const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT';

    if (e.key === ' ' && !isTyping) {
      // زر المسافة يفتح/يغلق درج الدفع عند وجود أصناف
      if (cart.value.length > 0) {
        e.preventDefault();
        showCheckoutDrawer.value = !showCheckoutDrawer.value;
        playBeep('click');
      }
    } else if (e.key === 'F1') {
      e.preventDefault();
      shortcutsModal.value = !shortcutsModal.value;
    } else if (e.key === 'F2' || e.key === 'F7') {
      e.preventDefault();
      productsPanelRef.value?.focusSearch();
    } else if (e.key === 'F4') {
      e.preventDefault();
      if (showCheckoutDrawer.value) {
        cartPanelRef.value?.focusDiscount();
      } else if (cart.value.length > 0) {
        holdCurrentOrder();
      } else if (heldOrders.value.length > 0) {
        resumeHeldOrder(heldOrders.value[0]);
      } else {
        appStore.addToast('السلة فارغة، ولا توجد طلبات معلقة', 'warning');
      }
    } else if (e.key === 'F6') {
      e.preventDefault();
      if (cart.value.length > 0) {
        clearCart();
      }
    } else if (e.key === 'F8') {
      e.preventDefault();
      reprintLastSale();
    } else if (e.key === 'F9') {
      e.preventDefault();
      if (cart.value.length > 0) {
        showCheckoutDrawer.value = true;
        saleForm.value.payment_method = 'cash';
        cartPanelRef.value?.focusReceived();
        playBeep('click');
      }
    } else if (e.key === 'F10') {
      e.preventDefault();
      if (cart.value.length > 0) {
        showCheckoutDrawer.value = true;
        saleForm.value.payment_method = 'card';
        playBeep('click');
      }
    } else if (e.key === 'Escape') {
      if (showCheckoutDrawer.value) {
        showCheckoutDrawer.value = false;
      } else if (shortcutsModal.value || returnsModal.value || countsModal.value) {
        shortcutsModal.value = false;
        returnsModal.value = false;
        countsModal.value = false;
      }
    }
  };

  watch(autoPrint, (val: any) => {
    localStorage.setItem('auto_print_receipt', String(val));
  });

  const allProducts = ref<any[]>([]);
  const filteredProducts = ref<any[]>([]);
  const productSearch = ref('');
  const selectedCategory = ref('');

  // ─── Customer Selection (اختيار العميل) ───
  const customersList = ref<any[]>([]);
  const loadingCustomers = ref(false);

  const loadCustomers = async () => {
    loadingCustomers.value = true;
    try {
      const res = await customersApi.list();
      customersList.value = res.data || [];
      await localDb.saveCustomers(customersList.value);
    } catch {
      // Fallback to cached customers when offline
      customersList.value = await localDb.getCustomers();
    } finally {
      loadingCustomers.value = false;
    }
  };

  const selectedCustomer = computed(() => {
    if (!saleForm.value.customer_id) return null;
    return customersList.value.find((c: any) => c.id === saleForm.value.customer_id) || null;
  });

  // AI complementary items states & actions
  const recommendedItems = ref<any[]>([]);
  const loadingRecommendations = ref(false);

  const loadRecommendations = async () => {
    if (!cart.value.length) {
      recommendedItems.value = [];
      return;
    }
    loadingRecommendations.value = true;
    try {
      const productIds = cart.value.map((i: any) => i.product_id);
      const res = await forecastingApi.getBasketAssociations({
        cart: productIds.join(','),
        warehouse_id: saleForm.value.warehouse_id || 1,
      });
      // Filter out recommendations that are already in the cart
      recommendedItems.value = (res.data || []).filter(
        (r: any) => !productIds.includes(r.product_id),
      );
    } catch (err: any) {
      console.error('Failed to load basket recommendations:', err);
      recommendedItems.value = [];
    } finally {
      loadingRecommendations.value = false;
    }
  };

  watch(
    cart,
    () => {
      loadRecommendations();
    },
    { deep: true },
  );

  const addRecommendedToCart = (rec: any) => {
    const product = allProducts.value.find((p: any) => p.id === rec.product_id) || {
      id: rec.product_id,
      name_ar: rec.name_ar,
      sale_price: rec.sale_price,
      has_recipe: true,
    };
    addToCart(product);
  };

  const salesHistory = ref<any[]>([]);
  const historyFilters = ref({ from_date: today.slice(0, 8) + '01', to_date: today });

  // Excel state
  const excelMsg = ref('');
  const excelErr = ref(false);
  const excelDetails = ref<any[]>([]);
  const countsModal = ref(false);
  const counts = ref<Record<string, any>>({});

  // ─── computed ──────────────────────────────────────────────────────────────
  const cartSubtotal = computed(() =>
    roundMoney(
      cart.value.reduce(
        (sum: any, item: any) => sum + roundMoney(item.quantity * item.unit_price),
        0,
      ),
    ),
  );
  const loyaltyFinancialDiscount = computed(() => {
    return roundMoney((Number(saleForm.value.loyalty_points_redeemed) || 0) / 10);
  });

  // خصم مقيّد دائماً بين 0 وإجمالي السلة (يشمل الخصم اليدوي وخصم نقاط الولاء)
  const effectiveDiscount = computed(() => {
    const manualDiscount = Math.max(0, Number(saleForm.value.discount_amount || 0));
    const totalDiscount = manualDiscount + loyaltyFinancialDiscount.value;
    return Math.min(totalDiscount, cartSubtotal.value);
  });
  const cartTotal = computed(() => roundMoney(cartSubtotal.value - effectiveDiscount.value));

  // ─── 🔐 Manager PIN Override ───
  const showPinModal = ref(false);
  const pinActionDescription = ref('');
  const pinLoading = ref(false);
  const pinErrorMessage = ref('');
  let pendingAuthorizedAction: (() => Promise<void> | void) | null = null;

  const requestManagerPin = (actionDesc: string, onAuthorized: () => Promise<void> | void) => {
    if (!authStore.isCashier) {
      onAuthorized();
      return;
    }
    pinActionDescription.value = actionDesc;
    pinErrorMessage.value = '';
    pinLoading.value = false;
    pendingAuthorizedAction = onAuthorized;
    showPinModal.value = true;
  };

  const handlePinSubmit = async (pin: string) => {
    pinLoading.value = true;
    pinErrorMessage.value = '';
    try {
      const res = await posApi.verifyPin({ pin, action: pinActionDescription.value });
      if (res?.data?.verified || res?.data?.success) {
        showPinModal.value = false;
        appStore.addToast(
          `تمت المصادقة بنجاح بواسطة: ${res.data.manager?.name || 'المدير'}`,
          'success',
        );
        if (pendingAuthorizedAction) {
          const action = pendingAuthorizedAction;
          pendingAuthorizedAction = null;
          await action();
        }
      } else {
        pinErrorMessage.value = 'رمز PIN غير صحيح أو غير مصرح';
      }
    } catch (err: any) {
      pinErrorMessage.value =
        err?.response?.data?.message || err?.message || 'فشل التحقق من رمز PIN';
    } finally {
      pinLoading.value = false;
    }
  };

  const todayTotal = computed(() =>
    roundMoney(
      salesHistory.value
        .filter((s: any) => s.status === 'completed' && (s.sale_date || '').startsWith(today))
        .reduce((sum: any, s: any) => sum + parseFloat(s.total_amount || 0), 0),
    ),
  );
  const todayCount = computed(
    () =>
      salesHistory.value.filter(
        (s: any) => s.status === 'completed' && (s.sale_date || '').startsWith(today),
      ).length,
  );
  const lastSaleTime = computed(() => {
    const todaySales = salesHistory.value.filter((s: any) => (s.sale_date || '').startsWith(today));
    if (!todaySales.length) return '—';
    const last = todaySales[0];
    const d = new Date(last.created_at);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  });

  // ─── product helpers ────────────────────────────────────────────────────────
  const hasLowIngredients = (product: any) => {
    if (!product.has_recipe || !Array.isArray(product.recipe_items)) return false;
    return product.recipe_items.some((ri: any) => {
      const needed = Number(ri.quantity);
      const available = Number(ri.stock_available || 0);
      return available < needed;
    });
  };

  const getProductStockClass = (product: any) => {
    if (!product.has_recipe) {
      const qty = Number(product.stock_quantity || 0);
      if (qty <= 0) return 'out';
      if (qty <= 10) return 'low';
      return 'good';
    } else {
      const isMissing = hasLowIngredients(product);
      if (isMissing) return 'out';

      // Check if any ingredient has less than 5 servings left
      const isClose = product.recipe_items?.some((ri: any) => {
        const needed = Number(ri.quantity);
        const available = Number(ri.stock_available || 0);
        return available < needed * 5;
      });
      if (isClose) return 'low';
      return 'good';
    }
  };

  const getProductStockTitle = (product: any) => {
    const status = getProductStockClass(product);
    if (status === 'out') return 'المخزون غير كافٍ لعمل المشروب ';
    if (status === 'low') return 'المخزون منخفض (أقل من 5 أكواب متبقية) ';
    return 'متوفر بكثرة في المخزن ';
  };

  const isInCart = (productId: any) => cart.value.some((i: any) => i.product_id === productId);
  const getCartQty = (productId: any) => {
    const item = cart.value.find((i: any) => i.product_id === productId);
    return item ? item.quantity : 0;
  };

  // ─── product actions ────────────────────────────────────────────────────────
  const filterProducts = () => {
    let list = allProducts.value;
    if (selectedCategory.value) {
      list = list.filter((p: any) => p.category_id == selectedCategory.value);
    }
    if (productSearch.value.trim()) {
      const q = productSearch.value.trim().toLowerCase();
      list = list.filter(
        (p: any) =>
          p.name_ar.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q),
      );
    }
    filteredProducts.value = list;
  };

  const loadProducts = async () => {
    loadingProducts.value = true;
    try {
      const params: Record<string, any> = {};
      if (saleForm.value.warehouse_id) params.warehouse_id = saleForm.value.warehouse_id;

      if (navigator.onLine) {
        const prodRes = await productsApi.shopProducts(params);
        allProducts.value = prodRes.data || [];
        try {
          await localDb.saveProducts(allProducts.value);
        } catch (dbErr: any) {
          console.warn('Failed to cache products to IndexedDB:', dbErr);
        }
      } else {
        const cached = await localDb.getProducts();
        allProducts.value = cached || [];
      }
      await loadMeta();
      filterProducts();
    } catch (e: any) {
      console.error('فشل تحميل المنتجات:', e.message);
      try {
        const cached = await localDb.getProducts();
        if (cached && cached.length) {
          allProducts.value = cached;
          filterProducts();
        }
      } catch (dbErr: any) {
        console.error('Failed to load products from IndexedDB fallback:', dbErr);
      }
    } finally {
      loadingProducts.value = false;
    }
  };

  // reload products when selected warehouse for the sale changes
  watch(
    () => saleForm.value.warehouse_id,
    (v: any, o: any) => {
      if (v !== o) loadProducts();
    },
  );

  // ─── cart actions ───────────────────────────────────────────────────────────
  const addToCart = (product: any, customQty?: number, customNotes?: string) => {
    playBeep('success');
    const qtyToAdd = customQty !== undefined ? customQty : 1;
    const existing = cart.value.find(
      (i: any) => i.product_id === product.id && (i.custom_notes || '') === (customNotes || ''),
    );
    if (existing) {
      existing.quantity = parseFloat((existing.quantity + qtyToAdd).toFixed(3));
    } else {
      // set sale warehouse from product primary_warehouse_id if not set
      if (!saleForm.value.warehouse_id && product.primary_warehouse_id) {
        saleForm.value.warehouse_id = product.primary_warehouse_id;
      }
      cart.value.push({
        product_id: product.id,
        name_ar: product.name_ar,
        unit_price: parseFloat(product.sale_price || 0),
        quantity: qtyToAdd,
        has_recipe: product.has_recipe,
        custom_notes: customNotes || '',
      });
    }
  };

  const increaseQty = (idx: any) => {
    playBeep('click');
    cart.value[idx].quantity = parseFloat((cart.value[idx].quantity + 1).toFixed(3));
  };
  const decreaseQty = (idx: any) => {
    playBeep('click');
    if (cart.value[idx].quantity > 0.1) {
      cart.value[idx].quantity = parseFloat((cart.value[idx].quantity - 1).toFixed(3));
    } else {
      cart.value.splice(idx, 1);
    }
  };
  const validateQty = (idx: any) => {
    const qty = parseFloat(cart.value[idx].quantity);
    if (!qty || qty <= 0) cart.value.splice(idx, 1);
  };
  const removeFromCart = (idx: any) => {
    playBeep('click');
    cart.value.splice(idx, 1);
    if (!cart.value.length) {
      showCheckoutDrawer.value = false;
    }
  };
  const clearCart = (force = false) => {
    if (!force && authStore.isCashier && cart.value.length > 0) {
      requestManagerPin('مسح وتفريغ السلة (Void Order)', () => clearCart(true));
      return;
    }
    playBeep('click');
    cart.value = [];
    saleForm.value.discount_amount = 0;
    saleForm.value.loyalty_points_redeemed = 0;
    saleForm.value.payments = null;
    saleForm.value.notes = '';
    saleForm.value.warehouse_id = null;
    saleForm.value.customer_id = null;
    saleError.value = '';
    showCheckoutDrawer.value = false;
  };

  // ─── submit sale ────────────────────────────────────────────────────────────
  const selectPrinter = async () => {
    try {
      await directPrinter.selectPrinter();
      printerName.value = directPrinter.getSelectedPrinterName() || 'USB Printer';
      alert('تم تحديد الطابعة بنجاح: ' + printerName.value);
    } catch (err: any) {
      alert('فشل تحديد الطابعة: ' + err.message);
    }
  };

  const printReceipt = async (saleRecord: any) => {
    if (!saleRecord) return;
    try {
      const invoiceData = {
        ...saleRecord,
        invoice_number: saleRecord.sale_number,
        created_at: saleRecord.created_at || saleRecord.sale_date,
        // استخدام القيم المخزنة كما هي — لا تُعاد عملية الضرب لتجنب فروق القروش مع قاعدة البيانات
        subtotal: roundMoney(
          (saleRecord.items || []).reduce(
            (sum: number, item: any) =>
              sum + Number(item.total_amount ?? item.quantity * item.unit_price),
            0,
          ),
        ),
        total_amount: saleRecord.total_amount,
        discount_amount: saleRecord.discount_amount,
        customer_name: selectedCustomer.value
          ? selectedCustomer.value.name_ar || selectedCustomer.value.name
          : undefined,
        payments:
          saleRecord.payments ||
          (saleForm.value.payment_method === 'split' ? saleForm.value.payments : undefined),
        loyalty: {
          earned: Math.max(0, Math.floor(Number(saleRecord.total_amount || 0) / 10)),
          redeemed: Number(saleForm.value.loyalty_points_redeemed) || 0,
        },
        user_name: authStore.user?.full_name || 'كاشير المحل',
        company: companySettings.value,
        items: (saleRecord.items || []).map((item: any) => {
          const notesStr = item.notes || item.custom_notes;
          return {
            product_name:
              (item.product_name ||
                item.name_ar ||
                allProducts.value.find((p: any) => p.id === item.product_id)?.name_ar ||
                'منتج') + (notesStr ? ` (${notesStr})` : ''),
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: roundMoney(Number(item.total_amount ?? item.quantity * item.unit_price)),
          };
        }),
      };
      await directPrinter.print(invoiceData);
    } catch (err: any) {
      console.error('Print failed:', err);
      alert('فشل الطباعة: ' + err.message);
    }
  };

  const { currentShift, isShiftOpen, showOpenShiftModal, refreshShiftStats } = usePosShift();

  const submitManualSale = async (force = false) => {
    if (!cart.value.length) return;
    saleError.value = '';

    // التحقق من فتح الشفت عند كاشير المحل
    if (authStore.isCashier && !isShiftOpen.value) {
      playBeep('warning');
      appStore.addToast('يرجى فتح شفت أولاً لبدء تسجيل المبيعات ومطابقة العهدة', 'warning');
      showOpenShiftModal.value = true;
      return;
    }

    // التحقق من اختيار عميل عند البيع الآجل
    if (saleForm.value.payment_method === 'credit' && !saleForm.value.customer_id) {
      playBeep('warning');
      saleError.value = 'يجب اختيار عميل عند البيع الآجل (ذمم)';
      appStore.addToast('يجب اختيار عميل عند البيع الآجل (ذمم)', 'warning');
      return;
    }

    // التحقق من الدفع المتعدد
    if (saleForm.value.payment_method === 'split') {
      const splitPayments = (saleForm.value.payments || []).filter(
        (p: any) => Number(p.amount) > 0,
      );
      if (!splitPayments.length) {
        playBeep('warning');
        saleError.value = 'يرجى إدخال مبالغ الدفع في طرق الدفع المحددة';
        appStore.addToast('يرجى إدخال مبالغ الدفع في طرق الدفع المحددة', 'warning');
        return;
      }
      const totalSplit = splitPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      if (Math.abs(totalSplit - cartTotal.value) > 0.05) {
        playBeep('warning');
        const diff = Math.round((cartTotal.value - totalSplit) * 100) / 100;
        const msg =
          diff > 0
            ? `المبلغ المدفوع أقل من المطلوب بـ ${diff} ج.م`
            : `المبلغ المدفوع أكثر من المطلوب بـ ${Math.abs(diff)} ج.م`;
        saleError.value = msg;
        appStore.addToast(msg, 'warning');
        return;
      }
    }

    // فحص الخصم الكبير لطلب موافقة المدير
    const manualDiscount = Number(saleForm.value.discount_amount || 0);
    const isExcessiveDiscount =
      manualDiscount > 50 || (cartSubtotal.value > 0 && manualDiscount / cartSubtotal.value > 0.15);
    if (!force && authStore.isCashier && isExcessiveDiscount) {
      requestManagerPin(`تطبيق خصم بقيمة ${manualDiscount} ج.م`, () => submitManualSale(true));
      return;
    }

    saving.value = true;

    const syncId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

    const payload = {
      sync_id: syncId,
      sale_type: 'retail',
      sale_date: saleForm.value.sale_date,
      warehouse_id: saleForm.value.warehouse_id || currentShift.value?.warehouse_id || null,
      customer_id: saleForm.value.customer_id || null,
      pos_shift_id: currentShift.value?.id || saleForm.value.pos_shift_id || null,
      terminal_id: currentShift.value?.terminal_id || saleForm.value.terminal_id || null,
      payment_method: saleForm.value.payment_method,
      payment_status: 'paid',
      discount_amount: effectiveDiscount.value,
      loyalty_points_redeemed: Number(saleForm.value.loyalty_points_redeemed) || 0,
      payments: saleForm.value.payment_method === 'split' ? saleForm.value.payments : undefined,
      notes: saleForm.value.notes || null,
      total_amount: Number(cartTotal.value),
      items: cart.value
        .filter((i: any) => i.product_id && parseLocalizedNumber(i.quantity) > 0)
        .map((i: any) => ({
          product_id: i.product_id,
          product_name: i.name_ar,
          quantity: parseLocalizedNumber(i.quantity),
          unit_price: parseLocalizedNumber(i.unit_price),
          discount_amount: 0,
          notes: i.custom_notes || undefined,
        })),
    };

    try {
      let saleRecord = null;
      if (navigator.onLine) {
        // مفتاح Idempotency يُرسل من المحاولة الأولى حتى لو فُقد الرد يتعرف الخادم على العملية
        const res = await salesApi.create(payload, {
          headers: {
            'Idempotency-Key': syncId,
            'X-Idempotency-Key': syncId,
          },
        });
        saleRecord = res.data;
        lastSavedSale.value = saleRecord;
        playBeep('success');
        clearCart();
        await Promise.all([loadHistory(), loadProducts(), refreshShiftStats()]);
      } else {
        saleRecord = await localDb.saveOfflineSale(payload);
        lastSavedSale.value = saleRecord;

        const offlineSales = await localDb.getOfflineSales();
        appStore.pendingSyncCount = offlineSales.length;

        playBeep('success');
        clearCart();
        salesHistory.value.unshift(saleRecord);
        alert(
          ' تم حفظ الفاتورة محلياً بسبب انقطاع الاتصال. سيتم مزامنتها تلقائياً عند عودة الشبكة.',
        );
      }

      if (autoPrint.value && saleRecord) {
        await printReceipt(saleRecord);
      }
    } catch (e: any) {
      // التفريق بين أخطاء الشبكة (حفظ أوفلاين) وأخطاء التحقق (عرض للمستخدم)
      const isNetworkError = !navigator.onLine || !e.status || e.code === 'ERR_NETWORK';

      if (isNetworkError) {
        console.warn('Network error — saving offline fallback...', e);
        try {
          const saleRecord = await localDb.saveOfflineSale(payload);
          lastSavedSale.value = saleRecord;

          const offlineSales = await localDb.getOfflineSales();
          appStore.pendingSyncCount = offlineSales.length;

          playBeep('success');
          clearCart();
          salesHistory.value.unshift(saleRecord);
          alert(' تم حفظ الفاتورة محلياً (فشل الاتصال بالخادم). سيتم مزامنتها تلقائياً.');

          if (autoPrint.value) {
            await printReceipt(saleRecord);
          }
        } catch (offlineErr: any) {
          playBeep('error');
          saleError.value = 'فشل تسجيل البيع: ' + (e.message || offlineErr.message);
        }
      } else {
        // خطأ تحقق أو سيرفر — عرضه للمستخدم بدون حفظ أوفلاين
        playBeep('error');
        saleError.value = e.message || 'فشل تسجيل البيع — تحقق من البيانات وحاول مرة أخرى';
      }
    } finally {
      saving.value = false;
    }
  };

  // ─── history ────────────────────────────────────────────────────────────────
  const selectMonth = (event: any) => {
    const value = event.target.value;
    if (!value) return;
    const [year, month] = value.split('-').map(Number);
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    historyFilters.value.from_date = fromDate;
    historyFilters.value.to_date = toDate;
    loadHistory();
  };

  const loadHistory = async () => {
    loadingHistory.value = true;
    try {
      let historyData = [];
      if (navigator.onLine) {
        const res = await salesApi.list({
          sale_type: 'retail',
          entry_mode: 'pos',
          from_date: historyFilters.value.from_date,
          to_date: historyFilters.value.to_date,
          limit: 100,
        });
        historyData = res.data || [];
      }
      const offlineSales = await localDb.getOfflineSales();
      salesHistory.value = [...offlineSales, ...historyData];
    } catch (e: any) {
      console.error('فشل تحميل السجل:', e.message);
      try {
        const offlineSales = await localDb.getOfflineSales();
        salesHistory.value = offlineSales;
      } catch (dbErr: any) {
        console.error('Failed to load offline sales for history:', dbErr);
      }
    } finally {
      loadingHistory.value = false;
    }
  };

  const returnSale = async (sale: any, force = false) => {
    if (!force && authStore.isCashier) {
      requestManagerPin(`إرجاع فاتورة (${sale.sale_number || sale.invoice_number})`, () =>
        returnSale(sale, true),
      );
      return;
    }
    if (!confirm(`تأكيد استرداد البيع ${sale.sale_number}؟ سيتم إرجاع المخزون.`)) return;
    try {
      await salesApi.return(sale.id, { notes: 'استرداد من شاشة مبيعات المحل' });
      appStore.addToast('تم استرداد الفاتورة بنجاح وإرجاع المخزون', 'success');
      await Promise.all([loadHistory(), loadProducts()]);
    } catch (e: any) {
      appStore.addToast(e.message || 'فشل الاسترداد', 'error');
    }
  };

  // ─── badge helpers ──────────────────────────────────────────────────────────
  const statusLabel = (s: any) =>
    (({ completed: 'مكتمل', returned: 'مسترد', cancelled: 'ملغي' }) as Record<string, string>)[s] ||
    s;
  const statusBadge = (s: any) => [
    'badge',
    s === 'completed' ? 'badge-success' : s === 'returned' ? 'badge-danger' : 'badge-warning',
  ];
  const paymentLabel = (s: any) =>
    (
      ({ paid: 'مدفوع', unpaid: 'غير مدفوع', partial: 'جزئي', refunded: 'مسترد' }) as Record<
        string,
        string
      >
    )[s] || s;
  const paymentBadge = (s: any) => [
    'badge',
    s === 'paid' ? 'badge-success' : s === 'unpaid' ? 'badge-danger' : 'badge-warning',
  ];

  // ─── Excel ──────────────────────────────────────────────────────────────────
  const downloadPosTemplate = async () => {
    downloadingTemplate.value = true;
    try {
      const blob = (await salesApi.downloadPosTemplate()) as unknown as Blob;
      const url = URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pos-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || 'فشل تحميل القالب');
    } finally {
      downloadingTemplate.value = false;
    }
  };

  const onValidateExcel = async (file: File) => {
    excelMsg.value = 'جاري فحص الملف...';
    excelErr.value = false;
    excelDetails.value = [];
    try {
      const res = await salesApi.posValidateExcel(file);
      const d = res.data;
      excelMsg.value = d.ok
        ? ` الملف سليم: ${d.itemCount} منتج في ${d.groupCount} فاتورة جاهزة للاستيراد`
        : ' الملف فيه أخطاء — راجع القائمة أدناه';
      excelErr.value = !d.ok;
      excelDetails.value = [
        ...(d.parseErrors || []).map((err: any) => `سطر ${err.row}: ${err.message}`),
        ...(d.preview || []).map(
          (p: any) => ` ${p.sale_date} — ${p.items_count} منتج: ${p.sample}`,
        ),
      ];
    } catch (err: any) {
      excelErr.value = true;
      excelMsg.value = err.message || 'فشل فحص الملف';
    }
  };

  const onImportExcel = async (file: File) => {
    excelMsg.value = 'جاري الاستيراد...';
    excelErr.value = false;
    excelDetails.value = [];
    try {
      const res = await salesApi.posImportExcel(file);
      const d = res.data;
      excelMsg.value =
        ` تم استيراد ${d.success} فاتورة (${d.itemsImported || 0} منتج)` +
        (d.failed?.length ? ` — فشل ${d.failed.length}` : '');
      excelDetails.value = [
        ...(d.parseErrors || []).map((err: any) => `تحذير سطر ${err.row}: ${err.message}`),
        ...(d.failed || []).map((err: any) => ` ${err.sale_date}: ${err.message}`),
      ];
      excelErr.value = d.success === 0;
      await Promise.all([loadHistory(), loadProducts()]);
    } catch (err: any) {
      excelErr.value = true;
      excelMsg.value = err.message || 'فشل الاستيراد';
    }
  };

  // ─── lifecycle & events ───
  const onInventoryUpdated = (_e: any) => {
    try {
      loadProducts();
    } catch (err: any) {
      console.warn('inventory-updated handler error', err);
    }
  };

  onMounted(async () => {
    loadProducts();
    loadHistory();
    loadHeldOrders();
    loadCustomers();
    window.addEventListener('inventory-updated', onInventoryUpdated);
    window.addEventListener('keydown', handleGlobalKeyDown);

    // Load company settings
    try {
      const res = await userApi.settings();
      if (res.data?.company) {
        companySettings.value = res.data.company;
        localStorage.setItem('company_settings', JSON.stringify(res.data.company));
      }
    } catch {
      const cached = localStorage.getItem('company_settings');
      if (cached) companySettings.value = JSON.parse(cached);
    }

    // Watch for global WebSocket/sync data refreshes
    watch(
      () => appStore.dataRefreshTrigger,
      () => {
        loadProducts();
        loadHistory();
      },
    );
  });

  onBeforeUnmount(() => {
    window.removeEventListener('inventory-updated', onInventoryUpdated);
    window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  const openCountsModal = () => {
    counts.value = {};
    for (const p of allProducts.value) counts.value[p.id] = 0;
    countsModal.value = true;
  };

  const submitCounts = async () => {
    const items = [];
    for (const [pid, qty] of Object.entries(counts.value || {})) {
      const q = Number(qty || 0);
      if (q > 0) {
        const prod = allProducts.value.find((x: any) => String(x.id) === String(pid));
        items.push({
          product_id: Number(pid),
          quantity: q,
          unit_price: prod ? Number(prod.sale_price || 0) : 0,
        });
      }
    }
    if (!items.length) {
      alert('أدخل كميات على الأقل لمنتج واحد.');
      return;
    }

    countsModal.value = false;
    try {
      saving.value = true;
      await salesApi.create({
        sale_type: 'retail',
        sale_date: saleForm.value.sale_date,
        warehouse_id: saleForm.value.warehouse_id || null,
        payment_method: saleForm.value.payment_method || 'cash',
        payment_status: 'paid',
        discount_amount: 0,
        notes: 'خصم حسب تعداد المنتجات',
        items,
      });
      counts.value = {};
      await Promise.all([loadHistory(), loadProducts()]);
    } catch (e: any) {
      alert(e.message || 'فشل تنفيذ الخصم من التعداد');
    } finally {
      saving.value = false;
    }
  };

  return {
    authStore,
    localTodayYmd,
    today,
    formatDate,
    showMode,
    showCheckoutDrawer,
    activeTab,
    loadingProducts,
    loadingHistory,
    saving,
    saleError,
    downloadingTemplate,
    todayStr,
    appStore,
    autoPrint,
    printerName,
    lastSavedSale,
    productsPanelRef,
    cartPanelRef,
    companySettings,
    playBeep,
    shortcutsModal,
    returnsModal,
    returnInvoiceSearch,
    HELD_ORDERS_KEY,
    heldOrders,
    loadHeldOrders,
    saveHeldOrders,
    holdCurrentOrder,
    resumeHeldOrder,
    deleteHeldOrder,
    filteredInvoicesForReturn,
    reprintLastSale,
    handleGlobalKeyDown,
    allProducts,
    filteredProducts,
    productSearch,
    selectedCategory,
    cart,
    saleForm,
    recommendedItems,
    loadingRecommendations,
    loadRecommendations,
    addRecommendedToCart,
    salesHistory,
    historyFilters,
    excelMsg,
    excelErr,
    excelDetails,
    countsModal,
    counts,
    cartSubtotal,
    effectiveDiscount,
    cartTotal,
    todayTotal,
    todayCount,
    lastSaleTime,
    hasLowIngredients,
    getProductStockClass,
    getProductStockTitle,
    isInCart,
    getCartQty,
    filterProducts,
    loadProducts,
    addToCart,
    increaseQty,
    decreaseQty,
    validateQty,
    removeFromCart,
    clearCart,
    selectPrinter,
    printReceipt,
    submitManualSale,
    selectMonth,
    loadHistory,
    returnSale,
    statusLabel,
    statusBadge,
    paymentLabel,
    paymentBadge,
    downloadPosTemplate,
    onValidateExcel,
    onImportExcel,
    onInventoryUpdated,
    openCountsModal,
    submitCounts,
    categories,
    loadMeta,
    customersList,
    loadingCustomers,
    loadCustomers,
    selectedCustomer,
    // ─── 🔐 Manager PIN ───
    showPinModal,
    pinActionDescription,
    pinLoading,
    pinErrorMessage,
    requestManagerPin,
    handlePinSubmit,
  };
}
