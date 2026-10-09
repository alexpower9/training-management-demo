<template>
  <nav class="manage-nav" aria-label="Management navigation">
    <RouterLink :to="{ name: 'manage-employees' }">Employees</RouterLink>
    <RouterLink :to="{ name: 'manage-sites' }">Sites</RouterLink>
    <RouterLink :to="{ name: 'manage-courses' }">Courses</RouterLink>
    <RouterLink :to="{ name: 'manage-medicals' }">Medicals</RouterLink>
    <RouterLink :to="{ name: 'manage-completions' }">Completions</RouterLink>
  </nav>
</template>
