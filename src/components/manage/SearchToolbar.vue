<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  includeArchived: Boolean,
  placeholder: { type: String, default: 'Search...' },
});
defineEmits(['update:modelValue', 'update:includeArchived', 'search']);
</script>

<template>
  <form class="search-toolbar" @submit.prevent="$emit('search')">
    <label class="field search-field">
      <span>Search</span>
      <input
        :value="modelValue"
        type="search"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </label>
    <slot />
    <label class="checkbox-field">
      <input
        :checked="includeArchived"
        type="checkbox"
        @change="$emit('update:includeArchived', $event.target.checked)"
      />
      Show archived
    </label>
    <button class="secondary-action" type="submit">Apply</button>
  </form>
</template>
