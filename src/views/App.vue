<script setup>
import NavBar from '@/components/NavBar.vue';
</script>

<template>
  <div class="app-shell">
    <NavBar />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
