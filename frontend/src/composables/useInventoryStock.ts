/**
 * useInventoryStock — منطق تبويب "المخزون" في شاشة المخزون
 * جدول المخزون + بطاقات تقييم القيمة (الإجمالي/الرئيسي/الفرع) +
 * تعديل الكميات وتوزيع المخازن + تسجيل الهالك + استماع حدث inventory-updated.
 * استُخرج من InventoryView.vue (كان السكربت 1,564 سطرًا).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Ref } from 'vue';
import { inventory as inventoryApi } from '@/api';

/** الاعتماديات المشتركة الممرّرة من الـ view (المخازن، الرسائل، إعادة التحميل). */
export interface InventoryStockContext {
  warehouses: Ref<any[]>;
  /** فلتر المخزن المختار من رأس الصفحة (يستخدم في فحص حدث التحديث). */
  warehouseId: Ref<string>;
  setMsg: (_text: string, _isErr?: boolean) => void;
  reload: () => Promise<void>;
}

/**
 * composable تبويب المخزون — جدول + تقييم + تعديل/هالك.
 * @param {InventoryStockContext} ctx السياق المشترك من الـ view
 * @returns {{
 *   items: import('vue').Ref<any[]>,
 *   loading: import('vue').Ref<boolean>,
 *   stockColumns: any[],
 *   getItemStockValue: (item: any) => number,
 *   totalInventoryValue: import('vue').ComputedRef<number>,
 *   mainWarehouseValue: import('vue').ComputedRef<number>,
 *   branchWarehouseValue: import('vue').ComputedRef<number>,
 *   getMainQty: (item: any) => any,
 *   getBranchQty: (item: any) => any,
 *   isHighlighted: (row: any) => boolean,
 *   editForm: import('vue').Ref<any>,
 *   showEdit: import('vue').Ref<boolean>,
 *   savingEdit: import('vue').Ref<boolean>,
 *   openEdit: (row: any) => Promise<void>,
 *   saveEdit: () => Promise<void>,
 *   wastageForm: import('vue').Ref<any>,
 *   showWastage: import('vue').Ref<boolean>,
 *   savingWastage: import('vue').Ref<boolean>,
 *   openWastage: (row: any) => void,
 *   saveWastage: () => Promise<void>,
 *   loadStock: (whId: string) => Promise<void>,
 * }}
 */
