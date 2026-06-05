<script setup>
import {ref, provide} from 'vue'
import CourseSelect from './CourseSelect.vue';
import MandatoryCourseProgress from './MandatoryCourseProgress.vue';
import MandatoryEmployeeCompletion from './MandatoryEmployeeCompletion.vue';

const courses = ref([
  { courseId: 1, name: 'Height Safety', description: 'Training for working at heights' },
  { courseId: 2, name: 'Professional Etiquette', description: 'Workplace professional behavior' },
  { courseId: 3, name: 'Equipment Operation', description: 'Heavy machinery operation basics' }
]);

const employees = ref([
  { id: 1, name: 'John Doe', position: 'Field Technician' },
  { id: 2, name: 'Jane Smith', position: 'Equipment Operator' },
  { id: 3, name: 'Alex Johnson', position: 'Safety Supervisor' },
  { id: 4, name: 'Emily Wilson', position: 'Maintenance Specialist' },
  { id: 5, name: 'Michael Brown', position: 'Site Manager' }
]);

const employeeCourseCompletions = ref([
  { employeeId: 1, courseId: 1, completed: true },
  { employeeId: 2, courseId: 1, completed: false },
  { employeeId: 3, courseId: 1, completed: true },
  { employeeId: 4, courseId: 1, completed: true },
  { employeeId: 5, courseId: 1, completed: false },
  
  { employeeId: 1, courseId: 2, completed: true },
  { employeeId: 2, courseId: 2, completed: true },
  { employeeId: 3, courseId: 2, completed: true },
  { employeeId: 4, courseId: 2, completed: false },
  { employeeId: 5, courseId: 2, completed: false },
  
  { employeeId: 1, courseId: 3, completed: false },
  { employeeId: 2, courseId: 3, completed: true },
  { employeeId: 3, courseId: 3, completed: false },
  { employeeId: 4, courseId: 3, completed: true },
  { employeeId: 5, courseId: 3, completed: true }
]);

const selectedCourse = ref(null);

// Provide shared data to child components
provide('courses', courses);
provide('employees', employees);
provide('employeeCourseCompletions', employeeCourseCompletions);
provide('selectedCourse', selectedCourse);

// Handler function for when a course is selected
const handleCourseSelected = (course) => {
  selectedCourse.value = course;
}

</script>

<template>
  <div class="overflow-hidden flex-grow w-full bg-base-100 pt-1 px-7 pb-7 min-h-[calc(100vh-80px)]">
    <!-- Use a responsive grid layout that changes based on screen size -->
    <div class="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <!-- Left column for CourseSelect and ProgressCard (takes 3/5 on large screens) -->
      <div class="xl:col-span-2 flex flex-col gap-6">
        <CourseSelect @update:selected-course="handleCourseSelected"/>
        <MandatoryCourseProgress/>
        <!-- <ProgressCard @update:selected-customer="handleCustomerSelected"/> -->
      </div>
      
      <!-- Right column for CoursesAvailable (takes 2/5 on large screens) -->
      <div class="xl:col-span-2">
        <MandatoryEmployeeCompletion/>
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
