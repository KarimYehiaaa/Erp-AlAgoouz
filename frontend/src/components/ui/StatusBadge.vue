<template>
  <span class="badge" :class="`badge-${meta.tone}`">{{ meta.label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { resolveStatusMeta } from '@/utils/statusMeta';

/**
 * StatusBadge — شارة حالة موحدة لكل الشاشات.
 * kind: 'payment' لحالات السداد | 'record' لحالات العملية (مكتملة/مرتجعة...)
 */
const props = defineProps({
  status: { type: [String, null] as any, default: '' },
  kind: { type: String, default: 'payment' },
});

const meta = computed(() => resolveStatusMeta(props.kind, props.status));
</script>
