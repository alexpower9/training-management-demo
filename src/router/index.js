import { createRouter, createWebHistory } from 'vue-router';
import { auth, initializeAuth, signIn } from '@/auth/auth';
import AuthCallback from '@/views/AuthCallback.vue';
import AuthConfiguration from '@/views/AuthConfiguration.vue';
import Manage from '@/views/Manage.vue';
import ManageAudit from '@/views/manage/ManageAudit.vue';
import ManageCompletions from '@/views/manage/ManageCompletions.vue';
import ManageCourses from '@/views/manage/ManageCourses.vue';
import ManageCustomers from '@/views/manage/ManageCustomers.vue';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';
import ManageOverview from '@/views/manage/ManageOverview.vue';
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
      { path: '', name: 'manage-overview', component: ManageOverview },
      { path: 'employees', name: 'manage-employees', component: ManageEmployees },
      { path: 'customers', name: 'manage-customers', component: ManageCustomers },
      { path: 'sites/:siteId', name: 'manage-site', component: ManageCustomers },
      { path: 'courses', name: 'manage-courses', component: ManageCourses },
      { path: 'completions', name: 'manage-completions', component: ManageCompletions },
      { path: 'audit', name: 'manage-audit', component: ManageAudit },
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
