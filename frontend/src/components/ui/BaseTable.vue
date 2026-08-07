<template>
  <div class="base-table-wrap" :class="{ 'is-loading': loading, 'density-compact': compact }">

    <!-- Toolbar -->
    <div v-if="showToolbar" class="bt-toolbar">
      <!-- Search -->
      <div v-if="searchable" class="bt-search-wrap">
        <AppIcon name="search" class="bt-search-icon" />
        <input
          v-model="internalSearch"
          type="text"
          class="bt-search"
          :placeholder="searchPlaceholder || 'بحث...'"
          @input="$emit('update:search', internalSearch)"
        />
        <button v-if="internalSearch" class="bt-search-clear" type="button" @click="internalSearch = ''; $emit('update:search', '')">
          <AppIcon name="close" :size="14" />
        </button>
      </div>

      <!-- Slot: extra toolbar actions -->
      <div class="bt-toolbar-end">
        <slot name="toolbar" />

        <!-- Column Visibility -->
        <div v-if="showColumnToggle" class="bt-col-toggle" ref="colToggleRoot">
          <button class="icon-btn" type="button" title="إظهار/إخفاء أعمدة" @click.stop="colMenuOpen = !colMenuOpen">
            <AppIcon name="settings" :size="16" />
          </button>
          <transition name="fade">
            <div v-if="colMenuOpen" class="bt-col-menu">
              <label v-for="col in toggleableColumns" :key="col.key" class="bt-col-item">
                <input type="checkbox" v-model="hiddenCols" :value="col.key" true-value="false" false-value="true" />
                {{ col.label }}
              </label>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- Bulk Actions Bar -->
    <transition name="slide-down">
      <div v-if="selectedCount > 0" class="bt-bulk-bar">
        <span class="bt-bulk-count">تم تحديد <strong>{{ selectedCount }}</strong> عنصر</span>
        <slot name="bulk-actions" :selectedItems="selectedItems" :clearSelection="clearSelection" />
        <button class="btn btn-sm btn-ghost" type="button" @click="clearSelection">إلغاء التحديد</button>
      </div>
    </transition>

    <!-- Table Container -->
    <div class="bt-container" :style="maxHeight ? `max-height: ${maxHeight}; overflow-y: auto;` : ''">
      <table class="bt-table" :class="tableClass">
        <thead class="bt-head">
          <tr>
            <!-- Checkbox Column -->
            <th v-if="selectable" class="bt-th bt-th-check">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="selectedCount > 0 && !allSelected"
                @change="toggleAll"
              />
            </th>

            <!-- Data Columns -->
            <th
              v-for="col in visibleColumns"
              :key="col.key"
              class="bt-th"
              :class="[col.align ? `text-${col.align}` : '', col.sortable !== false && sortable ? 'bt-th-sortable' : '']"
              :style="col.width ? `width: ${col.width}` : ''"
              @click="col.sortable !== false && sortable ? $emit('sort', col.key) : null"
            >
              <span class="bt-th-inner">
                {{ col.label }}
                <span v-if="col.sortable !== false && sortable" class="bt-sort-icon" :class="{ active: activeSortKey === col.key }">
                  {{ activeSortKey === col.key ? (activeSortDir === 'asc' ? '↑' : '↓') : '↕' }}
                </span>
              </span>
            </th>

            <!-- Actions Column -->
            <th v-if="hasActionsSlot" class="bt-th bt-th-actions">إجراءات</th>
          </tr>
        </thead>

        <tbody class="bt-body">
          <!-- Loading Skeleton -->
          <template v-if="loading && !displayRows.length">
            <tr v-for="i in skeletonRows" :key="`sk-${i}`" class="bt-row bt-row-skeleton">
              <td v-if="selectable" class="bt-td bt-td-check">
                <span class="skel" style="width:16px;height:16px;border-radius:3px" />
              </td>
              <td v-for="col in visibleColumns" :key="col.key" class="bt-td">
                <span class="skel" :style="`width: ${Math.random() * 40 + 50}%; height: 14px;`" />
              </td>
              <td v-if="hasActionsSlot" class="bt-td bt-td-actions">
                <span class="skel" style="width:60px;height:28px;border-radius:6px" />
              </td>
            </tr>
          </template>

          <!-- Empty State -->
          <tr v-else-if="!displayRows.length" class="bt-row-empty">
            <td :colspan="colSpan" class="bt-td-empty">
              <slot name="empty">
                <DataEmptyState :title="emptyTitle" :message="emptyMessage" :icon="emptyIcon" />
              </slot>
            </td>
          </tr>

          <!-- Data Rows -->
          <tr
            v-else
            v-for="(row, index) in displayRows"
            :key="row.id ?? index"
            class="bt-row"
            :class="[
              rowClass ? rowClass(row) : '',
              isSelected(row.id) ? 'bt-row-selected' : '',
              clickable ? 'bt-row-clickable' : '',
            ]"
            @click="clickable ? $emit('row-click', row) : null"
          >
            <!-- Checkbox -->
            <td v-if="selectable" class="bt-td bt-td-check" @click.stop="toggleRow(row.id)">
              <input type="checkbox" :checked="isSelected(row.id)" @change="toggleRow(row.id)" />
            </td>

            <!-- Data Cells -->
            <td
              v-for="col in visibleColumns"
              :key="col.key"
              class="bt-td"
              :class="col.align ? `text-${col.align}` : ''"
            >
              <!-- Custom slot per column -->
              <slot :name="`cell-${col.key}`" :row="row" :item="row" :value="getCellValue(row, col)" :index="index">
                <!-- Default: formatted value -->
                <span :class="col.cellClass ? col.cellClass(row) : ''" v-html="formatCell(row, col)" />
              </slot>
            </td>

            <!-- Actions -->
            <td v-if="hasActionsSlot" class="bt-td bt-td-actions" @click.stop>
              <slot name="actions" :row="row" :item="row" :index="index" />
            </td>
          </tr>
        </tbody>

        <!-- Footer / Totals -->
        <tfoot v-if="$slots.footer" class="bt-foot">
          <slot name="footer" />
        </tfoot>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="paginated && totalPages > 1" class="bt-pagination">
      <span class="bt-page-info">
        عرض {{ pageStart }}–{{ pageEnd }} من {{ totalRows }} عنصر
      </span>
      <div class="bt-page-controls">
        <button class="bt-page-btn" type="button" :disabled="currentPage <= 1" @click="$emit('page-change', currentPage - 1)">
          <AppIcon name="arrowRight" :size="14" />
        </button>
        <button
          v-for="p in pagesToShow"
          :key="p"
          class="bt-page-btn"
          type="button"
          :class="{ active: p === currentPage, ellipsis: p === '...' }"
          :disabled="p === '...'"
          @click="p !== '...' && $emit('page-change', p)"
        >{{ p }}</button>
        <button class="bt-page-btn" type="button" :disabled="currentPage >= totalPages" @click="$emit('page-change', currentPage + 1)">
          <AppIcon name="arrowLeft" :size="14" />
        </button>
      </div>
      <select class="bt-per-page" :value="perPage" @change="$emit('per-page-change', Number($event.target.value))">
        <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }} / صفحة</option>
      </select>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, useSlots, onMounted, onBeforeUnmount } from 'vue';
