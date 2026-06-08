<template>
  <nav class="manage-nav" aria-label="Management navigation">
    <RouterLink :to="{ name: 'manage-overview' }">Overview</RouterLink>
    <RouterLink :to="{ name: 'manage-employees' }">Employees</RouterLink>
    <RouterLink :to="{ name: 'manage-customers' }">Customers &amp; Sites</RouterLink>
    <RouterLink :to="{ name: 'manage-courses' }">Courses</RouterLink>
    <RouterLink :to="{ name: 'manage-completions' }">Completions</RouterLink>
    <RouterLink :to="{ name: 'manage-audit' }">Audit Log</RouterLink>
  </nav>
</template>
