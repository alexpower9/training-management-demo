<script setup>
import {ref, provide } from 'vue';
import ProgressCard from './ProgressCard.vue';
import EmployeeCard from '@/components/EmployeeCard.vue';
import CoursesAvailable from './CoursesAvailable.vue';

// Create a shared selected employee state
const selectedEmployee = ref(null);
const selectedCustomer = ref(null);
const courseCompletions = ref([
  { employeeId: 1, courseId: 1, completed: true },
  { employeeId: 1, courseId: 2, completed: true },
  { employeeId: 1, courseId: 3, completed: false },
  { employeeId: 1, courseId: 5, completed: true },
  { employeeId: 1, courseId: 6, completed: false },
  { employeeId: 1, courseId: 7, completed: true },
  
  { employeeId: 2, courseId: 3, completed: true },
  { employeeId: 2, courseId: 4, completed: true },
  { employeeId: 2, courseId: 5, completed: false },
  { employeeId: 2, courseId: 6, completed: true },
  
  { employeeId: 3, courseId: 1, completed: true },
  { employeeId: 3, courseId: 2, completed: true },
  { employeeId: 3, courseId: 3, completed: true },
  { employeeId: 3, courseId: 4, completed: true },
  { employeeId: 3, courseId: 5, completed: true },
  { employeeId: 3, courseId: 6, completed: true },
  { employeeId: 3, courseId: 7, completed: true },
  { employeeId: 3, courseId: 8, completed: false }
]);


// Provide this to child components
provide('selectedEmployee', selectedEmployee);
provide('selectedCustomer', selectedCustomer);
provide('courseCompletions', courseCompletions);

// Watch for employee selection from the EmployeeCard
const handleEmployeeSelected = (employee) => {
  selectedEmployee.value = employee;
};

const handleCustomerSelected = (customer) => {
  console.log('Customer selected in Dashboard:', customer);
  selectedCustomer.value = customer;
};
</script>

<template>
  <div class="overflow-hidden flex-grow w-full bg-base-100 pt-1 px-7 pb-7 min-h-[calc(100vh-80px)]">
    <!-- Use a responsive grid layout that changes based on screen size -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <!-- Left column for EmployeeCard and ProgressCard (takes 3/5 on large screens) -->
      <div class="lg:col-span-3 flex flex-col gap-6">
        <EmployeeCard @update:selected-employee="handleEmployeeSelected"/>
        <ProgressCard @update:selected-customer="handleCustomerSelected"/>
      </div>
      
      <!-- Right column for CoursesAvailable (takes 2/5 on large screens) -->
      <div class="lg:col-span-2">
        <CoursesAvailable/>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 1024px) {
  .lg\:col-span-2 {
    display: flex;
  }
}
</style>