<template>
  <section class="settings-section">
    <div class="section-title">
      <h2>لوحة الاختصارات السريعة</h2>
      <p>استخدم الاختصارات للتنقل الفوري وإنجاز المهام في ثوانٍ</p>
    </div>

    <div class="settings-card">
      <div class="form-group full-width">
        <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px">
          <input type="checkbox" v-model="shortcutsEnabled" />
          <span>تفعيل اختصارات لوحة المفاتيح العامة (Alt + key)</span>
        </label>
      </div>

      <hr class="divider" style="margin: 20px 0" />

      <h4 style="margin-bottom: 16px; font-weight: 800; color: var(--text-strong)">
        دليل الاختصارات المفعلة بالنظام:
      </h4>

      <div class="shortcut-list">
        <div v-for="s in shortcuts" :key="s.key" class="shortcut-row">
          <span>{{ s.label }}</span>
          <kbd class="kbd-key">{{ s.key }}</kbd>
        </div>
      </div>

      <div
        class="card-footer"
        style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border)"
      >
        <button class="btn btn-save" @click="saveSettingsLocally">حفظ إعدادات الاختصارات</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useAudioSettings } from '@/composables/useAudioSettings';

const { shortcutsEnabled, saveSettingsLocally } = useAudioSettings();

const shortcuts = [
  { label: 'الكاشير والمبيعات السريعة (POS)', key: 'Alt + P' },
  { label: 'الرجوع للشاشة الرئيسية (Dashboard)', key: 'Alt + D' },
  { label: 'فتح الفواتير والمدفوعات (Invoices)', key: 'Alt + I' },
  { label: 'فتح الإعدادات العامة للسيستم (Settings)', key: 'Alt + S' },
  { label: 'فتح المخازن وحركة المخزون (Inventory)', key: 'Alt + M' },
  { label: 'التركيز الفوري على حقل البحث بالكاشير', key: 'F7' },
  { label: 'حفظ الفاتورة الحالية بالكاشير مباشرة', key: 'F2' },
  { label: 'إلغاء وإفراغ سلة الكاشير بالكامل', key: 'F4' },
];
</script>

<style scoped>
.shortcut-list {
  display: grid;
  gap: 12px;
}
.shortcut-row {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  background: var(--bg-soft);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.kbd-key {
  background: var(--border-strong);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-weight: bold;
}
</style>
