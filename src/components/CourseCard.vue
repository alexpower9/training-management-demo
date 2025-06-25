<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  expiryDate: {
    type: String,
    required: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  isExpired: {
    type: Boolean,
    default: false
  }
});

// Format the date to be more readable
const formattedDate = computed(() => {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(props.expiryDate).toLocaleDateString(undefined, options);
});

// Determine the status text and styling
const status = computed(() => {
  if (props.isCompleted) {
    return {
      text: "Completed",
      style: 'background-color: var(--color-success-light); color: white;'
    };
  } else if (props.isExpired) {
    return {
      text: "Expired",
      style: 'background-color: var(--color-warning-light); color: white;'
    };
  } else {
    return {
      text: "Incomplete",
      style: 'background-color: var(--color-primary); color: white;'
    };
  }
});
</script>

<template>
  <div class="bg-base-100 rounded-lg p-4 shadow-sm border border-base-300 h-full">
    <div class="flex flex-col h-full">
      <!-- title -->
      <h3 class="font-bold text-white text-lg lg:text-base line-clamp-2">
        {{ name }}
      </h3>

      <div class="mt-auto">
        <div class="flex flex-col gap-2">
          <!-- Date -->
          <div class="text-sm lg:text-xs">
            <span class="text-primary-content opacity-80">Expires:</span>
            <span
              class="ml-1 font-medium"
              :class="isExpired ? 'text-warning-dark' : 'text-primary-content'"
            >
              {{ formattedDate }}
            </span>
          </div>

          <!-- Badge -->
          <span
            class="badge badge-sm font-medium w-[30%] lg:w-[60%] lg:text-xs py-1.5 flex justify-center"
            :style="status.style"
          >
            {{ status.text }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.badge {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
