import { apiRequest } from '@/services/apiClient';

const listQuery = (options = {}) => ({
  page: options.page || 1,
  pageSize: options.pageSize || 25,
  search: options.search || undefined,
  includeArchived: options.includeArchived ? 'true' : 'false',
  ...options.filters,
});

export const adminRepository = {
  getOverview: () => apiRequest('/admin/overview'),

  listEmployees: (options) =>
    apiRequest('/admin/employees', { query: listQuery(options) }),
  getEmployee: (id) => apiRequest(`/admin/employees/${id}`),
  createEmployee: (body) =>
    apiRequest('/admin/employees', { method: 'POST', body }),
  updateEmployee: (id, body) =>
    apiRequest(`/admin/employees/${id}`, { method: 'PATCH', body }),
  setEmployeeArchived: (id, archived, expectedVersion) =>
    apiRequest(`/admin/employees/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
      body: { expectedVersion },
    }),

  listCustomers: (options) =>
    apiRequest('/admin/customers', { query: listQuery(options) }),
  getCustomer: (id) => apiRequest(`/admin/customers/${id}`),
  createCustomer: (body) =>
    apiRequest('/admin/customers', { method: 'POST', body }),
  updateCustomer: (id, body) =>
    apiRequest(`/admin/customers/${id}`, { method: 'PATCH', body }),
  setCustomerArchived: (id, archived, expectedVersion) =>
    apiRequest(`/admin/customers/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
      body: { expectedVersion },
    }),

  listSites: (options) => apiRequest('/admin/sites', { query: listQuery(options) }),
  getSite: (id) => apiRequest(`/admin/sites/${id}`),
  createSite: (body) => apiRequest('/admin/sites', { method: 'POST', body }),
  updateSite: (id, body) =>
    apiRequest(`/admin/sites/${id}`, { method: 'PATCH', body }),
  setSiteArchived: (id, archived, expectedVersion) =>
    apiRequest(`/admin/sites/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
      body: { expectedVersion },
    }),

  listCourses: (options) =>
    apiRequest('/admin/courses', { query: listQuery(options) }),
  getCourse: (id) => apiRequest(`/admin/courses/${id}`),
  createCourse: (body) => apiRequest('/admin/courses', { method: 'POST', body }),
  updateCourse: (id, body) =>
    apiRequest(`/admin/courses/${id}`, { method: 'PATCH', body }),
  setCourseArchived: (id, archived, expectedVersion) =>
    apiRequest(`/admin/courses/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
      body: { expectedVersion },
    }),

  createRequirement: (body) =>
    apiRequest('/admin/requirements', { method: 'POST', body }),
  updateRequirement: (id, body) =>
    apiRequest(`/admin/requirements/${id}`, { method: 'PATCH', body }),
  endRequirement: (id, body) =>
    apiRequest(`/admin/requirements/${id}/end`, { method: 'POST', body }),

  listCompletions: (options) =>
    apiRequest('/admin/completions', { query: listQuery(options) }),
  createCompletion: (body) =>
    apiRequest('/admin/completions', { method: 'POST', body }),
  voidCompletion: (id, reason) =>
    apiRequest(`/admin/completions/${id}/void`, {
      method: 'POST',
      body: { reason },
    }),

  listAuditEvents: (options) =>
    apiRequest('/admin/audit-events', { query: listQuery(options) }),
};
