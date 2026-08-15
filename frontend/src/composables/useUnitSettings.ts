import { ref } from 'vue';
import { products as productApi } from '@/api';
import { useProductMeta } from '@/composables/useProductMeta';

/**
 * إدارة وحدات القياس (الإضافة/التعديل/الحذف) مع تحديث كاش بيانات المنتجات بعد كل تغيير.
 */
export function useUnitSettings() {
  const { loadMeta: refreshMetaCache } = useProductMeta();
  const productUnits = ref<any[]>([]);
  const newUnit = ref('');
  const unitSaving = ref(false);
  const unitEditing = ref<any>(null);
  const editUnitName = ref('');

  /** إعادة تحميل الوحدات من الخادم ثم تحديث كاش المنتجات. */
  const refreshProductUnits = async () => {
    try {
      productUnits.value = (await productApi.units())?.data || [];
      await refreshMetaCache(true);
    } catch {
      productUnits.value = [];
    }
  };

  const addUnit = async () => {
    if (!newUnit.value.trim()) return;
    unitSaving.value = true;
    try {
      await productApi.createUnit({ name_ar: newUnit.value.trim() });
      newUnit.value = '';
      await refreshProductUnits();
    } catch (e: any) {
      alert(e.message || 'فشل إضافة الوحدة');
    } finally {
      unitSaving.value = false;
    }
  };

  const startEditUnit = (u: any) => {
    unitEditing.value = u.id;
    editUnitName.value = u.name_ar;
  };

  const cancelEditUnit = () => {
    unitEditing.value = null;
    editUnitName.value = '';
  };

  const saveUnit = async (u: any) => {
    if (!editUnitName.value.trim() || editUnitName.value === u.name_ar) {
      cancelEditUnit();
      return;
    }
    unitSaving.value = true;
    try {
      await productApi.updateUnit(u.id, { name_ar: editUnitName.value.trim() });
      cancelEditUnit();
      await refreshProductUnits();
    } catch (e: any) {
      alert(e.message || 'فشل التعديل');
    } finally {
      unitSaving.value = false;
    }
  };

  const removeUnit = async (u: any) => {
    if (!confirm(`هل تريد حذف وحدة "${u.name_ar}"؟`)) return;
    unitSaving.value = true;
    try {
      await productApi.deleteUnit(u.id);
      await refreshProductUnits();
    } catch (e: any) {
      alert(e.message || 'فشل الحذف');
    } finally {
      unitSaving.value = false;
    }
  };

  return {
    productUnits,
    newUnit,
    unitSaving,
    unitEditing,
    editUnitName,
    refreshProductUnits,
    addUnit,
    startEditUnit,
    cancelEditUnit,
    saveUnit,
    removeUnit,
  };
}