import DataEmptyState from './DataEmptyState.vue';

const props = defineProps({
  /** مصفوفة الصفوف الحالية (بعد الـ pagination من الـ parent أو الـ composable) */
  rows: { type: Array, default: () => [] },
  /** اسم بديل للـ rows لضمان التوافق مع الشاشات التي تعتمد على :items */
  items: { type: Array, default: null },

  /** تعريف الأعمدة:
   * { key, label, sortable?, align?, width?, format?: (val, row) => string, cellClass?: (row) => string }
   */
  columns: { type: Array, required: true },

  loading: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
  sortable: { type: Boolean, default: true },
  searchable: { type: Boolean, default: false },
  paginated: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showColumnToggle: { type: Boolean, default: false },

  // Pagination props (لو الـ pagination من الـ parent)
  currentPage: { type: Number, default: 1 },
  totalRows: { type: Number, default: 0 },
  perPage: { type: Number, default: 25 },
  totalPages: { type: Number, default: 1 },

  // Sort
  activeSortKey: { type: String, default: '' },
  activeSortDir: { type: String, default: 'asc' },

  // Selection (من useTable composable)
  selectedCount: { type: Number, default: 0 },
  selectedItems: { type: Array, default: () => [] },
  allSelected: { type: Boolean, default: false },
  isSelected: { type: Function, default: () => false },
  toggleRow: { type: Function, default: () => {} },
  toggleAll: { type: Function, default: () => {} },
  clearSelection: { type: Function, default: () => {} },

  // Search (يمكن ربطه بـ v-model:search)
  search: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '' },

  // Misc
  maxHeight: { type: String, default: '' },
  tableClass: { type: String, default: '' },
  rowClass: { type: Function, default: null },
  skeletonRows: { type: Number, default: 6 },
  emptyTitle: { type: String, default: 'لا توجد بيانات' },
  emptyMessage: { type: String, default: 'لم يتم العثور على نتائج مطابقة.' },
  emptyIcon: { type: String, default: 'inventory' },
});

const emit = defineEmits(['update:search', 'sort', 'row-click', 'page-change', 'per-page-change']);
const slots = useSlots();

const displayRows = computed(() => (props.items !== null && props.items !== undefined) ? props.items : props.rows);

const internalSearch = ref(props.search);
const colMenuOpen = ref(false);
const colToggleRoot = ref(null);
const hiddenCols = ref([]);

const showToolbar = computed(() => props.searchable || props.showColumnToggle || slots.toolbar);
const hasActionsSlot = computed(() => !!slots.actions);

