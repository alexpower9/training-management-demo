<script setup>
import NavBar from '@/components/NavBar.vue';
</script>

<template>
  <div class="flex flex-col min-h-screen">
  <NavBar/>
    <div class="flex-grow bg-base-100">
  <RouterView/>
      </div>
  </div>
</template>