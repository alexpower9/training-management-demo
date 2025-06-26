<script setup>
import DashCard from './DashCard.vue';
import { ref, provide, computed, watch, inject, onMounted } from 'vue';

const injectedEmployee = inject('selectedEmployee', null);
const selectedEmployee = ref(injectedEmployee || null);

const selectedCustomer = ref(null);
const searchQuery = ref('');
const isDropdownOpen = ref(false);

// Modify the selectCustomer function to include:
const selectCustomer = (customer) => {
  selectedCustomer.value = customer;
  isDropdownOpen.value = false;
  searchQuery.value = '';
  emit('update:selectedCustomer', customer);
};


// Watch for changes in injected employee
if (injectedEmployee) {
  watch(injectedEmployee, (newValue) => {
    selectedEmployee.value = newValue;
  });
}

// Mock data for customers
const customers = ref([
  { 
    id: 1, 
    name: 'ABC Mining',
    courses: [
      { id: 1, name: 'Safety Training 101', requiredFor: [1, 2, 3] },
      { id: 2, name: 'Equipment Handling', requiredFor: [1, 3] },
      { id: 3, name: 'Site Regulations', requiredFor: [1, 2, 3] }
    ]
  },
  { 
    id: 2, 
    name: 'XYZ Excavation',
    courses: [
      { id: 4, name: 'Heavy Machinery Operation', requiredFor: [2, 3] },
      { id: 5, name: 'Environmental Compliance', requiredFor: [1, 2, 3] }
    ]
  },
  { 
    id: 3, 
    name: 'Northern Resources',
    courses: [
      { id: 6, name: 'Cold Weather Operations', requiredFor: [1, 2, 3] },
      { id: 7, name: 'Emergency Procedures', requiredFor: [1, 2, 3] },
      { id: 8, name: 'Communication Systems', requiredFor: [3] }
    ]
  }
]);

// Mock data for course completion
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


// onMounted(() => {
//   if (customers.value.length > 0) {
//     selectedCustomer.value = customers.value[0];
//   }
// });

const filteredCustomers = computed(() => {
  if (!searchQuery.value) return customers.value;
  const query = searchQuery.value.toLowerCase();
  return customers.value.filter(customer => 
    customer.name.toLowerCase().includes(query)
  );
});

provide('selectedCustomer', selectedCustomer);
provide('courseCompletions', courseCompletions);

const emit = defineEmits(['update:selectedCustomer']);

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};

// Close dropdown when clicking outside
const closeDropdown = (event) => {
  if (!event.target.closest('.dropdown-container')) {
    isDropdownOpen.value = false;
  }
};

// Add event listener when mounted
onMounted(() => {
  document.addEventListener('click', closeDropdown);
});

// Calculate progress percentage for the selected employee and customer
const progressData = computed(() => {
  if (!selectedEmployee.value || !selectedCustomer.value) {
    return { percentage: 0, completed: 0, total: 0 };
  }

  const employeeId = selectedEmployee.value.id;
  const customerCourses = selectedCustomer.value.courses;
  
  // Find courses required for this employee at this customer
  const requiredCourses = customerCourses.filter(course => 
    course.requiredFor.includes(employeeId)
  );
  
  const totalRequired = requiredCourses.length;
  
  if (totalRequired === 0) {
    return { percentage: 0, completed: 0, total: 0 };
  }
  
  // Count completed courses
  const completedCount = requiredCourses.reduce((count, course) => {
    const completion = courseCompletions.value.find(c => 
      c.employeeId === employeeId && c.courseId === course.id
    );
    
    return count + (completion && completion.completed ? 1 : 0);
  }, 0);
  
  const percentage = Math.round((completedCount / totalRequired) * 100);
  
  return {
    percentage,
    completed: completedCount,
    total: totalRequired
  };
});

// Get the courses for the selected customer and their completion status
const coursesWithStatus = computed(() => {
  if (!selectedEmployee.value || !selectedCustomer.value) {
    return [];
  }
  
  const employeeId = selectedEmployee.value.id;
  const customerCourses = selectedCustomer.value.courses;
  
  return customerCourses
    .filter(course => course.requiredFor.includes(employeeId))
    .map(course => {
      const completion = courseCompletions.value.find(c => 
        c.employeeId === employeeId && c.courseId === course.id
      );
      
      return {
        ...course,
        completed: completion ? completion.completed : false
      };
    });
});
</script>

