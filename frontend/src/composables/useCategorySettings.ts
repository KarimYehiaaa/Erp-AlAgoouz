import { ref } from 'vue';
import { products as productApi } from '@/api';
import { useProductMeta } from '@/composables/useProductMeta';

/**
 * إدارة التصنيفات (الإضافة/التعديل/الحذف) مع تحديث كاش بيانات المنتجات بعد كل تغيير
 * حتى تظهر التصنيفات الجديدة فورًا في كل الشاشات.
 */
export function useCategorySettings() {
  const { loadMeta: refreshMetaCache } = useProductMeta();
  const categories = ref<any[]>([]);
  const newCategoryName = ref('');
  const categoryEditing = ref<any>(null);
  const editCategoryName = ref('');
  const categorySaving = ref(false);

  /** إعادة تحميل التصنيفات من الخادم ثم تحديث كاش المنتجات. */
  const refreshCategories = async () => {
    try {
      categories.value = (await productApi.categories())?.data || [];
      await refreshMetaCache(true);
    } catch {
      categories.value = [];
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.value.trim()) return;
    categorySaving.value = true;
    try {
      await productApi.createCategory({ name_ar: newCategoryName.value.trim() });
      newCategoryName.value = '';
      await refreshCategories();
    } catch (e: any) {
      alert(e.message || 'فشل إضافة التصنيف');
    } finally {
      categorySaving.value = false;
    }
  };

  const startEditCategory = (c: any) => {
    categoryEditing.value = c.id;
    editCategoryName.value = c.name_ar;
  };

  const cancelEditCategory = () => {
    categoryEditing.value = null;
    editCategoryName.value = '';
  };

  const saveCategory = async (c: any) => {
    if (!editCategoryName.value.trim()) {
      cancelEditCategory();
      return;
    }
    categorySaving.value = true;
    try {
      await productApi.updateCategory(c.id, {
        name_ar: editCategoryName.value.trim(),
        slug: editCategoryName.value.trim().replace(/\s+/g, '-'),
      });
      cancelEditCategory();
      await refreshCategories();
    } catch (e: any) {
      alert(e.message || 'فشل التعديل');
    } finally {
      categorySaving.value = false;
    }
  };

  const deleteCategory = async (id: any) => {
    if (!confirm('هل تريد حذف هذا التصنيف؟')) return;
    categorySaving.value = true;
    try {
      await productApi.deleteCategory(id);
      await refreshCategories();
    } catch (e: any) {
      alert(e.message || 'فشل الحذف');
    } finally {
      categorySaving.value = false;
    }
  };

  return {
    categories,
    newCategoryName,
    categoryEditing,
    editCategoryName,
    categorySaving,
    refreshCategories,
    addCategory,
    startEditCategory,
    cancelEditCategory,
    saveCategory,
    deleteCategory,
  };
}
