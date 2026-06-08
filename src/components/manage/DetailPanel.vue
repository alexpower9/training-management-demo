<script setup>
defineProps({
  title: { type: String, default: 'Details' },
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <aside class="panel detail-panel">
    <div class="panel-header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </div>
    <slot />
  </aside>
</template>
