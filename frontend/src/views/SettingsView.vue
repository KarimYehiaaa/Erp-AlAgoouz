<template>
  <div class="settings-page">
    <nav class="settings-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="settings-nav-item"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <span class="nav-icon">{{ tab.icon }}</span>
        <span class="nav-label">{{ tab.label }}</span>
      </button>
    </nav>

    <div class="settings-content">
      <CompanySettingsTab v-if="activeTab === 'company'" />
      <CategorySettingsTab v-else-if="activeTab === 'categories'" />
      <UnitSettingsTab v-else-if="activeTab === 'units'" />
      <SoundSettingsTab v-else-if="activeTab === 'sound'" />
      <ShortcutsSettingsTab v-else-if="activeTab === 'shortcuts'" />
      <BackupSettingsTab v-else-if="activeTab === 'backup'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import CompanySettingsTab from '@/components/settings/CompanySettingsTab.vue';
import CategorySettingsTab from '@/components/settings/CategorySettingsTab.vue';
import UnitSettingsTab from '@/components/settings/UnitSettingsTab.vue';
import SoundSettingsTab from '@/components/settings/SoundSettingsTab.vue';
import ShortcutsSettingsTab from '@/components/settings/ShortcutsSettingsTab.vue';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab.vue';

const tabs = [
  { id: 'company', icon: '🏢', label: 'بيانات المحل' },
  { id: 'categories', icon: '🏷️', label: 'التصنيفات' },
  { id: 'units', icon: '⚖️', label: 'وحدات القياس' },
  { id: 'sound', icon: '🔔', label: 'الصوتيات والتنبيهات' },
  { id: 'shortcuts', icon: '⌨️', label: 'الاختصارات السريعة' },
  { id: 'backup', icon: '💾', label: 'النسخ الاحتياطي' },
];
const activeTab = ref('company');
</script>

<style lang="scss">
@use '../styles/views/settings-page.global';
</style>
