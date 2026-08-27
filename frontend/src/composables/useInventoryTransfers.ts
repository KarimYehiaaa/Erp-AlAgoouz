/**
 * useInventoryTransfers — منطق التحويلات وحركة المخزون في شاشة المخزون
 * سجل حركة المخزون (movements) + مودال تحويل المخازن (فردي/إذن متعدد) +
 * إصدار إذن النقل المخزني والطباعة + استرجاع إذن من سجل الحركات.
 * استُخرج من InventoryView.vue (كان السكربت 1,564 سطرًا).
 */
import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { inventory as inventoryApi, products as productsApi } from '@/api';

/** الاعتماديات المشتركة الممرّرة من الـ view (المخازن، الرسائل، إعادة التحميل). */
export interface InventoryTransfersContext {
  warehouses: Ref<any[]>;
  setMsg: (_text: string, _isErr?: boolean) => void;
  reload: () => Promise<void>;
}

/**
 * composable التحويلات وحركة المخزون.
 * @param {InventoryTransfersContext} ctx السياق المشترك من الـ view
 * @returns {{
 *   movements: import('vue').Ref<any[]>,
 *   filteredMovements: import('vue').ComputedRef<any[]>,
 *   movementsColumns: any[],
 *   movementTypeFilter: import('vue').Ref<string>,
 *   showTransfer: import('vue').Ref<boolean>,
 *   transfer: import('vue').Ref<any>,
 *   transferMode: import('vue').Ref<string>,
 *   batchItems: import('vue').Ref<any[]>,
 *   showVoucherModal: import('vue').Ref<boolean>,
 *   currentVoucher: import('vue').Ref<Record<string, any> | null>,
 *   transferProducts: import('vue').Ref<any[]>,
 *   allProducts: import('vue').Ref<any[]>,
 *   loadingTransferProducts: import('vue').Ref<boolean>,
 *   selectedTransferProduct: import('vue').ComputedRef<any>,
 *   selectedTransferDestProduct: import('vue').ComputedRef<any>,
 *   loadMovements: () => Promise<void>,
 *   setDefaultWarehouses: () => void,
 *   openTransferModal: () => void,
 *   openTransferProduct: (item: any) => void,
 *   setTransferDirection: (fromType: any, toType: any) => void,
 *   swapTransferDirection: () => void,
 *   doTransfer: () => Promise<void>,
 *   addBatchRow: () => void,
 *   removeBatchRow: (idx: any) => void,
 *   printVoucher: () => void,
 *   printTransferVoucherFromMovement: (item: any) => void,
 * }}
 */
