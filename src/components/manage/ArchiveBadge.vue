<script setup>
defineProps({ archived: Boolean });
</script>

<template>
  <span class="archive-badge" :class="{ 'archive-badge--archived': archived }">
    {{ archived ? 'Archived' : 'Active' }}
  </span>
</template>
