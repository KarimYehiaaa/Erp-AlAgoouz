<template>
  <div class="settings-page">
    <!-- Hub Navigation -->
    <div class="hub-tabs mb-4">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="hub-tab"
        :class="{ active: activeTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        <AppIcon :name="tab.icon" :size="16" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <Transition name="hub-fade" mode="out-in">
      <div :key="activeTab" class="settings-content">
        <CompanySettingsTab v-if="activeTab === 'company'" />
        <div v-else-if="activeTab === 'hr'" class="tab-view-container">
          <HrView />
        </div>
        <div v-else-if="activeTab === 'users'" class="tab-view-container">
          <UsersView />
        </div>
        <div v-else-if="activeTab === 'admin'" class="tab-view-container">
          <AdminDashboardView />
        </div>
        <CategorySettingsTab v-else-if="activeTab === 'categories'" />
        <UnitSettingsTab v-else-if="activeTab === 'units'" />
        <SoundSettingsTab v-else-if="activeTab === 'sound'" />
        <ShortcutsSettingsTab v-else-if="activeTab === 'shortcuts'" />
        <BackupSettingsTab v-else-if="activeTab === 'backup'" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import CompanySettingsTab from '@/components/settings/CompanySettingsTab.vue';
import CategorySettingsTab from '@/components/settings/CategorySettingsTab.vue';
import UnitSettingsTab from '@/components/settings/UnitSettingsTab.vue';
import SoundSettingsTab from '@/components/settings/SoundSettingsTab.vue';
import ShortcutsSettingsTab from '@/components/settings/ShortcutsSettingsTab.vue';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab.vue';
import HrView from '@/views/HrView.vue';
import UsersView from '@/views/UsersView.vue';
import AdminDashboardView from '@/views/AdminDashboardView.vue';

const route = useRoute();
const router = useRouter();

const tabs = [
  { id: 'company', icon: 'building', label: 'بيانات المحل' },
  { id: 'hr', icon: 'hr', label: 'الموظفين والرواتب' },
  { id: 'users', icon: 'users', label: 'المستخدمين والأدوار' },
  { id: 'admin', icon: 'gauge', label: 'مركز التحكم والمراقبة' },
  { id: 'categories', icon: 'categories', label: 'التصنيفات' },
  { id: 'units', icon: 'scale', label: 'وحدات القياس' },
  { id: 'sound', icon: 'sound', label: 'الصوتيات والتنبيهات' },
  { id: 'shortcuts', icon: 'shortcuts', label: 'الاختصارات السريعة' },
  { id: 'backup', icon: 'backup', label: 'النسخ الاحتياطي' },
];

const activeTab = ref((route.query.tab as string) || 'company');

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && newTab !== activeTab.value) {
      activeTab.value = String(newTab);
    }
  },
);

const switchTab = (tabId: string) => {
  activeTab.value = tabId;
  router.replace({ query: { ...route.query, tab: tabId } }).catch(() => {});
};
</script>

<style lang="scss">
@use '../styles/views/settings-page.global';
</style>
