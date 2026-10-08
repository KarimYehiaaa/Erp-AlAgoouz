<template>
  <InteractiveBackground />
  <router-view />
  <ToastContainer />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import InteractiveBackground from '@/components/InteractiveBackground.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import { useShortcuts } from '@/composables/useShortcuts';

const appStore = useAppStore();
useShortcuts();
onMounted(() => {
  appStore.initTheme();
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
});
</script>
