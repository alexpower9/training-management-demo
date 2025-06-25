<script setup>
import DashCard from './DashCard.vue';
import CourseCard from './CourseCard.vue';
import { ref, computed, inject } from 'vue';

// Get the selected customer from Progress Card component
const selectedCustomer = inject('selectedCustomer', ref(null));
const selectedEmployee = inject('selectedEmployee', ref(null));

// Mock data for courses
const courseCompletions = inject('courseCompletions', ref([
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
]));

// Filter courses based on selected customer
const availableCourses = computed(() => {
  if (!selectedCustomer.value || !selectedEmployee.value) return [];
  
  const employeeId = selectedEmployee.value.id;
  
  // Extract courses from the customer object that are required for this employee
  const courses = selectedCustomer.value.courses?.filter(course => 
    course.requiredFor.includes(employeeId)
  ).map(course => ({
    id: course.id,
    name: course.name,
    expiryDate: getExpiryDateForCourse(course.id),
    customerId: selectedCustomer.value.id,
    requiredFor: course.requiredFor
  })) || [];
  
  const processedCourses = courses.map(course => {
    // Check if expired
    const isExpired = new Date(course.expiryDate) < new Date();
    
    // Check completion status for the selected employee
    const isCompleted = selectedEmployee.value ? 
      checkIfCompleted(course.id, selectedEmployee.value.id) : false;
    
    return {
      ...course,
      isExpired,
      isCompleted
    };
  });
  
  // Sort the courses in this order:
  // 1. Completed courses first
  // 2. Incomplete (not expired) courses second
  // 3. Expired courses last
  return processedCourses.sort((a, b) => {
    // Create a numeric sort value for each state
    const getSortValue = (course) => {
      if (course.isCompleted) return 1; // Completed courses first
      if (!course.isExpired) return 2; // Incomplete (not expired) courses second
      return 3; // Expired courses last
    };

    const sortValueA = getSortValue(a);
    const sortValueB = getSortValue(b);

    // Compare the sort values
    if (sortValueA !== sortValueB) {
      return sortValueA - sortValueB;
    }
    
    // For courses with the same status, sort alphabetically by name
    return a.name.localeCompare(b.name);
  });
});

function checkIfCompleted(courseId, employeeId) {
  const completion = courseCompletions.value.find(c => 
    c.employeeId === employeeId && c.courseId === courseId
  );
  return completion ? completion.completed : false;
}

// Helper function to map course IDs to expiry dates (to maintain consistency with your existing data)
function getExpiryDateForCourse(courseId) {
  const expiryMap = {
    1: '2024-12-31',  // Safety Training 101
    2: '2024-10-15',  // Equipment Handling
    3: '2023-11-30',  // Site Regulations (expired)
    4: '2025-03-22',  // Heavy Machinery Operation
    5: '2024-09-10',  // Environmental Compliance
    6: '2024-08-18',  // Cold Weather Operations
    7: '2024-11-05',  // Emergency Procedures
    8: '2023-12-15'   // Communication Systems (expired)
  };
  
  return expiryMap[courseId] || '2024-12-31'; // Default expiry date if not found
}
</script>

<template>
  <DashCard customClass="courses-available-card h-full" maxWidth="800">
    <!-- Header section -->
    <div class="flex items-center mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
      <span class="font-bold text-primary pl-1">Available Courses</span>
    </div>

    <!-- Main content section -->
    <div v-if="selectedCustomer" class="bg-secondary p-4 rounded-lg shadow-sm flex-grow">
      <h3 class="text-lg font-bold text-primary mb-4">
        {{ selectedCustomer.name }} 
      </h3>

      <!-- Grid of course cards -->
      <div v-if="availableCourses.length > 0" 
           class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-2">
        <CourseCard 
          v-for="course in availableCourses" 
          :key="course.id"
          :name="course.name"
          :expiryDate="course.expiryDate"
          :isCompleted="course.isCompleted"
          :isExpired="course.isExpired"
          class="lg:transform lg:scale-90 lg:origin-top-left"
        />
      </div>
      
      <!-- Empty state when no courses are available -->
      <div v-else class="bg-base-100 p-4 rounded-lg text-center">
        <p class="text-primary">No courses available for this customer.</p>
      </div>
    </div>

    <!-- Empty state if customer is not selected -->
    <div v-else class="bg-primary-content p-2 rounded-lg flex flex-col items-center justify-center shadow-sm flex-grow">
      <p class="text-primary/60">
        Select a customer to view available courses.
      </p>
    </div>
  </DashCard>
</template>

<style scoped>
.courses-available-card {
  display: flex;
  flex-direction: column;
}

.courses-available-card > div {
  flex-grow: 1;
}
</style>