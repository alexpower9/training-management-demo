<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router';

const logoPath = ref('/src/assets/nme-logo.png');

const router = useRouter()
const navigateTo = (route) => {
    console.log("Went to route")
    router.push(route)
}

</script>

<template>
<div class="navbar bg-secondary shadow-sm">
  <div class="flex-1 flex items-center gap-3 pl-4">
    <img @click="navigateTo('/')" :src="logoPath" class="h-20 w-auto cursor-pointer"/>
  </div>
  <div class="flex-none">
    <ul class="menu menu-horizontal px-1 text-base-100 text-lg">
      <li><a @click="navigateTo('/training')" class="cursor-pointer !font-medium">Training</a></li>
      <li><a @click="navigateTo('/schedule')" class="cursor-pointer !font-medium">Schedule</a></li>
    </ul>
  </div>
</div>
</template>
