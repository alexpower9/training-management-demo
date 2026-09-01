<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: {
    type: String,
    default: 'pending',
  },
});

const meta = computed(() => {
  if (props.status === 'finalized') {
    return { label: 'Finalized', tone: 'success' };
  }
  if (props.status === 'cancelled') {
    return { label: 'Cancelled', tone: 'neutral' };
  }
  return { label: 'Pending date', tone: 'warning' };
});
</script>

<template>
  <span :class="`status-badge status-badge--${meta.tone}`">{{ meta.label }}</span>
</template>
