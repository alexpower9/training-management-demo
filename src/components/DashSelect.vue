<script setup>
import { ref } from 'vue';

// Options for the selector
const options = [
  { id: 'status', label: 'Status' },
  {id: 'mandatory', label: 'Mandatory'},
  { id: 'modify', label: 'Modify' }
];

// Track which option is currently selected (default to "Status")
const selectedOption = ref('status');

// Emit events to parent component
const emit = defineEmits(['update:mode']);

// Handle option selection
const selectOption = (optionId) => {
  selectedOption.value = optionId;
  emit('update:mode', optionId);
};
</script>

<template>
  <div class="flex justify-center pt-1">
    <div class="inline-flex rounded-md shadow-sm bg-secondary" role="group">
      <button 
        v-for="option in options" 
        :key="option.id"
        type="button" 
        :class="[
          'px-5 py-2 text-sm font-medium border border-secondary transition-colors duration-200',
          selectedOption === option.id 
            ? 'bg-base-100 text-primary-content' 
            : 'bg-secondary text-primary hover:bg-base-100'
        ]"
        :aria-selected="selectedOption === option.id"
        @click="selectOption(option.id)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Round the corners of the first button in the group */
button:first-child {
  border-top-left-radius: 0.375rem;
  border-bottom-left-radius: 0.375rem;
}

/* Round the corners of the last button in the group */
button:last-child {
  border-top-right-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
}
</style>