export function useInventoryStock(ctx: InventoryStockContext) {
  const { warehouses, warehouseId, setMsg, reload } = ctx;

  const items = ref<any[]>([]);
  const loading = ref(false);
  const highlighted = ref<Record<string, any>>({});

  const editForm = ref({
    id: null as any,
    product_id: null as any,
    name_ar: '',
    min_stock: 0,
    warehouse_stocks: {} as Record<string, number>,
  });
  const showEdit = ref(false);
  const savingEdit = ref(false);

  const wastageForm = ref({
    product_id: null as any,
    warehouse_id: null as any,
    name_ar: '',
    current_qty: 0,
    quantity: 0,
    notes: '',
  });
  const showWastage = ref(false);
  const savingWastage = ref(false);

  /** مؤقّتات إزالة الإبراز لكل صف — تُنظّف عند إلغاء التركيب */
  const highlightTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  const stockColumns = [
    { key: 'name_ar', label: 'المنتج' },
    { key: 'sku', label: 'الكود' },
    { key: 'purchase_price', label: 'سعر الشراء' },
    { key: 'total_quantity', label: 'إجمالي الكمية' },
    { key: 'stock_value', label: 'قيمة المخزون' },
    { key: 'main_quantity', label: 'المخزن الرئيسي' },
    { key: 'branch_quantity', label: 'مخزن الفرع' },
    { key: 'min_stock', label: 'الحد الأدنى' },
    { key: 'status', label: 'الحالة' },
    { key: 'actions', label: '', align: 'right' },
  ];

  /** قيمة مخزون الصنف = الكمية الإجمالية × سعر الشراء. */
  const getItemStockValue = (item: any) => {
    const qty = Number(
      item.total_quantity !== undefined ? item.total_quantity : item.quantity || 0,
    );
    const cost = Number(item.purchase_price || 0);
    return qty * cost;
  };

  /** كمية الصنف في المخزن الرئيسي (من breakdown أو الحقل المباشر). */
  const getMainQty = (item: any) => {
    if (item.main_quantity !== undefined && item.main_quantity !== null) return item.main_quantity;
    if (item.warehouse_breakdown && Array.isArray(item.warehouse_breakdown)) {
      const mainW = item.warehouse_breakdown.find(
        (w: any) =>
          w.warehouse_type === 'main' || (w.warehouse_name && w.warehouse_name.includes('رئيسي')),
      );
      if (mainW) return mainW.quantity;
    }
    return item.warehouse_name && item.warehouse_name.includes('رئيسي') ? item.quantity : 0;
  };

  /** كمية الصنف في مخزن الفرع/المحل. */
  const getBranchQty = (item: any) => {
    if (item.branch_quantity !== undefined && item.branch_quantity !== null)
      return item.branch_quantity;
    if (item.warehouse_breakdown && Array.isArray(item.warehouse_breakdown)) {
      const branchW = item.warehouse_breakdown.find(
        (w: any) =>
          w.warehouse_type !== 'main' && (!w.warehouse_name || !w.warehouse_name.includes('رئيسي')),
      );
      if (branchW) return branchW.quantity;
    }
    return item.warehouse_name && !item.warehouse_name.includes('رئيسي') ? item.quantity : 0;
  };

  /** إجمالي تقييم رصيد المخزون (بالتكلفة). */
  const totalInventoryValue = computed(() => {
    return items.value.reduce((sum: any, i: any) => sum + getItemStockValue(i), 0);
  });

  /** قيمة مخزون المخزن الرئيسي. */
  const mainWarehouseValue = computed(() => {
    return items.value.reduce((sum: any, i: any) => {
      const qty = Number(getMainQty(i) || 0);
      const cost = Number(i.purchase_price || 0);
      return sum + qty * cost;
    }, 0);
  });

  /** قيمة مخزون الفرع/المحل. */
  const branchWarehouseValue = computed(() => {
    return items.value.reduce((sum: any, i: any) => {
      const qty = Number(getBranchQty(i) || 0);
      const cost = Number(i.purchase_price || 0);
      return sum + qty * cost;
    }, 0);
  });

  /** تحميل جدول المخزون حسب فلتر المخزن ('' = كل المخازن). */
  const loadStock = async (whId: string) => {
    loading.value = true;
    const params = whId ? { warehouse_id: whId } : {};
    try {
      const res = await inventoryApi.list(params);
      items.value = res.data || [];
    } catch (e: any) {
      items.value = [];
      throw e;
    } finally {
      loading.value = false;
    }
  };

  /** الاستماع لتحديثات المخزون من الـ views الأخرى (مثل إنتاج وصفة) مع إبراز الصف. */
  const onInventoryUpdated = (ev: any) => {
    try {
      const wid = ev?.detail?.warehouse_id;
      const pid = ev?.detail?.product_id;
      // إذا كان المستخدم مفلترًا على مخزن محدد، نعيد التحميل فقط عند التطابق
      if (!warehouseId.value || !wid || Number(warehouseId.value) === Number(wid)) {
        reload();
      }
      // إبراز صف المنتج المُنتَج للوضوح
      if (pid && wid) {
        const key = `${pid}-${wid}`;
        highlighted.value[key] = Date.now();
        // إزالة الإبراز بعد 5 ثوانٍ (مع تنظيف المؤقّت عند إلغاء التركيب)
        if (highlightTimers[key]) clearTimeout(highlightTimers[key]);
        highlightTimers[key] = setTimeout(() => {
          delete highlighted.value[key];
          highlighted.value = { ...highlighted.value };
          delete highlightTimers[key];
        }, 5000);
      }
    } catch (e: any) {
      console.warn('inventory-updated handler error', e);
    }
  };

  onMounted(() => window.addEventListener('inventory-updated', onInventoryUpdated));
  onBeforeUnmount(() => {
    window.removeEventListener('inventory-updated', onInventoryUpdated);
    Object.values(highlightTimers).forEach(clearTimeout);
  });

  /** فتح مودال تعديل الكميات وتوزيع المخازن لصف. */
  const openEdit = async (row: any) => {
    if (!warehouses.value.length) {
      try {
        const wh = await inventoryApi.warehouses();
        warehouses.value = wh.data || [];
      } catch (e: any) {
        console.error('Failed to load warehouses:', e);
      }
    }

    const stocksObj: Record<string, number> = {};
    warehouses.value.forEach((w: any) => {
      stocksObj[w.id] = 0;
    });

    const breakdownList = Array.isArray(row.warehouse_breakdown)
      ? row.warehouse_breakdown
      : typeof row.warehouse_breakdown === 'string'
        ? JSON.parse(row.warehouse_breakdown)
        : [];

    if (breakdownList.length > 0) {
      breakdownList.forEach((wb: any) => {
        if (wb.warehouse_id) {
          stocksObj[wb.warehouse_id] = Number(wb.quantity || 0);
        }
      });
    } else if (row.warehouse_id) {
      stocksObj[row.warehouse_id] = Number(row.quantity || 0);
    }

    editForm.value = {
      id: row.id,
      product_id: row.product_id,
      name_ar: row.name_ar,
      min_stock: Number(row.min_stock || 0),
      warehouse_stocks: stocksObj,
    };
    showEdit.value = true;
  };

  /** هل الصف مُبرَز حاليًا (بعد إنتاج وصفة)؟ */
  const isHighlighted = (row: any) => {
    const key = `${row.product_id}-${row.warehouse_id}`;
    return Boolean(highlighted.value[key]);
  };

  /** حفظ تعديل الحد الأدنى وتوزيع الكميات على المخازن. */
  const saveEdit = async () => {
    const min_stock = Number(editForm.value.min_stock);
    if (isNaN(min_stock) || min_stock < 0) {
      setMsg('أدخل حد أدنى صحيح للمخزون.', true);
      return;
    }
    savingEdit.value = true;
    try {
      const whEntries = Object.entries(editForm.value.warehouse_stocks || {});
      for (let i = 0; i < whEntries.length; i++) {
        const [whIdStr, qtyVal] = whEntries[i]!;
        const whId = Number(whIdStr);
        const targetQty = Number(qtyVal || 0);
        await inventoryApi.adjust({
          product_id: editForm.value.product_id,
          warehouse_id: whId,
          quantity: targetQty,
          min_stock: i === 0 ? min_stock : undefined,
          notes: 'تعديل يدوي من شاشة المخزون',
        });
      }
      showEdit.value = false;
      setMsg(`تم حفظ تعديل مخزون ${editForm.value.name_ar} بنجاح.`);
      await reload();
    } catch (e: any) {
      setMsg(e.message || 'فشل حفظ التعديل.', true);
    } finally {
      savingEdit.value = false;
    }
  };

  /** فتح مودال تسجيل هالك لصف. */
  const openWastage = (row: any) => {
    wastageForm.value = {
      product_id: row.product_id,
      warehouse_id: row.warehouse_id,
      name_ar: row.name_ar,
      current_qty: Number(row.quantity || 0),
      quantity: 0,
      notes: '',
    };
    showWastage.value = true;
  };

  /** حفظ تسجيل الهالك (إنقاص الكمية من المخزن). */
  const saveWastage = async () => {
    const qty = Number(wastageForm.value.quantity);
    if (isNaN(qty) || qty <= 0 || qty > wastageForm.value.current_qty) {
      setMsg('الكمية غير صحيحة أو أكبر من المتاح.', true);
      return;
    }
    savingWastage.value = true;
    try {
      const targetQty = wastageForm.value.current_qty - qty;
      await inventoryApi.adjust({
        product_id: wastageForm.value.product_id,
        warehouse_id: wastageForm.value.warehouse_id,
        quantity: targetQty,
        movement_type: 'wastage',
        notes: wastageForm.value.notes,
      });
      showWastage.value = false;
      setMsg(`تم تسجيل هالك لـ ${wastageForm.value.name_ar} بنجاح.`);
      await reload();
    } catch (e: any) {
      setMsg(e.message || 'فشل تسجيل الهالك.', true);
    } finally {
      savingWastage.value = false;
    }
  };

  return {
    items,
    loading,
    stockColumns,
    getItemStockValue,
    totalInventoryValue,
    mainWarehouseValue,
    branchWarehouseValue,
    getMainQty,
    getBranchQty,
    isHighlighted,
    editForm,
    showEdit,
    savingEdit,
    openEdit,
    saveEdit,
    wastageForm,
    showWastage,
    savingWastage,
    openWastage,
    saveWastage,
    loadStock,
  };
}
