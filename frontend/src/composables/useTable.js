/**
 * useTable — composable لإدارة حالة الجداول
 *
 * يتولى:
 * - pagination (page, perPage, total)
 * - sorting (sortKey, sortDir)
 * - local search/filter
 * - row selection (single / multi)
 * - computed filteredRows + paginatedRows
 */
import { ref, computed, watch } from 'vue';

/**
 * @param {Object} options
 * @param {Ref<Array>} options.rows       - البيانات الكاملة (ref)
 * @param {number}  options.defaultPerPage - عدد الصفوف في الصفحة (افتراضي: 25)
 * @param {Array}   options.searchFields   - حقول البحث المحلي ['name_ar', 'code']
 * @param {Function} options.customFilter  - فلتر إضافي (row) => boolean
 */
export function useTable(options = {}) {
  const { rows, defaultPerPage = 25, searchFields = [], customFilter = null } = options;

  // ─── State ─────────────────────────────────────────────────────
  const page = ref(1);
  const perPage = ref(defaultPerPage);
  const search = ref('');
  const sortKey = ref('');
  const sortDir = ref('asc'); // 'asc' | 'desc'
  const selectedIds = ref(new Set());

  // ─── Reset page when search/filter changes ──────────────────────
  watch([search], () => {
    page.value = 1;
  });

  // ─── Filtered Rows ──────────────────────────────────────────────
  const filteredRows = computed(() => {
    const source = rows?.value ?? [];
    let result = source;

    // بحث محلي
    const q = search.value.trim().toLowerCase();
    if (q && searchFields.length) {
      result = result.filter((row) =>
        searchFields.some((field) => {
          const val = field.split('.').reduce((obj, k) => obj?.[k], row);
          return String(val ?? '')
            .toLowerCase()
            .includes(q);
        }),
      );
    }

    // فلتر إضافي
    if (customFilter) {
      result = result.filter(customFilter);
    }

    // ترتيب
    if (sortKey.value) {
      const key = sortKey.value;
      const dir = sortDir.value === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = a[key] ?? '';
        const bv = b[key] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * dir;
        }
        return String(av).localeCompare(String(bv), 'ar') * dir;
      });
    }

    return result;
  });

  // ─── Pagination ─────────────────────────────────────────────────
  const totalRows = computed(() => filteredRows.value.length);
  const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / perPage.value)));

  const paginatedRows = computed(() => {
    const start = (page.value - 1) * perPage.value;
    return filteredRows.value.slice(start, start + perPage.value);
  });

  const goToPage = (p) => {
    page.value = Math.max(1, Math.min(p, totalPages.value));
  };
  const nextPage = () => goToPage(page.value + 1);
  const prevPage = () => goToPage(page.value - 1);

  // ─── Sorting ────────────────────────────────────────────────────
  const toggleSort = (key) => {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey.value = key;
      sortDir.value = 'asc';
    }
    page.value = 1;
  };

  const sortIcon = (key) => {
    if (sortKey.value !== key) return '↕';
    return sortDir.value === 'asc' ? '↑' : '↓';
  };

  // ─── Selection ──────────────────────────────────────────────────
  const isSelected = (id) => selectedIds.value.has(id);
  const toggleRow = (id) => {
    const s = new Set(selectedIds.value);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    selectedIds.value = s;
  };

  const allSelected = computed(
    () =>
      paginatedRows.value.length > 0 &&
      paginatedRows.value.every((r) => selectedIds.value.has(r.id)),
  );

  const toggleAll = () => {
    const s = new Set(selectedIds.value);
    if (allSelected.value) {
      paginatedRows.value.forEach((r) => s.delete(r.id));
    } else {
      paginatedRows.value.forEach((r) => s.add(r.id));
    }
    selectedIds.value = s;
  };

  const clearSelection = () => {
    selectedIds.value = new Set();
  };
  const selectedCount = computed(() => selectedIds.value.size);
  const selectedItems = computed(() =>
    (rows?.value ?? []).filter((r) => selectedIds.value.has(r.id)),
  );

  // ─── Reset ──────────────────────────────────────────────────────
  const resetTable = () => {
    page.value = 1;
    search.value = '';
    sortKey.value = '';
    sortDir.value = 'asc';
    clearSelection();
  };

  return {
    // state
    page,
    perPage,
    search,
    sortKey,
    sortDir,
    selectedIds,
    // computed
    filteredRows,
    paginatedRows,
    totalRows,
    totalPages,
    allSelected,
    selectedCount,
    selectedItems,
    // methods
    goToPage,
    nextPage,
    prevPage,
    toggleSort,
    sortIcon,
    isSelected,
    toggleRow,
    toggleAll,
    clearSelection,
    resetTable,
  };
}
