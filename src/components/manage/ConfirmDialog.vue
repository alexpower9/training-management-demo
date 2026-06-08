<script setup>
defineProps({
  open: Boolean,
  title: { type: String, default: 'Confirm action' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  danger: Boolean,
  busy: Boolean,
});
defineEmits(['confirm', 'cancel']);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-layer">
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-label="title">
        <h2>{{ title }}</h2>
        <p>{{ message }}</p>
        <slot />
        <div class="dialog-actions">
          <button class="secondary-action" type="button" :disabled="busy" @click="$emit('cancel')">
            Cancel
          </button>
          <button
            :class="danger ? 'danger-action' : 'primary-action'"
            type="button"
            :disabled="busy"
            @click="$emit('confirm')"
          >
            {{ busy ? 'Working...' : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