<template>
    <DashCard customClass="progress-card" maxWidth="800">
      <div class="flex items-center justify-between mb-6">
        <!-- Chart icon on the left with navy color -->
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span class="font-bold text-primary pl-1">Training Progress</span>
        </div>
        
        <!-- Dropdown on the right -->
        <div class="dropdown-container relative">
          <button 
            @click.stop="toggleDropdown" 
            class="flex items-center px-4 py-2 border border-primary/20 rounded-md bg-primary-content hover:bg-base-200 transition-colors duration-200 text-primary font-medium"
          >
            <span v-if="selectedCustomer" class="text-sm">{{ selectedCustomer.name }}</span>
            <span v-else class="text-sm">Select Customer</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          <!-- Dropdown content with white background and navy text -->
          <div v-if="isDropdownOpen" class="absolute right-0 mt-1 w-64 bg-primary-content border border-primary/20 rounded-md shadow-lg z-10">
            <div class="p-2">
              <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="Search customers..." 
                class="text-base-100 placeholder-base-100 w-full px-3 py-2 border border-base-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral focus:border-transparent"
                @click.stop
              />
            </div>
            <div class="max-h-64 overflow-y-auto">
              <div 
                v-for="customer in filteredCustomers" 
                :key="customer.id" 
                @click.stop="selectCustomer(customer)"
                class="px-4 py-2 cursor-pointer hover:bg-neutral transition-colors duration-100 text-primary"
                :class="{'bg-secondary text-accent-content font-medium': selectedCustomer?.id === customer.id}"
              >
                {{ customer.name }}
              </div>
              <div v-if="filteredCustomers.length === 0" class="px-4 py-2 text-neutral italic">
                No customers found
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Progress Bar Section -->
      <div v-if="selectedEmployee && selectedCustomer" class="bg-secondary p-4 rounded-lg shadow-sm">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-xl font-bold text-primary">{{ selectedEmployee.name }}</h3>
          <span class="text-primary font-bold">{{ progressData.percentage }}%</span>
        </div>
        
        <!-- Updated progress bar with base-100 background and white completed portion -->
        <div class="w-full bg-base-100 rounded-full h-4 mb-2">
          <div 
            class="bg-primary-content h-4 rounded-full transition-all duration-500 ease-in-out" 
            :style="`width: ${progressData.percentage}%`"
          ></div>
        </div>
        
        <p class="text-sm text-right text-primary">
          {{ progressData.completed }} of {{ progressData.total }} courses completed
        </p>
        
        <!-- Course List with updated colors -->
       <!-- <div class="mt-4">
        <h4 class="text-base font-semibold mb-2 mt-4 text-primary">Required Courses</h4>
        <div class="space-y-2">
          <div 
            v-for="course in coursesWithStatus" 
            :key="course.id"
            class="flex items-center justify-between p-2 rounded-md"
            :style="course.completed ? 
              'background-color: oklch(0.7471 0.1385 142.94);' : 
              'background-color: oklch(0.6765 0.1554 29.23);'"
          >
            <span class="text-white font-medium">{{ course.name }}</span>
            <span 
              class="badge text-white font-medium border-0"
              :style="course.completed ? 
                'background-color: oklch(0.7559 0.2245 142.94);' : 
                'background-color: oklch(0.5444 0.2234 29.23);'"
            >
              {{ course.completed ? 'Completed' : 'Incomplete' }}
            </span>
          </div>
        </div>
        </div> -->
        </div>
      
      <!-- Empty state if no employee or customer is selected -->
      <div v-else> 
        <div class="h-3"/>
        <div class="bg-primary-content p-2 rounded-lg flex flex-col items-center justify-center shadow-sm">
        <p class="text-primary/60">
          <span v-if="!selectedEmployee">No employee selected. Please select an employee first.</span>
          <span v-else-if="!selectedCustomer">Select a customer to view training progress.</span>
        </p>
      </div>
      </div>
    </DashCard>
  </template>
  
  <style scoped>
  .dropdown-container {
    position: relative;
  }

:root {
  --success-dark: oklch(0.7559 0.2245 142.94);
  --success-light: oklch(0.7471 0.1385 142.94);
  --warning-dark: oklch(0.5444 0.2234 29.23);
  --warning-light: oklch(0.6765 0.1554 29.23);
  --black: oklch(0 0 0);
}
  </style>