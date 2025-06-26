<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: null
  },
  width: {
    type: [String, Number],
    default: null
  },
  height: {
    type: [String, Number],
    default: null
  },
  maxWidth: {
    type: [String, Number],
    default: null
  },
  fullWidth: {
    type: Boolean,
    default: false
  },
  customClass: {
    type: String,
    default: ''
  }
});

const computedStyles = computed(() => {
  const styles = {};
  
  if (props.width) {
    styles.width = isNaN(props.width) ? props.width : `${props.width}px`;
  }
  
  if (props.height) {
    styles.height = isNaN(props.height) ? props.height : `${props.height}px`;
  }
  
  if (props.maxWidth) {
    styles.maxWidth = isNaN(props.maxWidth) ? props.maxWidth : `${props.maxWidth}px`;
  }
  
  return styles;
});
</script>

<template>
  <!--This will serve as the base dashboard card-->
  <div 
    class="bg-secondary rounded-lg shadow-md p-6 flex flex-col" 
    :class="[customClass, { 'w-full': fullWidth }]"
    :style="computedStyles"
  >
    <!-- Title slot if provided -->
    <h3 v-if="title" class="text-lg font-semibold mb-4 text-basecard-text">{{ title }}</h3>
    
    <!-- Default slot for content -->
    <div class="card-content flex-grow">
      <slot></slot>
    </div>
  </div>
</template>