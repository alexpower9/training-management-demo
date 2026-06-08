<script setup>
import { onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  dirty: Boolean,
  saving: Boolean,
});
const emit = defineEmits(['close', 'save']);

function requestClose() {
  if (props.dirty && !window.confirm('Discard your unsaved changes?')) return;
  emit('close');
}

function onKeydown(event) {
  if (event.key === 'Escape' && props.open && !props.saving) requestClose();
}

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('drawer-open', open);
  },
  { immediate: true },
);

window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.classList.remove('drawer-open');
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-layer">
      <button class="drawer-backdrop" type="button" aria-label="Close form" @click="requestClose" />
      <aside class="form-drawer" role="dialog" aria-modal="true" :aria-label="title">
        <header class="drawer-header">
          <h2>{{ title }}</h2>
          <button class="icon-button" type="button" aria-label="Close" @click="requestClose">×</button>
        </header>
        <form class="drawer-form" @submit.prevent="emit('save')">
          <div class="drawer-content"><slot /></div>
          <footer class="drawer-actions">
            <button class="secondary-action" type="button" :disabled="saving" @click="requestClose">
              Cancel
            </button>
            <button class="primary-action" type="submit" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  </Teleport>
</template>
