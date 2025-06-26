<script setup>
import DashCard from './DashCard.vue';
import { ref, onMounted, computed, provide } from 'vue';

const emit = defineEmits(['update:selectedEmployee']);

const employees = ref([
  { id: 1, name: 'John Doe', qualifications: ['CPR Certified', 'Electrican',] },
  { id: 2, name: 'Jane Smith', qualifications: ['Heavy Machinery'] },
  { id: 3, name: 'Alex Johnson', qualifications: ['Mechanic', 'CPR Certified'] }
]);

const selectedEmployee = ref(null);
const searchQuery = ref('');
const isDropdownOpen = ref(false);

// onMounted(() => {
//   if (employees.value.length > 0) {
//     selectedEmployee.value = employees.value[0];
//     emit('update:selectedEmployee', selectedEmployee.value);
//   }
// });

provide('selectedEmployee', selectedEmployee);

const filteredEmployees = computed(() => {
  if (!searchQuery.value) return employees.value;
  const query = searchQuery.value.toLowerCase();
  return employees.value.filter(employee => 
    employee.name.toLowerCase().includes(query)
  );
});

const selectEmployee = (employee) => {
  selectedEmployee.value = employee;
  isDropdownOpen.value = false;
  searchQuery.value = '';
  emit('update:selectedEmployee', employee);
};

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
</script>

<template>
  <!-- Use DashCard which already has bg-secondary by default -->
  <DashCard customClass="employee-card" maxWidth="800">
    <div class="flex items-center justify-between mb-6">
      <!-- Person icon on the left with navy color -->
      <div class="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span class="font-bold text-primary pl-1">Employee</span>
      </div>
      
      <!-- Dropdown on the right -->
      <div class="dropdown-container relative">
        <button 
          @click.stop="toggleDropdown" 
          class="flex items-center px-4 py-2 border border-primary/20 rounded-md bg-primary-content hover:bg-base-200 transition-colors duration-200 text-primary font-medium"
        >
          <span v-if="selectedEmployee">{{ selectedEmployee.name }}</span>
          <span v-else>Select Employee</span>
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
              placeholder="Search employees..." 
              class="text-base-100 placeholder-base-100 w-full px-3 py-2 border border-base-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral focus:border-transparent"
              @click.stop
            />
          </div>
          <div class="max-h-64 overflow-y-auto">
            <div 
              v-for="employee in filteredEmployees" 
              :key="employee.id" 
              @click.stop="selectEmployee(employee)"
              class="px-4 py-2 cursor-pointer hover:bg-neutral transition-colors duration-100 text-primary"
              :class="{'bg-secondary text-accent-content font-medium': selectedEmployee?.id === employee.id}"
            >
              {{ employee.name }}
            </div>
            <div v-if="filteredEmployees.length === 0" class="px-4 py-2 text-neutral italic">
              No employees found
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Employee Details Section -->
    <div v-if="selectedEmployee" class="bg-secondary p-4 rounded-lg shadow-sm">
      <h3 class="text-xl font-bold mb-4 text-primary">{{ selectedEmployee.name }}</h3>
      
      <div class="flex flex-wrap gap-2">
        <span 
          v-for="(qual, index) in selectedEmployee.qualifications" 
          :key="index"
          class="badge badge-base-300 text-white p-3 font-medium"
        >
          {{ qual }}
        </span>
      </div>
    </div>
    
    <!-- Empty state if no employee is selected -->
    <div v-else>
      <div class="h-3"/>
      <div class="bg-primary-content p-2 rounded-lg flex items-center justify-center shadow-sm">
      <p class="text-primary/60">Select an employee to view details</p>
    </div>
    </div>
  </DashCard>
</template>

<style scoped>
.dropdown-container {
  position: relative;
}
</style>