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
  listEmployeeOptions: () => apiRequest('/admin/employee-options'),
  getEmployee: (id) => apiRequest(`/admin/employees/${id}`),
  createEmployee: (body) =>
    apiRequest('/admin/employees', { method: 'POST', body }),
  updateEmployee: (id, body) =>
    apiRequest(`/admin/employees/${id}`, { method: 'PATCH', body }),
  setEmployeeArchived: (id, archived) =>
    apiRequest(`/admin/employees/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
    }),
  resendEmployeeInvitation: (id) =>
    apiRequest(`/admin/employees/${id}/resend-invitation`, { method: 'POST' }),

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
  listCourseOptions: () => apiRequest('/admin/course-options'),
  getCourse: (id) => apiRequest(`/admin/courses/${id}`),
  createCourse: (body) => apiRequest('/admin/courses', { method: 'POST', body }),
  updateCourse: (id, body) =>
    apiRequest(`/admin/courses/${id}`, { method: 'PATCH', body }),
  setCourseArchived: (id, archived) =>
    apiRequest(`/admin/courses/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
    }),

  listMedicals: (options) =>
    apiRequest('/admin/medicals', { query: listQuery(options) }),
  listMedicalOptions: () => apiRequest('/admin/medical-options'),
  getMedical: (id) => apiRequest(`/admin/medicals/${id}`),
  createMedical: (body) => apiRequest('/admin/medicals', { method: 'POST', body }),
  updateMedical: (id, body) =>
    apiRequest(`/admin/medicals/${id}`, { method: 'PATCH', body }),
  setMedicalArchived: (id, archived) =>
    apiRequest(`/admin/medicals/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
    }),

  listCompletions: (options) =>
    apiRequest('/admin/completions', { query: listQuery(options) }),
  getCompletion: (id) => apiRequest(`/admin/completions/${id}`),
  createCompletion: (body) =>
    apiRequest('/admin/completions', { method: 'POST', body }),
  voidCompletion: (id, reason) =>
    apiRequest(`/admin/completions/${id}/void`, {
      method: 'POST',
      body: { reason },
    }),
  correctCompletionDates: (id, body) =>
    apiRequest(`/admin/completions/${id}/correct-dates`, {
      method: 'POST',
      body,
    }),

  listMedicalCompletions: (options) =>
    apiRequest('/admin/medical-completions', { query: listQuery(options) }),
  getMedicalCompletion: (id) =>
    apiRequest(`/admin/medical-completions/${id}`),
  createMedicalCompletion: (body) =>
    apiRequest('/admin/medical-completions', { method: 'POST', body }),
  voidMedicalCompletion: (id, reason) =>
    apiRequest(`/admin/medical-completions/${id}/void`, {
      method: 'POST',
      body: { reason },
    }),
  correctMedicalCompletionDates: (id, body) =>
    apiRequest(`/admin/medical-completions/${id}/correct-dates`, {
      method: 'POST',
      body,
    }),

  listPendingCompletions: (options) =>
    apiRequest('/admin/pending-completions', { query: listQuery(options) }),
  getPendingCompletion: (id) =>
    apiRequest(`/admin/pending-completions/${id}`),
  createPendingCompletion: (body) =>
    apiRequest('/admin/pending-completions', { method: 'POST', body }),
  finalizePendingCompletion: (id, completedOn) =>
    apiRequest(`/admin/pending-completions/${id}/finalize`, {
      method: 'POST',
      body: { completedOn },
    }),
  cancelPendingCompletion: (id, reason) =>
    apiRequest(`/admin/pending-completions/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),

  listMedicalPendingCompletions: (options) =>
    apiRequest('/admin/medical-pending-completions', {
      query: listQuery(options),
    }),
  getMedicalPendingCompletion: (id) =>
    apiRequest(`/admin/medical-pending-completions/${id}`),
  createMedicalPendingCompletion: (body) =>
    apiRequest('/admin/medical-pending-completions', {
      method: 'POST',
      body,
    }),
  finalizeMedicalPendingCompletion: (id, completedOn) =>
    apiRequest(`/admin/medical-pending-completions/${id}/finalize`, {
      method: 'POST',
      body: { completedOn },
    }),
  cancelMedicalPendingCompletion: (id, reason) =>
    apiRequest(`/admin/medical-pending-completions/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),

  listAdministrators: () => apiRequest('/owner/admins'),
  inviteAdministrator: (body) =>
    apiRequest('/owner/admins', { method: 'POST', body }),
};
