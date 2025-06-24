<script setup>
import {computed} from 'vue'
import {useRouter} from 'vue-router'


const router = useRouter()
const navigateTo = (route) => {
    console.log("Went to route")
    router.push(route)
}




const props = defineProps({
    title: {
        type: String, 
        required: true
    },
    desc: {
        type: String,
        required:true
    },
    img_path: {
        type: String,
        required: true
    },
    path: {
      type: String,
      required: true
    }
})

const fullImagePath = computed(() => {
    return `/src/assets/${props.img_path}`
})

</script>


<template>
    <div @click="navigateTo(path)" class="card-hover-effect card border-1 max-w-lg border-grey bg-base-100 image-full shadow-sm cursor-pointer">
  <figure>
    <img
      :src="fullImagePath"/>
  </figure>
  <div class="card-body">
    <h2 class="card-title text-2xl sm:text-3xl md:text-4xl lg:text-5xl">{{ title }}</h2>
    <p class="sm:text-lg md:text-xl lg:text-2xl">{{ desc }}</p>
  </div>
</div>
</template>

<style scoped>
.card-hover-effect {
  transition: filter 0.2s ease-in-out;
}

.card-hover-effect:hover {
  filter: brightness(1.2); /* Adjust the brightness value as needed */
}
</style>