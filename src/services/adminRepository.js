import { apiRequest } from '@/services/apiClient';

const listQuery = (options = {}) => ({
  page: options.page || 1,
  pageSize: options.pageSize || 25,
  search: options.search || undefined,
  includeArchived: options.includeArchived ? 'true' : 'false',
  ...options.filters,
});

export const adminRepository = {
  listEmployees: (options) =>
    apiRequest('/admin/employees', { query: listQuery(options) }),
  getEmployee: (id) => apiRequest(`/admin/employees/${id}`),
  createEmployee: (body) =>
    apiRequest('/admin/employees', { method: 'POST', body }),
  updateEmployee: (id, body) =>
    apiRequest(`/admin/employees/${id}`, { method: 'PATCH', body }),
  linkEmployeeAccount: (id, subject) =>
    apiRequest(`/admin/employees/${id}/account`, {
      method: 'PUT',
      body: { subject },
    }),
  unlinkEmployeeAccount: (id) =>
    apiRequest(`/admin/employees/${id}/account`, { method: 'DELETE' }),
  setEmployeeArchived: (id, archived) =>
    apiRequest(`/admin/employees/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
    }),

  listSites: (options) => apiRequest('/admin/sites', { query: listQuery(options) }),
  listSiteOptions: () => apiRequest('/admin/site-options'),
  getSite: (id) => apiRequest(`/admin/sites/${id}`),
  createSite: (body) => apiRequest('/admin/sites', { method: 'POST', body }),
  updateSite: (id, body) =>
    apiRequest(`/admin/sites/${id}`, { method: 'PATCH', body }),
  setSiteArchived: (id, archived) =>
    apiRequest(`/admin/sites/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
    }),
  listCourses: (options) =>
    apiRequest('/admin/courses', { query: listQuery(options) }),
  getCourse: (id) => apiRequest(`/admin/courses/${id}`),
  createCourse: (body) => apiRequest('/admin/courses', { method: 'POST', body }),
  updateCourse: (id, body) =>
    apiRequest(`/admin/courses/${id}`, { method: 'PATCH', body }),
  setCourseArchived: (id, archived) =>
    apiRequest(`/admin/courses/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
    }),

  listCompletions: (options) =>
    apiRequest('/admin/completions', { query: listQuery(options) }),
  createCompletion: (body) =>
    apiRequest('/admin/completions', { method: 'POST', body }),
  voidCompletion: (id, reason) =>
    apiRequest(`/admin/completions/${id}/void`, {
      method: 'POST',
      body: { reason },
    }),

  listAdministrators: () => apiRequest('/owner/admins'),
  inviteAdministrator: (body) =>
    apiRequest('/owner/admins', { method: 'POST', body }),
};
