import { employees, getDemoSiteReadiness, sites } from '@/data/trainingDemoData';
import { apiRequest } from '@/services/apiClient';

const useApi = import.meta.env.PROD || import.meta.env.VITE_DATA_SOURCE === 'api';

function getDemoMedicalReadiness(siteId, asOf) {
  return getDemoSiteReadiness(siteId, asOf).map((trainingSummary) => ({
    id: trainingSummary.id,
    employee: trainingSummary.employee,
    site: trainingSummary.site,
    medicals: [],
    requiredCount: 0,
    completedCount: 0,
    expiringCount: 0,
    status: 'noRequirements',
    eligible: trainingSummary.combinedAccess.eligible,
    domainEligible: false,
    combinedAccess: trainingSummary.combinedAccess,
  }));
}

const demoRepository = {
  async listEmployees() {
    return employees.filter((employee) => employee.active);
  },
  async listSites() {
    return sites.filter((site) => site.active);
  },
  async listSiteRequirements() {
    return [];
  },
  async getSiteReadiness(siteId, asOf) {
    return getDemoMedicalReadiness(siteId, asOf);
  },
  async getMyReadiness(asOf) {
    return sites
      .filter((site) => site.active)
      .flatMap((site) => getDemoMedicalReadiness(site.id, asOf))
      .filter((summary) => summary.employee.id === employees[0].id);
  },
};

const apiRepository = {
  listEmployees: () => apiRequest('/employees'),
  listSites: () => apiRequest('/sites'),
  listSiteRequirements: (siteId, asOf) =>
    apiRequest(`/sites/${siteId}/medicals`, { query: { asOf } }),
  getSiteReadiness: (siteId, asOf) =>
    apiRequest(`/sites/${siteId}/medical-readiness`, { query: { asOf } }),
  getMyReadiness: (asOf) =>
    apiRequest('/me/medical-readiness', { query: { asOf } }),
};

export const medicalRepository = useApi ? apiRepository : demoRepository;
