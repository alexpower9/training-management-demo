import { createRouter, createWebHistory } from 'vue-router';
import { auth, initializeAuth, signIn } from '@/auth/auth';
import AuthCallback from '@/views/AuthCallback.vue';
import AuthConfiguration from '@/views/AuthConfiguration.vue';
import Manage from '@/views/Manage.vue';
import ManageCompletions from '@/views/manage/ManageCompletions.vue';
import ManageCourses from '@/views/manage/ManageCourses.vue';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';
import ManageSites from '@/views/manage/ManageSites.vue';
import Training from '@/views/Training.vue';

const routes = [
  {
    path: '/',
    redirect: '/training',
  },
  {
    path: '/training',
    name: 'training',
    component: Training,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: '/manage',
    name: 'manage',
    component: Manage,
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
    },
    children: [
      { path: '', redirect: { name: 'manage-employees' } },
      { path: 'employees', name: 'manage-employees', component: ManageEmployees },
      { path: 'sites', name: 'manage-sites', component: ManageSites },
      { path: 'sites/:siteId', name: 'manage-site', component: ManageSites },
      { path: 'courses', name: 'manage-courses', component: ManageCourses },
      { path: 'completions', name: 'manage-completions', component: ManageCompletions },
    ],
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: AuthCallback,
  },
  {
    path: '/auth/configuration',
    name: 'auth-configuration',
    component: AuthConfiguration,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/training',
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  await initializeAuth();

  if (to.name === 'auth-callback' || to.name === 'auth-configuration') {
    return true;
  }

  if (auth.state.configurationError) {
    return { name: 'auth-configuration' };
  }

  if (to.meta.requiresAuth && !auth.state.isAuthenticated) {
    await signIn(to.fullPath);
    return false;
  }

  if (to.meta.requiresAdmin && !auth.canManage.value) {
    return { name: 'training' };
  }

  return true;
});

export default router;
