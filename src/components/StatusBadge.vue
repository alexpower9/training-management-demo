<script setup>
import { computed } from 'vue';
import { statusMeta } from '@/data/trainingDemoData';

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
});

const badgeClass = computed(() => {
  const tone = statusMeta[props.status]?.tone || 'neutral';
  return `status-badge status-badge--${tone}`;
});
</script>

<template>
  <span :class="badgeClass">
    {{ statusMeta[status]?.label || status }}
  </span>
</template>
