import { createRouter, createWebHistory } from "vue-router";
import HomePage from "@/views/HomePage.vue";
import Training from "@/views/Training.vue";

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage
  },
  {
    path: '/training',
    name: 'training',
    component: Training
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), 
  routes
})

export default router