<script setup>
import NavBar from '@/components/NavBar.vue';
import ToastRegion from '@/components/manage/ToastRegion.vue';
</script>

<template>
  <div class="app-shell">
    <NavBar />
    <main class="app-main">
      <RouterView />
    </main>
    <ToastRegion />
  </div>
</template>