const toggleableColumns = computed(() => props.columns.filter((c) => c.toggleable !== false));
const visibleColumns = computed(() =>
  props.columns.filter((c) => !hiddenCols.value.includes(c.key))
);
const colSpan = computed(() => visibleColumns.value.length + (props.selectable ? 1 : 0) + (hasActionsSlot.value ? 1 : 0));

const pageStart = computed(() => Math.min((props.currentPage - 1) * props.perPage + 1, props.totalRows));
const pageEnd = computed(() => Math.min(props.currentPage * props.perPage, props.totalRows));

const pagesToShow = computed(() => {
  const total = props.totalPages;
  const cur = props.currentPage;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  if (cur > 3) { pages.push(1, '...'); }
  for (let p = Math.max(1, cur - 2); p <= Math.min(total, cur + 2); p++) pages.push(p);
  if (cur < total - 2) { pages.push('...', total); }
  return pages;
});

const getCellValue = (row, col) => {
  return col.key.split('.').reduce((obj, k) => obj?.[k], row);
};

const formatCell = (row, col) => {
  const val = getCellValue(row, col);
  if (col.format) return col.format(val, row);
  if (val === null || val === undefined || val === '') return '<span class="text-muted">—</span>';
  return String(val);
};

// Close col menu on outside click
const handleOutsideClick = (e) => {
  if (colToggleRoot.value && !colToggleRoot.value.contains(e.target)) {
    colMenuOpen.value = false;
  }
};
onMounted(() => document.addEventListener('click', handleOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick));
</script>

<style lang="scss" scoped>
.base-table-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
}

/* ── Toolbar ──────────────────────────────────────────────────── */
.bt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  flex-wrap: wrap;
}

.bt-toolbar-end {
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bt-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 180px;
  max-width: 320px;
}

.bt-search-icon {
  position: absolute;
  right: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.bt-search {
  width: 100%;
  padding: 7px 34px 7px 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 0.84rem;
  &:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
  }
}

.bt-search-clear {
  position: absolute;
  left: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 50%;
  &:hover { color: var(--text); background: var(--border); }
}

/* Column Toggle */
.bt-col-toggle { position: relative; }
.bt-col-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 180px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 8px;
  z-index: 200;
}
.bt-col-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 0.82rem;
  border-radius: var(--radius-sm);
  &:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
  input { cursor: pointer; }
}

/* ── Bulk Bar ─────────────────────────────────────────────────── */
.bt-bulk-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated));
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
  font-size: 0.84rem;
  flex-wrap: wrap;
}
.bt-bulk-count { color: var(--text-muted); margin-left: auto; }

/* ── Table ────────────────────────────────────────────────────── */
.bt-container { overflow-x: auto; }

.bt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

/* Head */
.bt-head { position: sticky; top: 0; z-index: 10; }
.bt-th {
  padding: 10px 14px;
  text-align: right;
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
  user-select: none;

  &.bt-th-sortable { cursor: pointer;
    &:hover { color: var(--primary); }
  }
  &.bt-th-check, &.bt-th-actions { width: 48px; text-align: center; }
}

.bt-th-inner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.bt-sort-icon {
  font-size: 0.7rem;
  color: var(--text-muted);
  transition: color 0.15s;
  &.active { color: var(--primary); }
}

/* Rows */
.bt-row {
  transition: background 0.12s;
  &:hover { background: color-mix(in srgb, var(--primary) 4%, transparent); }
  &.bt-row-selected { background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated)); }
  &.bt-row-clickable { cursor: pointer; }
}

.bt-td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  vertical-align: middle;

  &.bt-td-check, &.bt-td-actions { text-align: center; white-space: nowrap; }
}

.bt-row-empty .bt-td-empty { padding: 40px 20px; }

/* Skeleton */
.bt-row-skeleton .bt-td { animation: skeleton-pulse 1.4s ease-in-out infinite; }
.skel {
  display: inline-block;
  border-radius: 4px;
  background: var(--border);
}
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Pagination ───────────────────────────────────────────────── */
.bt-pagination {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  flex-wrap: wrap;
}

.bt-page-info {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-left: auto;
}

.bt-page-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bt-page-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.82rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover:not(:disabled):not(.ellipsis) {
    border-color: var(--primary);
    color: var(--primary);
  }
  &.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
    font-weight: 700;
  }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &.ellipsis { border: 0; background: transparent; cursor: default; }
}

.bt-per-page {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 0.78rem;
  cursor: pointer;
}

/* ── Density ──────────────────────────────────────────────────── */
.density-compact {
  .bt-th { padding: 7px 10px; font-size: 0.72rem; }
  .bt-td { padding: 7px 10px; font-size: 0.81rem; }
}

/* ── Transitions ──────────────────────────────────────────────── */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.2s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-8px); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── Utility ──────────────────────────────────────────────────── */
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-muted { color: var(--text-muted); }
</style>
