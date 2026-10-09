<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { formatDate } from '@/data/trainingDemoData';
import { sortReadiness, statusMeta, summarizeReadiness } from '@/utils/readiness';

const props = defineProps({
  domain: {
    type: String,
    required: true,
    validator: (value) => ['training', 'medical'].includes(value),
  },
  repository: {
    type: Object,
    required: true,
  },
});

const isMedical = computed(() => props.domain === 'medical');
const domainLabel = computed(() => (isMedical.value ? 'Medical' : 'Training'));
const itemLabel = computed(() => (isMedical.value ? 'Medical' : 'Course'));
const itemLabelLower = computed(() => itemLabel.value.toLowerCase());
const itemPlural = computed(() => (isMedical.value ? 'medicals' : 'courses'));
const rowsKey = computed(() => (isMedical.value ? 'medicals' : 'courses'));
const idKey = computed(() => (isMedical.value ? 'medicalId' : 'courseId'));
const objectKey = computed(() => (isMedical.value ? 'medical' : 'course'));

const employees = ref([]);
const sites = ref([]);
const siteRequirements = ref([]);
const siteSummaries = ref([]);
const selectedSiteId = ref('all');
const selectedEmployeeId = ref('all');
const selectedRequirementId = ref('all');
const selectedStatus = ref('all');
const selectedSummaryId = ref(null);
const loading = ref(false);
const errorMessage = ref('');
let readinessRequestId = 0;

const hasSelectedSite = computed(() => selectedSiteId.value !== 'all');
const hasSelectedEmployee = computed(() => selectedEmployeeId.value !== 'all');
const hasSelectedScope = computed(
  () => hasSelectedSite.value || hasSelectedEmployee.value,
);
const statusOptions = computed(() =>
  Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
);

function summaryRows(summary) {
  return summary[rowsKey.value] || [];
}

function normalizeSummary(summary) {
  const rows = summaryRows(summary);
  const domainEligible = summary.domainEligible ?? summary.eligible;
  const combinedAccess = summary.combinedAccess || {
    status: summary.status,
    eligible: summary.eligible,
    requiredCount: summary.requiredCount,
    completedCount: summary.completedCount,
    expiringCount: summary.expiringCount,
    blockingDomains: ['incomplete', 'overdue'].includes(summary.status)
      ? [props.domain]
      : [],
  };
  return { ...summary, requirements: rows, domainEligible, combinedAccess };
}

const requirementScopedSummaries = computed(() => {
  const siteScoped = selectedSiteId.value === 'all'
    ? siteSummaries.value
    : siteSummaries.value.filter((summary) => summary.site.id === selectedSiteId.value);

  if (selectedRequirementId.value === 'all') return siteScoped;

  return siteScoped
    .map((summary) => {
      const rows = summaryRows(summary).filter(
        (row) => row[idKey.value] === selectedRequirementId.value,
      );
      const scoped = summarizeReadiness(summary.employee, summary.site, rows, {
        combinedAccess: summary.combinedAccess,
      });
      return {
        ...summary,
        ...scoped,
        // Top-level eligibility remains the unfiltered site-access decision.
        eligible: summary.eligible,
        domainEligible: scoped.eligible,
        [rowsKey.value]: rows,
        requirements: rows,
      };
    })
    .sort(sortReadiness);
});

const filteredSummaries = computed(() =>
  requirementScopedSummaries.value.filter((summary) => {
    if (
      selectedEmployeeId.value !== 'all' &&
      summary.employee.id !== selectedEmployeeId.value
    ) return false;
    return selectedStatus.value === 'all' || summary.status === selectedStatus.value;
  }),
);

const selectedSummary = computed(() => {
  if (!selectedSummaryId.value) return null;
  return filteredSummaries.value.find(
    (summary) => summary.id === selectedSummaryId.value,
  ) || null;
});

