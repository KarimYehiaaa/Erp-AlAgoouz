/**
 * useProductMeta — composable مشترك للتصنيفات والوحدات
 * يُستخدم في كل الـ views عشان يضمن تزامن البيانات
 */
import { ref } from 'vue';
import { products as productsApi } from '@/api';

// cache مشترك بين كل الـ views في نفس الجلسة
const _categories = ref<any[]>([]);
const _units = ref<any[]>([]);
let _loaded = false;

/**
 * composable مشترك للتصنيفات والوحدات مع cache بين الـ views (تزامن البيانات).
 * @returns {{ categories: import('vue').Ref<any[]>, units: import('vue').Ref<any[]>, loadMeta: (force?: boolean) => Promise<void>, unitLabel: (unit: any) => string, unitNames: (currentUnit?: string | null) => string[], categoryName: (id: any) => string }}
 */
export function useProductMeta() {
  const loadMeta = async (force = false) => {
    if (_loaded && !force) return;
    try {
      const [catRes, unitRes] = await Promise.all([productsApi.categories(), productsApi.units()]);
      _categories.value = catRes?.data || [];
      _units.value = unitRes?.data || [];
      _loaded = true;
    } catch (e: any) {
      console.warn('فشل تحميل التصنيفات/الوحدات:', e?.message);
    }
  };

  /**
   * unitLabel — تحويل كود الوحدة أو اسمها إلى اسم عرض
   * يدعم: الأسماء من الـ DB (قطعة، كجم...) والأكواد القديمة (count, kg, l, g, ml)
   */
  const unitLabel = (unit: any) => {
    const str = String(unit || '').trim();
    if (!str) return 'عدد';

    // أولاً: ابحث في الوحدات المحملة من الـ DB
    const found = _units.value.find(
      (u: any) => u.name_ar === str || u.name_ar.toLowerCase() === str.toLowerCase(),
    );
    if (found) return found.name_ar;

    // ثانياً: fallback للأكواد القديمة
    const legacyMap = {
      count: 'عدد',
      unit: 'عدد',
      piece: 'عدد',
      pieces: 'عدد',
      kg: 'كجم',
      kilo: 'كجم',
      g: 'جرام',
      gram: 'جرام',
      l: 'لتر',
      liter: 'لتر',
      litre: 'لتر',
      ml: 'مل',
      milli: 'مل',
    };
    return legacyMap[str.toLowerCase() as keyof typeof legacyMap] || str;
  };

  /**
   * unitNames — قائمة أسماء الوحدات للـ dropdowns
   * تضيف الوحدة الحالية لو مش موجودة في القائمة (backward compat)
   */
  const unitNames = (currentUnit = null) => {
    const names = _units.value.map((u: any) => u.name_ar).filter(Boolean);
    if (currentUnit && !names.includes(currentUnit)) {
      names.push(currentUnit);
    }
    return names.length ? names : ['قطعة', 'كجم', 'جرام', 'لتر', 'مل', 'علبة'];
  };

  /**
   * categoryName — اسم التصنيف من الـ id
   */
  const categoryName = (id: any) => {
    const cat = _categories.value.find((c: any) => c.id === id);
    return cat?.name_ar || '—';
  };

  return {
    categories: _categories,
    units: _units,
    loadMeta,
    unitLabel,
    unitNames,
    categoryName,
  };
}
