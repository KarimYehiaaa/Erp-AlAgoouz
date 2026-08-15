<template>
  <InteractiveBackground />
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppStore } from '@/stores/app';
import InteractiveBackground from '@/components/InteractiveBackground.vue';

const appStore = useAppStore();
onMounted(() => {
  appStore.initTheme();
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
});
</script>
