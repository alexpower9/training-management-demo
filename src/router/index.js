import { createRouter, createWebHashHistory } from 'vue-router';
import Manage from '@/views/Manage.vue';
import ManageCompletions from '@/views/manage/ManageCompletions.vue';
import ManageCourses from '@/views/manage/ManageCourses.vue';
import ManageEmployees from '@/views/manage/ManageEmployees.vue';
import ManageSites from '@/views/manage/ManageSites.vue';
import ManageMedicals from '@/views/manage/ManageMedicals.vue';
import Medical from '@/views/Medical.vue';
import Training from '@/views/Training.vue';

export default createRouter({
  // Hash routes work when GitHub Pages serves the app from a repository subpath.
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/training' },
    { path: '/training', name: 'training', component: Training },
    { path: '/medical', name: 'medical', component: Medical },
    {
      path: '/manage',
      name: 'manage',
      component: Manage,
      children: [
        { path: '', redirect: { name: 'manage-employees' } },
        { path: 'employees', name: 'manage-employees', component: ManageEmployees },
        { path: 'sites', name: 'manage-sites', component: ManageSites },
        { path: 'sites/:siteId', name: 'manage-site', component: ManageSites },
        { path: 'courses', name: 'manage-courses', component: ManageCourses },
        { path: 'medicals', name: 'manage-medicals', component: ManageMedicals },
        { path: 'completions', name: 'manage-completions', component: ManageCompletions },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/training' },
  ],
});