onMounted(async () => {
  loading.value = true;
  try {
    [employees.value, sites.value] = await Promise.all([
      props.repository.listEmployees(),
      props.repository.listSites(),
    ]);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
});

function prepareReadinessLoad() {
  const requestId = ++readinessRequestId;
  selectedRequirementId.value = 'all';
  selectedSummaryId.value = null;
  siteRequirements.value = [];
  siteSummaries.value = [];
  errorMessage.value = '';
  loading.value = true;
  return requestId;
}

function finishReadinessLoad(requestId) {
  if (requestId === readinessRequestId) loading.value = false;
}

function clearReadiness() {
  readinessRequestId += 1;
  selectedRequirementId.value = 'all';
  selectedSummaryId.value = null;
  siteRequirements.value = [];
  siteSummaries.value = [];
  errorMessage.value = '';
  loading.value = false;
}

async function loadSiteReadiness(siteId) {
  const requestId = prepareReadinessLoad();
  try {
    const listRequirements =
      props.repository.listSiteRequirements || props.repository.listSiteCourses;
    const [requirements, summaries] = await Promise.all([
      listRequirements(siteId),
      props.repository.getSiteReadiness(siteId),
    ]);
    if (requestId !== readinessRequestId) return;
    siteRequirements.value = requirements;
    siteSummaries.value = summaries.map(normalizeSummary);
  } catch (error) {
    if (requestId !== readinessRequestId) return;
    errorMessage.value = error.message;
  } finally {
    finishReadinessLoad(requestId);
  }
}

async function loadEmployeeReadiness(employeeId) {
  const requestId = prepareReadinessLoad();
  try {
    const summariesBySite = await Promise.all(
      sites.value.map((site) => props.repository.getSiteReadiness(site.id)),
    );
    if (requestId !== readinessRequestId) return;
    siteSummaries.value = summariesBySite
      .flat()
      .map(normalizeSummary)
      .filter((summary) => summary.employee.id === employeeId)
      .sort(sortReadiness);
  } catch (error) {
    if (requestId !== readinessRequestId) return;
    errorMessage.value = error.message;
  } finally {
    finishReadinessLoad(requestId);
  }
}

watch(selectedSiteId, (siteId) => {
  if (siteId !== 'all') return loadSiteReadiness(siteId);
  if (hasSelectedEmployee.value) return loadEmployeeReadiness(selectedEmployeeId.value);
  clearReadiness();
});

watch(selectedEmployeeId, (employeeId) => {
  selectedSummaryId.value = null;
  if (hasSelectedSite.value) return;
  if (employeeId !== 'all') return loadEmployeeReadiness(employeeId);
  clearReadiness();
});

watch([selectedRequirementId, selectedStatus], () => {
  selectedSummaryId.value = null;
});

function resetFilters() {
  selectedSiteId.value = 'all';
  selectedEmployeeId.value = 'all';
  selectedRequirementId.value = 'all';
  selectedStatus.value = 'all';
  selectedSummaryId.value = null;
}

function blockingCopy(summary) {
  const access = summary?.combinedAccess;
  if (!access || access.status === 'noRequirements') return 'No site access requirements configured';
  if (access.eligible) {
    return access.status === 'expiring'
      ? 'Eligible now. One or more requirements expire soon.'
      : 'All training and medical requirements are current.';
  }
  const blockers = access.blockingDomains || [];
  if (blockers.length === 2) return 'Blocked by training and medical requirements.';
  if (blockers[0] === 'medical') return 'Blocked by medical requirements.';
  if (blockers[0] === 'training') return 'Blocked by training requirements.';
  return 'One or more site access requirements are incomplete.';
}

function nextAction(summary) {
  const priority = { overdue: 0, incomplete: 1, expiring: 2, compliant: 3 };
  const row = [...summaryRows(summary)].sort(
    (a, b) => priority[a.status] - priority[b.status],
  )[0];
  const item = row?.[objectKey.value];
  if (row?.status === 'overdue') return `${item.name} expired`;
  if (row?.status === 'incomplete') return `${item.name} missing`;
  const blockers = summary.combinedAccess?.blockingDomains || [];
  const otherDomain = isMedical.value ? 'training' : 'medical';
  if (blockers.includes(otherDomain)) return `Resolve ${otherDomain} requirements`;
  if (blockers.includes(props.domain)) return `Resolve ${domainLabel.value.toLowerCase()} requirements`;
  if (row?.status === 'expiring') return `${item.name} expires soon`;
  if (summary.combinedAccess?.status === 'expiring') {
    return 'Eligible — requirement expires soon';
  }
  if (summary.combinedAccess?.eligible) return 'Ready for site access';
  if (summary.combinedAccess?.status === 'noRequirements') return 'Assign site requirements';
  return 'Resolve site requirements';
}

function expiryText(row) {
  if (!row.completion) return 'Not completed';
  if (row.daysUntilExpiry < 0) return `Expired ${formatDate(row.completion.expiresOn)}`;
  return formatDate(row.completion.expiresOn);
}
</script>

<template>
  <section class="page-stack">
    <section class="panel filter-panel" :aria-label="`${domainLabel} filters`">
      <div class="filter-grid">
        <label class="field">
          <span>Site</span>
          <select v-model="selectedSiteId" aria-label="Site">
            <option value="all">Select a site</option>
            <option v-for="site in sites" :key="site.id" :value="site.id">{{ site.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Employee</span>
          <select v-model="selectedEmployeeId" aria-label="Employee">
            <option value="all">All employees</option>
            <option v-for="employee in employees" :key="employee.id" :value="employee.id">{{ employee.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ itemLabel }}</span>
          <select v-model="selectedRequirementId" :aria-label="itemLabel" :disabled="!hasSelectedSite">
            <option value="all">{{ hasSelectedSite ? `All site ${itemPlural}` : 'Select site first' }}</option>
            <option v-for="requirement in siteRequirements" :key="requirement.id" :value="requirement.id">{{ requirement.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select v-model="selectedStatus" aria-label="Status">
            <option value="all">All statuses</option>
            <option v-for="status in statusOptions" :key="status.value" :value="status.value">{{ status.label }}</option>
          </select>
        </label>
        <button class="secondary-action filter-reset" type="button" @click="resetFilters">Reset</button>
      </div>
    </section>

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
    <div v-if="loading" class="panel loading-state" role="status">Loading {{ domainLabel.toLowerCase() }} readiness...</div>

    <div v-else-if="!hasSelectedScope" class="panel empty-state">
      <strong>Explore {{ domainLabel.toLowerCase() }} readiness</strong>
      <p>Select a site to see all employees, or select an employee to review every site.</p>
    </div>
    <div v-else class="workspace-grid">
      <section class="panel panel--large">
        <div class="panel-header">
          <div>
            <h2>Employee {{ domainLabel.toLowerCase() }} readiness</h2>
            <p>{{ filteredSummaries.length }} {{ selectedRequirementId === 'all' ? 'site assignments' : `${itemLabelLower} records` }} match your filters.</p>
          </div>
        </div>
        <div v-if="filteredSummaries.length" class="table-wrap">
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Employee</th><th>Site</th><th>Required</th>
                <th>{{ selectedRequirementId === 'all' ? `${domainLabel} status` : `${itemLabel} status` }}</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="summary in filteredSummaries"
                :key="summary.id"
                :class="{ 'is-selected': selectedSummary?.id === summary.id }"
                tabindex="0"
                @click="selectedSummaryId = summary.id"
                @keydown.enter="selectedSummaryId = summary.id"
                @keydown.space.prevent="selectedSummaryId = summary.id"
              >
                <td><strong>{{ summary.employee.name }}</strong></td>
                <td><strong>{{ summary.site.name }}</strong><span>{{ summary.site.timeZone }}</span></td>
                <td><strong>{{ summary.completedCount }} / {{ summary.requiredCount }}</strong><span>{{ summary.requiredCount ? 'requirements current' : `no ${itemLabelLower} requirements` }}</span></td>
                <td><StatusBadge :status="summary.status" /></td>
                <td>{{ nextAction(summary) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state"><strong>No matching assignments</strong><p>Adjust the filters to widen the compliance view.</p></div>
      </section>

      <aside class="panel detail-panel">
        <div class="panel-header">
          <div>
            <h2>Employee detail</h2>
            <p v-if="selectedSummary">{{ selectedSummary.employee.name }} at {{ selectedSummary.site.name }}</p>
            <p v-else>Select a row to inspect required {{ itemPlural }}.</p>
          </div>
        </div>
        <div v-if="selectedSummary" class="detail-stack">
          <div class="profile-strip">
            <div><strong>{{ selectedSummary.employee.name }}</strong><span>Employee</span></div>
            <div><strong>{{ selectedSummary.site.name }}</strong><span>{{ selectedSummary.site.timeZone }}</span></div>
          </div>
          <div class="eligibility-strip" :class="{
            'eligibility-strip--eligible': selectedSummary.status === 'compliant',
            'eligibility-strip--warning': selectedSummary.status === 'expiring',
            'eligibility-strip--blocked': ['incomplete', 'overdue'].includes(selectedSummary.status),
          }">
            <div><strong>{{ domainLabel }}: {{ statusMeta[selectedSummary.status]?.label }}</strong><span>{{ selectedSummary.requiredCount ? `${selectedSummary.completedCount} of ${selectedSummary.requiredCount} requirements current.` : `No ${itemLabelLower} requirements configured.` }}</span></div>
          </div>
          <div class="eligibility-strip" :class="{
            'eligibility-strip--eligible': selectedSummary.combinedAccess?.eligible && selectedSummary.combinedAccess?.status !== 'expiring',
            'eligibility-strip--warning': selectedSummary.combinedAccess?.eligible && selectedSummary.combinedAccess?.status === 'expiring',
            'eligibility-strip--blocked': !selectedSummary.combinedAccess?.eligible,
          }">
            <div><strong>{{ selectedSummary.combinedAccess?.eligible ? 'Eligible for site access' : 'Not eligible for site access' }}</strong><span>{{ blockingCopy(selectedSummary) }}</span></div>
          </div>
          <div v-if="!summaryRows(selectedSummary).length" class="empty-state"><strong>No {{ itemLabelLower }} requirements</strong><p>This site does not currently have required {{ itemPlural }} configured.</p></div>
          <article v-for="row in summaryRows(selectedSummary)" :key="`${row.employeeId}-${row.siteId}-${row[idKey]}`" class="requirement-row">
            <div><strong>{{ row[objectKey].name }}</strong><span>{{ row[objectKey].validityMonths }} month validity</span></div>
            <div class="requirement-status"><StatusBadge :status="row.status" /><span>{{ expiryText(row) }}</span></div>
          </article>
        </div>
      </aside>
    </div>
  </section>
</template>
