<script setup>
import DashCard from './DashCard.vue';
import { ref, onMounted, computed, inject } from 'vue';

const emit = defineEmits(['update:selectedCourse']);

// Inject courses data from parent
const courses = inject('courses', ref([]));
const selectedCourse = inject('selectedCourse', ref(null));

const searchQuery = ref('');
const isDropdownOpen = ref(false);

const filteredCourses = computed(() => {
  if (!searchQuery.value) return courses.value;
  const query = searchQuery.value.toLowerCase();
  return courses.value.filter(course => 
    course.name.toLowerCase().includes(query)
  );
});

const selectCourse = (course) => {
  selectedCourse.value = course;
  isDropdownOpen.value = false;
  searchQuery.value = '';
  emit('update:selectedCourse', course);
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
  
  // Cleanup on unmount
  return () => {
    document.removeEventListener('click', closeDropdown);
  };
});
</script>

<template>
  <DashCard customClass="course-select" :fullWidth="true">
    <div class="flex items-center justify-between mb-6">
      <!-- Course icon on the left with navy color -->
      <div class="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span class="font-bold text-primary pl-1">Course</span>
      </div>
      
      <!-- Dropdown on the right -->
      <div class="dropdown-container relative">
        <button 
          @click.stop="toggleDropdown" 
          class="flex items-center px-4 py-2 border border-primary/20 rounded-md bg-primary-content hover:bg-base-200 transition-colors duration-200 text-primary font-medium"
        >
          <span v-if="selectedCourse">{{ selectedCourse.name }}</span>
          <span v-else>Select Course</span>
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
              placeholder="Search courses..." 
              class="text-base-100 placeholder-base-100 w-full px-3 py-2 border border-base-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral focus:border-transparent"
              @click.stop
            />
          </div>
          <div class="max-h-64 overflow-y-auto">
            <div 
              v-for="course in filteredCourses" 
              :key="course.id" 
              @click.stop="selectCourse(course)"
              class="px-4 py-2 cursor-pointer hover:bg-neutral transition-colors duration-100 text-primary"
              :class="{'bg-white text-accent-content font-medium': selectedCourse?.id === course.id}"
            >
              {{ course.name }}
            </div>
            <div v-if="filteredCourses.length === 0" class="px-4 py-2 text-neutral italic">
              No courses found
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Course Details Section -->
  </DashCard>
</template>

<style scoped>
.dropdown-container {
  position: relative;
}
</style>