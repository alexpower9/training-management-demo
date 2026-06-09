<script setup>
import { auth } from '@/auth/auth';
</script>

<template>
  <nav class="manage-nav" aria-label="Management navigation">
    <RouterLink :to="{ name: 'manage-employees' }">Employees</RouterLink>
    <RouterLink :to="{ name: 'manage-sites' }">Sites</RouterLink>
    <RouterLink :to="{ name: 'manage-courses' }">Courses</RouterLink>
    <RouterLink :to="{ name: 'manage-completions' }">Completions</RouterLink>
    <RouterLink
      v-if="auth.canAdministerAccounts.value"
      :to="{ name: 'manage-administrators' }"
    >
      Administrators
    </RouterLink>
  </nav>
</template>
