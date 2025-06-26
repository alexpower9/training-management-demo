<script setup>
import DashCard from './DashCard.vue';
import {
  ref,
  computed,
  inject,
  onMounted,
  onBeforeUnmount,
} from 'vue';

/* ────────────────────────────
   Injected props from parent
   ──────────────────────────── */
const selectedCourse             = inject('selectedCourse', ref(null));
const employees                  = inject('employees', ref([]));
const employeeCourseCompletions  = inject('employeeCourseCompletions', ref([]));

/* ────────────────────────────
   Local state
   ──────────────────────────── */
const viewMode        = ref(null);        // null | 'complete' | 'incomplete'
const searchQuery     = ref('');
const isDropdownOpen  = ref(false);

/* ────────────────────────────
   Helpers
   ──────────────────────────── */
const toggleDropdown = () => { isDropdownOpen.value = !isDropdownOpen.value; };
const closeDropdown  = e => {
  if (!e.target.closest('.filter-dropdown')) isDropdownOpen.value = false;
};

const setViewMode   = mode => { viewMode.value = mode;  isDropdownOpen.value = false; };
const clearViewMode = ()   => { viewMode.value = null; isDropdownOpen.value = false; };

/* ────────────────────────────
   Computed: filtered + sorted list
   ──────────────────────────── */
const filteredEmployees = computed(() => {
  if (!selectedCourse.value) return [];

  const cid = selectedCourse.value.courseId;

  // Enrich employees with completion flag for the selected course
  let list = employees.value.map(emp => {
    const rec = employeeCourseCompletions.value.find(
      c => c.employeeId === emp.id && c.courseId === cid,
    );
    return { ...emp, completed: rec ? rec.completed : false };
  });

  /* Apply view-mode filter */
  if (viewMode.value === 'complete')      list = list.filter(e =>  e.completed);
  else if (viewMode.value === 'incomplete') list = list.filter(e => !e.completed);

  /* Search filter */
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      e => e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q),
    );
  }

  /* Sort: completed first, then alphabetical */
  list.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return list;
});

/* ────────────────────────────
   Click-outside handler
   ──────────────────────────── */
onMounted(() => document.addEventListener('click', closeDropdown));
onBeforeUnmount(() => document.removeEventListener('click', closeDropdown));
</script>

<template>
  <DashCard customClass="employee-completion-card w-full">

    <!-- Header: icon + search + filter -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center">
        <!-- user icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 text-primary mr-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>

      <div class="flex items-center space-x-3">

        <!-- search -->
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search"
            class="text-base-100 placeholder-base-100/70 w-40 px-3 py-2 border border-base-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral focus:border-transparent"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 text-base-100/70 absolute right-3 top-1/2 -translate-y-1/2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <!-- dropdown -->
        <div class="filter-dropdown relative">
          <button
            class="p-1 rounded-md transition-colors duration-200 text-base-100 hover:text-primary"
            :class="{ 'text-primary': isDropdownOpen || viewMode }"
            @click.stop="toggleDropdown"
            title="Filter by completion status">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
                 viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                    d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- menu -->
          <div
            v-if="isDropdownOpen"
            class="absolute right-0 mt-1 w-44 bg-primary-content border border-primary/20 rounded-md shadow-lg z-10">
            <div class="px-3 py-2 border-b border-base-300/30">
              <span class="text-sm text-primary/70">Filter status</span>
            </div>

            <!-- completed -->
            <div
              class="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-neutral transition-colors duration-100 text-primary"
              :class="{ 'font-medium': viewMode === 'complete' }"
              @click="setViewMode('complete')">
              <div class="flex items-center">
                <div class="w-3 h-3 rounded-full bg-[oklch(0.7559_0.2245_142.94)] mr-2"></div>
                Completed
              </div>
              <!-- clear icon -->
              <button
                v-if="viewMode === 'complete'"
                class="p-0.5 ml-2"
                @click.stop="clearViewMode"
                title="Clear filter">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-70"
                     viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clip-rule="evenodd" />
                </svg>
              </button>
            </div>

            <!-- incomplete -->
            <div
              class="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-neutral transition-colors duration-100 text-primary"
              :class="{ 'font-medium': viewMode === 'incomplete' }"
              @click="setViewMode('incomplete')">
              <div class="flex items-center">
                <div class="w-3 h-3 rounded-full bg-[oklch(0.5444_0.2234_29.23)] mr-2"></div>
                Incomplete
              </div>
              <!-- clear icon -->
              <button
                v-if="viewMode === 'incomplete'"
                class="p-0.5 ml-2"
                @click.stop="clearViewMode"
                title="Clear filter">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-70"
                     viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ────────────────────────────
         Body
         ──────────────────────────── -->
    <div v-if="selectedCourse" class="bg-secondary p-4 rounded-lg shadow-sm">

      <h3 class="text-xl font-bold text-primary mb-4">{{ selectedCourse.name }}</h3>

      <div class="max-h-72 overflow-y-auto pr-1 py-1 grid grid-cols-1 md:grid-cols-2 gap-3">

        <!-- employee card -->
        <div
          v-for="emp in filteredEmployees"
          :key="emp.id"
          class="flex items-center justify-between p-3 rounded-md"
          :class="emp.completed
            ? 'bg-[oklch(0.7471_0.1385_142.94)]'
            : 'bg-[oklch(0.6765_0.1554_29.23)]'">
          <span class="text-white font-medium">{{ emp.name }}</span>
          <span
            class="badge text-white font-medium border-0"
            :class="emp.completed
              ? 'bg-[oklch(0.7559_0.2245_142.94)]'
              : 'bg-[oklch(0.5444_0.2234_29.23)]'">
            {{ emp.completed ? 'Completed' : 'Incomplete' }}
          </span>
        </div>

        <!-- empty state -->
        <div
          v-if="filteredEmployees.length === 0"
          class="bg-base-100 p-4 rounded-lg text-center md:col-span-2">
          <p class="text-primary">
            <span v-if="viewMode === 'complete'">No completed employees found</span>
            <span v-else-if="viewMode === 'incomplete'">No incomplete employees found</span>
            <span v-else>No employees found</span>
            <span v-if="searchQuery"> matching “{{ searchQuery }}”</span>.
          </p>
        </div>
      </div>
    </div>

    <!-- no course selected -->
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
