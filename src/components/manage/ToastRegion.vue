<script setup>
import { useToasts } from '@/composables/useToasts';

const { toasts, removeToast } = useToasts();
</script>

<template>
  <div class="toast-region" aria-live="polite" aria-atomic="true">
    <button
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="`toast--${toast.tone}`"
      type="button"
      @click="removeToast(toast.id)"
    >
      {{ toast.message }}
    </button>
  </div>
</template>
