<script setup>
import { ref } from 'vue';

defineProps({
  comment: { type: String, default: null },
  label: { type: String, required: true },
});

const open = ref(false);
</script>

<template>
  <button
    v-if="comment"
    class="comment-icon-button"
    type="button"
    :aria-label="label"
    :title="label"
    @click.stop="open = true"
  >
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M7 8h10M7 12h7M6.5 18.5 4 21V5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v10a2.5 2.5 0 0 1-2.5 2.5H8z"
      />
    </svg>
  </button>

  <Teleport to="body">
    <div v-if="open" class="dialog-layer">
      <div class="confirm-dialog comment-dialog" role="dialog" aria-modal="true" :aria-label="label">
        <h2>Completion comment</h2>
        <p class="completion-comment-text">{{ comment }}</p>
        <div class="dialog-actions">
          <button class="primary-action" type="button" @click="open = false">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
