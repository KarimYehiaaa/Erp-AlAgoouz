<template>
  <section class="settings-section">
    <div class="section-title">
      <h2>تصنيفات المنتجات</h2>
      <p>التصنيفات تساعد في تنظيم المنتجات وتصفيتها في التقارير</p>
    </div>

    <div class="settings-card">
      <div class="add-row">
        <input
          v-model="newCategoryName"
          placeholder="اسم التصنيف الجديد..."
          class="add-input"
          @keyup.enter="addCategory"
          :disabled="!canEdit"
        />
        <button
          class="btn btn-add"
          :disabled="categorySaving || !newCategoryName.trim() || !canEdit"
          @click="addCategory"
        >
          <AppIcon name="add" :size="16" /> إضافة
        </button>
      </div>

      <div class="data-table">
        <div class="data-table-head">
          <span>التصنيف</span>
          <span class="col-num">المنتجات</span>
          <span v-if="canEdit" class="col-actions">الإجراءات</span>
        </div>
        <div v-if="!categories.length" class="data-table-empty">
          لا توجد تصنيفات — أضف أول تصنيف أعلاه
        </div>
        <div v-for="cat in categories" :key="cat.id" class="data-table-row">
          <div class="cell-name">
            <span class="dot primary"></span>
            <template v-if="categoryEditing === cat.id">
              <input
                v-model="editCategoryName"
                class="inline-input"
                @keyup.enter="saveCategory(cat)"
                @keyup.escape="cancelEditCategory"
              />
            </template>
            <strong v-else>{{ cat.name_ar }}</strong>
          </div>
          <span class="col-num">
            <span class="badge">{{ cat.products_count || 0 }}</span>
          </span>
          <div v-if="canEdit" class="col-actions row-actions">
            <template v-if="categoryEditing === cat.id">
              <button
                v-permission="'settings.manage'"
                class="action-btn save"
                :disabled="categorySaving"
                @click="saveCategory(cat)"
              >
                حفظ
              </button>
              <button class="action-btn" @click="cancelEditCategory">إلغاء</button>
            </template>
            <template v-else>
              <button class="icon-btn edit" @click="startEditCategory(cat)">
                <AppIcon name="edit" :size="14" />
              </button>
              <button
                v-permission="'settings.manage'"
                class="icon-btn danger"
                :disabled="categorySaving"
                @click="deleteCategory(cat.id)"
              >
                <AppIcon name="delete" :size="14" />
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { useCategorySettings } from '@/composables/useCategorySettings';

const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasPermission('settings.manage'));
const {
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
} = useCategorySettings();

onMounted(() => refreshCategories());
</script>
