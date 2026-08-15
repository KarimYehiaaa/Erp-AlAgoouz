<template>
  <img
    :src="logoSrc"
    alt="بن العجوز"
    class="app-logo"
    :class="[`size-${size}`, { rounded }]"
    @error="onError"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps({
  size: { type: String, default: 'md' },
  rounded: { type: Boolean, default: true },
});

// Use the official Al-Agoouz brand logo
const logoSrc = ref('/logo.png');
const onError = () => {
  if (logoSrc.value !== '/logo.svg') logoSrc.value = '/logo.svg';
};
</script>

<style lang="scss" scoped>
.app-logo {
  object-fit: contain;
  display: block;
  transition: all 0.3s ease;

  &.rounded {
    border-radius: var(--radius-sm);
  }
  &.size-sm {
    width: 36px;
    height: 36px;
  }
  &.size-md {
    width: 52px;
    height: 52px;
  }
  &.size-lg {
    width: 88px;
    height: 88px;
  }
  &.size-xl {
    width: 120px;
    height: 120px;
  }
  &.size-xxl {
    width: 168px;
    height: 168px;
  }
}
</style>
