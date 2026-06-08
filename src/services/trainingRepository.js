import {
  employees,
  getDemoSiteCourses,
  getDemoSiteReadiness,
  sites,
} from '@/data/trainingDemoData';
import { apiRequest } from '@/services/apiClient';

const useApi = import.meta.env.PROD || import.meta.env.VITE_DATA_SOURCE === 'api';

const demoRepository = {
  async listEmployees() {
    return employees.filter((employee) => employee.active);
  },
  async listSites() {
    return sites.filter((site) => site.active);
  },
  async listSiteCourses(siteId, asOf) {
    return getDemoSiteCourses(siteId, asOf);
  },
  async getSiteReadiness(siteId, asOf) {
    return getDemoSiteReadiness(siteId, asOf);
  },
};

const apiRepository = {
  listEmployees: () => apiRequest('/employees'),
  listSites: () => apiRequest('/sites'),
  listSiteCourses: (siteId, asOf) =>
    apiRequest(`/sites/${siteId}/courses`, { query: { asOf } }),
  getSiteReadiness: (siteId, asOf) =>
    apiRequest(`/sites/${siteId}/readiness`, { query: { asOf } }),
};

export const trainingRepository = useApi ? apiRepository : demoRepository;
