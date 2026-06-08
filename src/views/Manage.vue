<script setup>
import ManageNav from '@/components/manage/ManageNav.vue';
</script>

<template>
  <section class="page-stack">
    <div class="page-header">
      <div>
        <p class="eyebrow">Administrator workspace</p>
        <h1>Manage training data</h1>
        <p class="page-intro">
          Maintain employees, customers, sites, courses, requirements, and completion history.
        </p>
      </div>
      <span class="access-label">Admin access</span>
    </div>
    <ManageNav />
    <RouterView />
  </section>
</template>
