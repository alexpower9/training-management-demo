import { getAccessToken, auth } from '@/auth/auth';
import {
  customers,
  employees,
  getDemoSiteCourses,
  getDemoSiteReadiness,
  sites,
} from '@/data/trainingDemoData';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const useApi = import.meta.env.PROD || import.meta.env.VITE_DATA_SOURCE === 'api';

async function apiRequest(path) {
  const token = await getAccessToken();
  const headers = {
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (auth.isDevelopmentAuth) {
    headers['x-demo-user-role'] = auth.state.role || 'viewer';
    headers['x-demo-user-subject'] = 'local-development';
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

const demoRepository = {
  async listEmployees() {
    return employees.filter((employee) => employee.active);
  },
  async listSites() {
    return sites
      .filter((site) => site.active)
      .map((site) => ({
        ...site,
        customer: customers.find((customer) => customer.id === site.customerId),
      }));
  },
  async listSiteCourses(siteId) {
    return getDemoSiteCourses(siteId);
  },
  async getSiteReadiness(siteId) {
    return getDemoSiteReadiness(siteId);
  },
};

const apiRepository = {
  listEmployees: () => apiRequest('/employees'),
  listSites: () => apiRequest('/sites'),
  listSiteCourses: (siteId) => apiRequest(`/sites/${siteId}/courses`),
  getSiteReadiness: (siteId) => apiRequest(`/sites/${siteId}/readiness`),
};

export const trainingRepository = useApi ? apiRepository : demoRepository;
