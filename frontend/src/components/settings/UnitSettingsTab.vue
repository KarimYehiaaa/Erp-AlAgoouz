<template>
  <section class="settings-section">
    <div class="section-title">
      <h2>وحدات القياس</h2>
      <p>الوحدات تُستخدم في المنتجات والمشتريات والوصفات</p>
    </div>

    <div class="settings-card">
      <div class="add-row">
        <input
          v-model="newUnit"
          placeholder="مثل: كجم، لتر، قطعة، علبة..."
          class="add-input"
          @keyup.enter="addUnit"
          :disabled="!canEdit"
        />
        <button
          class="btn btn-add"
          :disabled="unitSaving || !newUnit.trim() || !canEdit"
          @click="addUnit"
        >
          <AppIcon name="add" :size="16" /> إضافة
        </button>
      </div>

      <div class="data-table">
        <div class="data-table-head">
          <span>الوحدة</span>
          <span class="col-num">المنتجات</span>
          <span v-if="canEdit" class="col-actions">الإجراءات</span>
        </div>
        <div v-if="!productUnits.length" class="data-table-empty">
          لا توجد وحدات — أضف أول وحدة أعلاه
        </div>
        <div v-for="unit in productUnits" :key="unit.id" class="data-table-row">
          <div class="cell-name">
            <span class="dot accent"></span>
            <template v-if="unitEditing === unit.id">
              <input
                v-model="editUnitName"
                class="inline-input"
                @keyup.enter="saveUnit(unit)"
                @keyup.escape="cancelEditUnit"
              />
            </template>
            <strong v-else>{{ unit.name_ar }}</strong>
          </div>
          <span class="col-num">
            <span class="badge">{{ unit.products_count || 0 }}</span>
          </span>
          <div v-if="canEdit" class="col-actions row-actions">
            <template v-if="unitEditing === unit.id">
              <button
                v-permission="'settings.manage'"
                class="action-btn save"
                :disabled="unitSaving"
                @click="saveUnit(unit)"
              >
                حفظ
              </button>
              <button class="action-btn" @click="cancelEditUnit">إلغاء</button>
            </template>
            <template v-else>
              <button class="icon-btn edit" @click="startEditUnit(unit)">
                <AppIcon name="edit" :size="14" />
              </button>
              <button
                v-permission="'settings.manage'"
                class="icon-btn danger"
                :disabled="unitSaving"
                @click="removeUnit(unit)"
              >
                <AppIcon name="delete" :size="14" />
              </button>
            </template>
          </div>
        </div>
      </div>
      <p class="hint mt-12">
        حذف وحدة لن يؤثر على المنتجات المرتبطة بها — فقط يزيلها من قائمة الاختيار.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { useUnitSettings } from '@/composables/useUnitSettings';

const authStore = useAuthStore();
const canEdit = computed(() => authStore.hasPermission('settings.manage'));
const {
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
} = useUnitSettings();

onMounted(() => refreshProductUnits());
</script>
