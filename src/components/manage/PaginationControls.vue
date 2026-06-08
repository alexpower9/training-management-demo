<script setup>
import { computed } from 'vue';

const props = defineProps({
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 25 },
  total: { type: Number, default: 0 },
});
defineEmits(['change']);

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
</script>

<template>
  <div class="pagination-controls">
    <span>Page {{ page }} of {{ pages }} · {{ total }} records</span>
    <div>
      <button
        class="secondary-action"
        type="button"
        :disabled="page <= 1"
        @click="$emit('change', page - 1)"
      >
        Previous
      </button>
      <button
        class="secondary-action"
        type="button"
        :disabled="page >= pages"
        @click="$emit('change', page + 1)"
      >
        Next
      </button>
    </div>
  </div>
</template>
