<template>
  <div id="desktop-pos-root" dir="rtl">
    <router-view />
  </div>
</template>

<script setup lang="ts">
</script>

<style lang="scss">
@import './styles/pos-theme.scss';

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'Cairo', 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  user-select: none;
}

body, html, #desktop-pos-root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-main, #1c1917);
  color: var(--text-main, #f5f5f4);
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
