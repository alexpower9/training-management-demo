<script setup>
import DashCard from './DashCard.vue';
import { ref, computed, inject } from 'vue';

// Inject shared data from parent
const selectedCourse = inject('selectedCourse', ref(null));
const employees = inject('employees', ref([]));
const employeeCourseCompletions = inject('employeeCourseCompletions', ref([]));

// Calculate progress percentage for the selected course
const progressData = computed(() => {
  if (!selectedCourse.value) {
    return { percentage: 0, completed: 0, total: employees.value.length };
  }

  const courseId = selectedCourse.value.courseId;
  const completions = employeeCourseCompletions.value.filter(c => c.courseId === courseId);
  const completedCount = completions.filter(c => c.completed).length;
  const totalEmployees = employees.value.length;
  
  const percentage = Math.round((completedCount / totalEmployees) * 100);
  
  return {
    percentage,
    completed: completedCount,
    total: totalEmployees
  };
});
</script>

<template>
  <!-- Keep the rest of the template the same -->
  <DashCard customClass="course-progress-card">
    <div class="flex items-center mb-6">
      <!-- Chart icon with navy color -->
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <span class="font-bold text-primary pl-1">Course Completion Progress</span>
    </div>
    
    <!-- Main content -->
    <div v-if="selectedCourse" class="bg-secondary p-4 rounded-lg shadow-sm">
      <div class="flex justify-between items-center mb-2">
        <h3 class="text-xl font-bold text-primary">{{ selectedCourse.name }}</h3>
        <span class="text-primary font-bold">{{ progressData.percentage }}%</span>
      </div>
      
      <!-- Progress bar -->
      <div class="w-full bg-base-100 rounded-full h-4 mb-2">
        <div 
          class="bg-primary-content h-4 rounded-full transition-all duration-500 ease-in-out" 
          :style="`width: ${progressData.percentage}%`"
        ></div>
      </div>
      
      <p class="text-sm text-right text-primary">
        {{ progressData.completed }} of {{ progressData.total }} employees completed
      </p>
    </div>
    
    <!-- Empty state if no course is selected -->
    <div v-else class="bg-primary-content p-2 rounded-lg flex flex-col items-center justify-center shadow-sm ">
      <p class="text-primary/60 text-center">
        Select a course to view completion progress
      </p>
    </div>
  </DashCard>
</template>