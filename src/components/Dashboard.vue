<script setup>
import {ref, provide } from 'vue';
import ProgressCard from './ProgressCard.vue';
import EmployeeCard from '@/components/EmployeeCard.vue';

// Create a shared selected employee state
const selectedEmployee = ref(null);

// Provide this to child components
provide('selectedEmployee', selectedEmployee);

// Watch for employee selection from the EmployeeCard
const handleEmployeeSelected = (employee) => {
  selectedEmployee.value = employee;
};
</script>

<template>
  <div class="overflow-hidden flex-grow w-full bg-base-100 p-6 min-h-[calc(100vh-80px)]">
    <div class="grid grid-cols-1 gap-6">
      <EmployeeCard @update:selected-employee="handleEmployeeSelected"/>
      <ProgressCard/>
      
    </div>
  </div>
</template>