export function useInventoryTransfers(ctx: InventoryTransfersContext) {
  const { warehouses, setMsg, reload } = ctx;

  // ── سجل حركة المخزون ──
  const movements = ref<any[]>([]);
  const movementTypeFilter = ref('');
  const movementsColumns = [
    { key: 'product_name', label: 'المنتج' },
    { key: 'movement_type', label: 'النوع' },
    { key: 'quantity', label: 'الكمية' },
    { key: 'from_warehouse', label: 'من' },
    { key: 'to_warehouse', label: 'إلى' },
    { key: 'user_name', label: 'بواسطة' },
    { key: 'created_at', label: 'التاريخ' },
    { key: 'actions', label: 'إذن', align: 'right' },
  ];

  const filteredMovements = computed(() => {
    if (!movementTypeFilter.value) return movements.value;
    return movements.value.filter((m: any) => m.movement_type === movementTypeFilter.value);
  });

  /** تحميل سجل حركة المخزون (آخر 50 حركة). */
  const loadMovements = async () => {
    try {
      const res = await inventoryApi.movements({ limit: 50 });
      movements.value = res.data || [];
    } catch (e: any) {
      movements.value = [];
      throw e;
    }
  };

  // ── مودال التحويل ──
  const showTransfer = ref(false);
  const transfer = ref({
    product_id: null as any,
    to_product_id: null as any,
    from_warehouse_id: null as any,
    to_warehouse_id: null as any,
    quantity: 1,
  });

  const transferMode = ref('single'); // 'single' | 'batch'
  const batchItems = ref([
    { product_id: null as any, to_product_id: null as any, quantity: 1, notes: '' },
  ]);
  const showVoucherModal = ref(false);
  const currentVoucher = ref<Record<string, any> | null>(null);

  const transferProducts = ref<any[]>([]);
  const transferDestProducts = ref<any[]>([]);
  const allProducts = ref<any[]>([]);
  const loadingTransferProducts = ref(false);

  const selectedTransferProduct = computed(() => {
    return transferProducts.value.find((p: any) => p.product_id === transfer.value.product_id);
  });

  const selectedTransferDestProduct = computed(() => {
    if (!transfer.value.to_product_id) return null;
    const targetId = Number(transfer.value.to_product_id);
    const found = transferDestProducts.value.find(
      (p: any) => Number(p.product_id || p.id) === targetId,
    );
    return found || { quantity: 0 };
  });

  const loadAllProducts = async () => {
    try {
      const res = await productsApi.list({ limit: 1000 });
      allProducts.value = (res.data || []).filter(
        (p: any) => p.is_active !== false && !p.has_active_recipe,
      );
    } catch (e: any) {
      console.error('Error loading products list:', e);
    }
  };

  const loadTransferProducts = async () => {
    if (!showTransfer.value) return; // Guard: only load when modal is open
    const fromWhId = transfer.value.from_warehouse_id;
    loadingTransferProducts.value = true;
    try {
      if (!allProducts.value.length) {
        await loadAllProducts();
      }
      const invMap = new Map();
      if (fromWhId) {
        const res = await inventoryApi.list({ warehouse_id: fromWhId });
        (res.data || []).forEach((inv: any) => {
          invMap.set(Number(inv.product_id), Number(inv.quantity || 0));
        });
      }

      transferProducts.value = allProducts.value.map((prod: any) => {
        let qty = 0;
        if (invMap.has(prod.id)) {
          qty = invMap.get(prod.id);
        } else if (prod.warehouse_breakdown && Array.isArray(prod.warehouse_breakdown)) {
          const wh = prod.warehouse_breakdown.find(
            (w: any) => Number(w.warehouse_id) === Number(fromWhId),
          );
          if (wh) qty = Number(wh.quantity || 0);
        }
        return {
          product_id: prod.id,
          id: prod.id,
          name_ar: prod.name_ar,
          sku: prod.sku,
          quantity: qty,
        };
      });
    } catch (e: any) {
      console.error('Error loading transfer products:', e);
      transferProducts.value = allProducts.value.map((prod: any) => ({
        product_id: prod.id,
        id: prod.id,
        name_ar: prod.name_ar,
        sku: prod.sku,
        quantity: 0,
      }));
    } finally {
      loadingTransferProducts.value = false;
    }
  };

  const loadTransferDestProducts = async () => {
    if (!showTransfer.value) return;
    const toWhId = transfer.value.to_warehouse_id;
    if (!toWhId) {
      transferDestProducts.value = [];
      return;
    }
    try {
      const res = await inventoryApi.list({ warehouse_id: toWhId });
      transferDestProducts.value = res.data || [];
    } catch (e: any) {
      console.error('Error loading destination products:', e);
    }
  };

  watch(
    () => transfer.value.from_warehouse_id,
    (newVal: any) => {
      if (newVal && warehouses.value.length === 2) {
        const otherWh = warehouses.value.find((w: any) => w.id !== newVal);
        if (otherWh) {
          transfer.value.to_warehouse_id = otherWh.id;
        }
      }
      loadTransferProducts();
      loadTransferDestProducts();
      transfer.value.product_id = null;
      transfer.value.to_product_id = null;
    },
  );

  watch(
    () => transfer.value.to_warehouse_id,
    () => {
      loadTransferDestProducts();
    },
  );

  watch(
    () => transfer.value.product_id,
    (newVal: any) => {
      transfer.value.to_product_id = newVal;
    },
  );

  const swapTransferDirection = () => {
    const temp = transfer.value.from_warehouse_id;
    transfer.value.from_warehouse_id = transfer.value.to_warehouse_id;
    transfer.value.to_warehouse_id = temp;
  };

  const setTransferDirection = (fromType: any, toType: any) => {
    const fromW = warehouses.value.find((w: any) =>
      fromType === 'main'
        ? w.type === 'main' || w.code === 'MAIN' || (w.name_ar && w.name_ar.includes('رئيسي'))
        : w.type === 'store' ||
          w.code === 'STORE' ||
          (w.name_ar && (w.name_ar.includes('فرع') || w.name_ar.includes('محل'))),
    );
    const toW = warehouses.value.find((w: any) =>
      toType === 'main'
        ? w.type === 'main' || w.code === 'MAIN' || (w.name_ar && w.name_ar.includes('رئيسي'))
        : w.type === 'store' ||
          w.code === 'STORE' ||
          (w.name_ar && (w.name_ar.includes('فرع') || w.name_ar.includes('محل'))),
    );
    if (fromW && toW) {
      transfer.value.from_warehouse_id = fromW.id;
      transfer.value.to_warehouse_id = toW.id;
    }
  };

  const openTransferProduct = (item: any) => {
    openTransferModal();
    setTimeout(() => {
      transfer.value.product_id = item.product_id;
      transfer.value.to_product_id = item.product_id;
    }, 100);
  };

  const openTransferModal = () => {
    if (warehouses.value.length) {
      transfer.value.from_warehouse_id = warehouses.value[0].id;
      transfer.value.to_warehouse_id = warehouses.value[1]?.id || warehouses.value[0].id;
      transfer.value.product_id = null;
      transfer.value.to_product_id = null;
      transfer.value.quantity = 1;

      showTransfer.value = true; // Set flag first so queries pass the guard
      loadTransferProducts();
      loadTransferDestProducts();
      loadAllProducts();
    } else {
      showTransfer.value = true;
    }
  };

  /** تهيئة المخازن الافتراضية للتحويل (تُستدعى بعد تحميل المخازن). */
  const setDefaultWarehouses = () => {
    if (!transfer.value.from_warehouse_id && warehouses.value?.length) {
      transfer.value.from_warehouse_id = warehouses.value[0].id;
      transfer.value.to_warehouse_id = warehouses.value[1]?.id || warehouses.value[0].id;
    }
  };

  const addBatchRow = () => {
    batchItems.value.push({ product_id: null, to_product_id: null, quantity: 1, notes: '' });
  };

  const removeBatchRow = (idx: any) => {
    if (batchItems.value.length > 1) {
      batchItems.value.splice(idx, 1);
    }
  };

  const printVoucher = () => {
    window.print();
  };

  /** إعادة بناء إذن تحويل من سطر في سجل الحركات (لإعادة الطباعة). */
  const printTransferVoucherFromMovement = (item: any) => {
    const matchCode = item.notes?.match(/TRF-\d{4}-\d+/);
    const code = matchCode ? matchCode[0] : `TRF-${item.id}`;
    currentVoucher.value = {
      transfer_number: code,
      from_warehouse_name: item.from_warehouse || 'المخزن المصدر',
      to_warehouse_name: item.to_warehouse || 'مخزن الوجهة',
      created_at: item.created_at,
      items: [
        {
          product_name: item.product_name,
          sku: item.product_sku || '',
          quantity: item.quantity,
        },
      ],
    };
    showVoucherModal.value = true;
  };

  /** تنفيذ التحويل (فردي أو إذن متعدد البنود) وإصدار الإذن. */
  const doTransfer = async () => {
    if (!transfer.value.from_warehouse_id || !transfer.value.to_warehouse_id) {
      setMsg('يرجى تحديد المخزن المصدر والوجهة.', true);
      return;
    }
    if (transfer.value.from_warehouse_id === transfer.value.to_warehouse_id) {
      setMsg('لا يمكن التحويل لنفس المخزن.', true);
      return;
    }

    let payload: Record<string, any>;

    if (transferMode.value === 'single') {
      const selectedProd = selectedTransferProduct.value;
      if (!selectedProd) {
        setMsg('يرجى اختيار منتج المصدر أولاً.', true);
        return;
      }
      if (!transfer.value.to_product_id) {
        setMsg('يرجى اختيار منتج الوجهة.', true);
        return;
      }
      if (transfer.value.quantity > Number(selectedProd.quantity)) {
        setMsg('الكمية المراد تحويلها أكبر من الكمية المتوفرة في المخزن المحدد.', true);
        return;
      }
      payload = {
        from_warehouse_id: transfer.value.from_warehouse_id,
        to_warehouse_id: transfer.value.to_warehouse_id,
        product_id: transfer.value.product_id,
        to_product_id: transfer.value.to_product_id,
        quantity: transfer.value.quantity,
        notes: 'تحويل يدوي بين المخازن',
      };
    } else {
      // Batch Mode
      const validItems = batchItems.value.filter(
        (it: any) => it.product_id && Number(it.quantity) > 0,
      );
      if (!validItems.length) {
        setMsg('يرجى تحديد منتج واحد على الأقل بكمية صحيحة.', true);
        return;
      }
      payload = {
        from_warehouse_id: transfer.value.from_warehouse_id,
        to_warehouse_id: transfer.value.to_warehouse_id,
        items: validItems.map((it: any) => ({
          product_id: it.product_id,
          to_product_id: it.to_product_id || it.product_id,
          quantity: Number(it.quantity),
          notes: it.notes || '',
        })),
      };
    }

    try {
      const res = await inventoryApi.transfer(payload);
      const fromW = warehouses.value.find((w: any) => w.id === transfer.value.from_warehouse_id);
      const toW = warehouses.value.find((w: any) => w.id === transfer.value.to_warehouse_id);

      const voucherItems =
        transferMode.value === 'single'
          ? [
              {
                product_name: selectedTransferProduct.value?.name_ar || 'منتج',
                sku: selectedTransferProduct.value?.sku || '',
                quantity: transfer.value.quantity,
              },
            ]
          : payload.items.map((it: any) => {
              const p =
                transferProducts.value.find((x: any) => x.product_id === it.product_id) ||
                allProducts.value.find((x: any) => x.id === it.product_id);
              return {
                product_name: p?.name_ar || `منتج ${it.product_id}`,
                sku: p?.sku || '',
                quantity: it.quantity,
              };
            });

      currentVoucher.value = {
        transfer_number: (res?.data as any)?.transfer_number || `TRF-${Date.now()}`,
        from_warehouse_name: fromW?.name_ar || 'المخزن المصدر',
        to_warehouse_name: toW?.name_ar || 'مخزن الوجهة',
        created_at: res?.data?.created_at || new Date().toISOString(),
        items: voucherItems,
      };

      showTransfer.value = false;
      showVoucherModal.value = true;
      setMsg('تم تنفيذ إذن التحويل بنجاح.');
      await reload();
    } catch (e: any) {
      setMsg(e.message || 'فشل تحويل المخزون.', true);
    }
  };

  return {
    movements,
    filteredMovements,
    movementsColumns,
    movementTypeFilter,
    showTransfer,
    transfer,
    transferMode,
    batchItems,
    showVoucherModal,
    currentVoucher,
    transferProducts,
    allProducts,
    loadingTransferProducts,
    selectedTransferProduct,
    selectedTransferDestProduct,
    loadMovements,
    setDefaultWarehouses,
    openTransferModal,
    openTransferProduct,
    setTransferDirection,
    swapTransferDirection,
    doTransfer,
    addBatchRow,
    removeBatchRow,
    printVoucher,
    printTransferVoucherFromMovement,
  };
}
