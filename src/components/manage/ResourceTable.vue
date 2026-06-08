<script setup>
defineProps({
  emptyTitle: { type: String, default: 'No records found' },
  emptyMessage: { type: String, default: 'Adjust your filters or add a new record.' },
  hasItems: Boolean,
});
</script>

<template>
  <div v-if="hasItems" class="table-wrap"><slot /></div>
  <div v-else class="empty-state">
    <strong>{{ emptyTitle }}</strong>
    <p>{{ emptyMessage }}</p>
  </div>
</template>
