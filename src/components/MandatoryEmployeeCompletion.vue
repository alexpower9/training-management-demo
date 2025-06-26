<script setup>
import DashCard from './DashCard.vue';
import { ref, computed, inject, watch, onMounted } from 'vue';

// Inject shared data from parent
const selectedCourse = inject('selectedCourse', ref(null));
const employees = inject('employees', ref([]));
const employeeCourseCompletions = inject('employeeCourseCompletions', ref([]));

// View mode: 'complete' or 'incomplete'
const viewMode = ref('complete');
const searchQuery = ref('');
const isDropdownOpen = ref(false);

// Toggle dropdown
const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};

// Close dropdown when clicking outside
const closeDropdown = (event) => {
  if (!event.target.closest('.filter-dropdown')) {
    isDropdownOpen.value = false;
  }
};

// Set view mode
const setViewMode = (mode) => {
  viewMode.value = mode;
  isDropdownOpen.value = false;
};

// Filter employees based on selected course, view mode, and search query
const filteredEmployees = computed(() => {
  if (!selectedCourse.value) return [];
  
  const courseId = selectedCourse.value.courseId;
  
  // Get all employees with their completion status for the selected course
  let employeesWithStatus = employees.value.map(employee => {
    const completion = employeeCourseCompletions.value.find(c => 
      c.employeeId === employee.id && c.courseId === courseId
    );
    
    return {
      ...employee,
      completed: completion ? completion.completed : false
    };
  });
  
  // Filter by completion status based on viewMode
  employeesWithStatus = employeesWithStatus.filter(employee => {
    if (viewMode.value === 'complete') {
      return employee.completed;
    } else {
      return !employee.completed;
    }
  });
  
  // Apply search filter if there's a search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    employeesWithStatus = employeesWithStatus.filter(employee =>
      employee.name.toLowerCase().includes(query) || 
      employee.position.toLowerCase().includes(query)
    );
  }
  
  // Sort alphabetically by name
  return employeesWithStatus.sort((a, b) => a.name.localeCompare(b.name));
});

// Add event listener when mounted
onMounted(() => {
  document.addEventListener('click', closeDropdown);
  
  // Clean up on unmount
  return () => {
    document.removeEventListener('click', closeDropdown);
  };
});
</script>

<template>
  <DashCard customClass="employee-completion-card w-full">
    <div class="flex items-center justify-between mb-6">
      <!-- Employee icon with text -->
      <div class="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      
      <!-- Filter controls -->
      <div class="flex items-center space-x-3">
        <!-- Search bar -->
        <div class="relative">
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Search" 
            class="text-base-100 placeholder-base-100/70 w-40 px-3 py-2 border border-base-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral focus:border-transparent"
          />
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-100/70 absolute right-3 top-1/2 transform -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <!-- Filter icon dropdown (no text) -->
        <div class="filter-dropdown relative">
          <button
            @click.stop="toggleDropdown"
            class="p-1 transition-colors duration-200 rounded-md text-base-100 hover:text-primary"
            :class="{'text-primary': isDropdownOpen}"
            title="Filter by completion status"
        >
            <!-- Simple down arrow chevron icon without stem -->
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          <div v-if="isDropdownOpen" class="absolute right-0 mt-1 w-40 bg-primary-content border border-primary/20 rounded-md shadow-lg z-10">
            <div class="px-3 py-2 border-b border-base-300/30">
              <span class="text-sm text-primary/70">Filter status:</span>
            </div>
            <div 
              @click="setViewMode('complete')"
              class="px-4 py-2 cursor-pointer hover:bg-neutral transition-colors duration-100 text-primary flex items-center"
              :class="{'font-medium': viewMode === 'complete'}"
            >
              <div class="w-3 h-3 rounded-full bg-[oklch(0.7559_0.2245_142.94)] mr-2"></div>
              Completed
            </div>
            <div 
              @click="setViewMode('incomplete')"
              class="px-4 py-2 cursor-pointer hover:bg-neutral transition-colors duration-100 text-primary flex items-center"
              :class="{'font-medium': viewMode === 'incomplete'}"
            >
              <div class="w-3 h-3 rounded-full bg-[oklch(0.5444_0.2234_29.23)] mr-2"></div>
              Incomplete
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Main content section -->
    <div v-if="selectedCourse" class="bg-secondary p-4 rounded-lg shadow-sm">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-primary">{{ selectedCourse.name }}</h3>
      </div>
      
      <!-- Employees list with improved spacing -->
      <!-- Employees list with responsive grid layout -->
        <div class="max-h-72 overflow-y-auto pr-1 py-1 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div 
            v-for="employee in filteredEmployees" 
            :key="employee.id"
            class="flex items-center justify-between p-3 rounded-md"
            :class="viewMode === 'complete' ? 'bg-[oklch(0.7471_0.1385_142.94)]' : 'bg-[oklch(0.6765_0.1554_29.23)]'"
        >
            <div class="flex items-center">
            <span class="text-white font-medium">{{ employee.name }}</span> 
            </div>
            <span 
            class="badge text-white font-medium border-0"
            :class="viewMode === 'complete' ? 'bg-[oklch(0.7559_0.2245_142.94)]' : 'bg-[oklch(0.5444_0.2234_29.23)]'"
            >
            {{ viewMode === 'complete' ? 'Completed' : 'Incomplete' }}
            </span>
        </div>
        
        <!-- Empty state when no employees match criteria -->
        <div v-if="filteredEmployees.length === 0" class="bg-base-100 p-4 rounded-lg text-center md:col-span-2">
            <p class="text-primary">
            No {{ viewMode === 'complete' ? 'completed' : 'incomplete' }} employees found
            <span v-if="searchQuery.length > 0"> matching "{{ searchQuery }}"</span>.
            </p>
        </div>
        </div>
    </div>
    
    <!-- Empty state if no course is selected -->
    <div v-else>
        <div class="h-3"></div>
        <div class="bg-primary-content p-3 rounded-lg flex flex-col items-center justify-center shadow-sm">
        <p class="text-primary/60 text-center">
            Select a course to view employee completion status
        </p>
        </div>
    </div>
  </DashCard>
</template>