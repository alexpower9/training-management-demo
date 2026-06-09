<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { auth } from '@/auth/auth';
import StatusBadge from '@/components/StatusBadge.vue';
import {
  formatDate,
  sortReadiness,
  statusMeta,
  summarizeEmployeeReadiness,
} from '@/data/trainingDemoData';
import { trainingRepository } from '@/services/trainingRepository';

const employees = ref([]);
const sites = ref([]);
const siteCourses = ref([]);
const siteSummaries = ref([]);
const selectedSiteId = ref('all');
const selectedEmployeeId = ref('all');
const selectedCourseId = ref('all');
const selectedStatus = ref('all');
const selectedSummaryId = ref(null);
const loading = ref(false);
const errorMessage = ref('');
let readinessRequestId = 0;

const isAdmin = computed(() => auth.state.role === 'admin');
const isEmployee = computed(() => auth.state.role === 'employee');
const hasSelectedSite = computed(() => selectedSiteId.value !== 'all');
const hasSelectedEmployee = computed(() => selectedEmployeeId.value !== 'all');
const hasSelectedScope = computed(
  () => isEmployee.value || hasSelectedSite.value || hasSelectedEmployee.value,
);
const statusOptions = computed(() =>
  Object.entries(statusMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
);

const courseScopedSummaries = computed(() => {
  const siteScoped =
    selectedSiteId.value === 'all'
      ? siteSummaries.value
      : siteSummaries.value.filter(
          (summary) => summary.site.id === selectedSiteId.value,
        );

  if (selectedCourseId.value === 'all') {
    return siteScoped;
  }

  return siteScoped
    .map((summary) =>
      summarizeEmployeeReadiness(
        summary.employee,
        summary.site,
        summary.courses.filter((row) => row.courseId === selectedCourseId.value),
      ),
    )
    .sort(sortReadiness);
});

const filteredSummaries = computed(() =>
  courseScopedSummaries.value.filter((summary) => {
    if (selectedEmployeeId.value !== 'all' && summary.employee.id !== selectedEmployeeId.value) {
      return false;
    }

    return selectedStatus.value === 'all' || summary.status === selectedStatus.value;
  }),
);

const selectedSummary = computed(() => {
  const isVisible = filteredSummaries.value.some(
    (summary) => summary.id === selectedSummaryId.value,
  );

  if (!selectedSummaryId.value || !isVisible) return null;
  return siteSummaries.value.find((summary) => summary.id === selectedSummaryId.value) || null;
});

onMounted(async () => {
  loading.value = true;
  try {
    if (isEmployee.value) {
      siteSummaries.value = await trainingRepository.getMyReadiness();
      sites.value = siteSummaries.value.map((summary) => summary.site);
      return;
    }

    [employees.value, sites.value] = await Promise.all([
      trainingRepository.listEmployees(),
      trainingRepository.listSites(),
    ]);
  } catch (error) {
    errorMessage.value = accountErrorMessage(error);
  } finally {
    loading.value = false;
  }
});

function accountErrorMessage(error) {
  if (error.code === 'EMPLOYEE_ACCOUNT_NOT_LINKED') {
    return 'Your account is not linked to an employee training record. Contact an administrator.';
  }
  if (error.code === 'EMPLOYEE_ACCOUNT_INACTIVE') {
    return 'Your employee training record is inactive. Contact an administrator.';
  }
  return error.message;
}

function prepareReadinessLoad() {
  const requestId = ++readinessRequestId;
  selectedCourseId.value = 'all';
  selectedSummaryId.value = null;
  siteCourses.value = [];
  siteSummaries.value = [];
  errorMessage.value = '';
  loading.value = true;
  return requestId;
}

function finishReadinessLoad(requestId) {
  if (requestId === readinessRequestId) {
    loading.value = false;
  }
}

function clearReadiness() {
  readinessRequestId += 1;
  selectedCourseId.value = 'all';
  selectedSummaryId.value = null;
  siteCourses.value = [];
  siteSummaries.value = [];
  errorMessage.value = '';
  loading.value = false;
}

async function loadSiteReadiness(siteId) {
  const requestId = prepareReadinessLoad();

  try {
    const [courses, summaries] = await Promise.all([
      trainingRepository.listSiteCourses(siteId),
      trainingRepository.getSiteReadiness(siteId),
    ]);

    if (requestId !== readinessRequestId) return;
    siteCourses.value = courses;
    siteSummaries.value = summaries;
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
      sites.value.map((site) => trainingRepository.getSiteReadiness(site.id)),
    );

    if (requestId !== readinessRequestId) return;
    siteSummaries.value = summariesBySite
      .flat()
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
  if (isEmployee.value) {
    selectedCourseId.value = 'all';
    selectedSummaryId.value = null;
    siteCourses.value =
      siteId === 'all'
        ? []
        : (
            siteSummaries.value.find((summary) => summary.site.id === siteId)
              ?.courses || []
          ).map((row) => row.course);
    return;
  }

  if (siteId !== 'all') {
    loadSiteReadiness(siteId);
    return;
  }

  if (hasSelectedEmployee.value) {
    loadEmployeeReadiness(selectedEmployeeId.value);
    return;
  }

  clearReadiness();
});

watch(selectedEmployeeId, (employeeId) => {
  if (!isAdmin.value) return;
  selectedSummaryId.value = null;

  if (hasSelectedSite.value) return;

  if (employeeId !== 'all') {
    loadEmployeeReadiness(employeeId);
    return;
  }

  clearReadiness();
});

watch([selectedCourseId, selectedStatus], () => {
  selectedSummaryId.value = null;
});

function resetFilters() {
  selectedSiteId.value = 'all';
  if (isAdmin.value) selectedEmployeeId.value = 'all';
  selectedCourseId.value = 'all';
  selectedStatus.value = 'all';
  selectedSummaryId.value = null;
}

function nextAction(summary) {
  if (summary.status === 'noRequirements') return 'No requirements assigned';

  const priority = { overdue: 0, incomplete: 1, expiring: 2, compliant: 3 };
  const row = [...summary.courses].sort((a, b) => priority[a.status] - priority[b.status])[0];

  if (!row || row.status === 'compliant') return 'Ready for site access';
  if (row.status === 'overdue') return `${row.course.name} expired`;
  if (row.status === 'incomplete') return `${row.course.name} missing`;
  return `${row.course.name} expires soon`;
}

function expiryText(row) {
  if (!row.completion) return 'Not completed';
  if (row.daysUntilExpiry < 0) return `Expired ${formatDate(row.completion.expiresOn)}`;
  return formatDate(row.completion.expiresOn);
}
</script>

<template>
  <section class="page-stack">
    <section class="panel filter-panel" aria-label="Training filters">
      <div class="filter-grid">
        <label class="field">
          <span>Site</span>
          <select v-model="selectedSiteId" aria-label="Site">
            <option value="all">{{ isEmployee ? 'All sites' : 'Select a site' }}</option>
            <option v-for="site in sites" :key="site.id" :value="site.id">
              {{ site.name }}
            </option>
          </select>
        </label>

        <label v-if="isAdmin" class="field">
          <span>Employee</span>
          <select v-model="selectedEmployeeId" aria-label="Employee">
            <option value="all">All employees</option>
            <option v-for="employee in employees" :key="employee.id" :value="employee.id">
              {{ employee.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Course</span>
          <select
            v-model="selectedCourseId"
            aria-label="Course"
            :disabled="!hasSelectedSite"
          >
            <option value="all">
              {{ hasSelectedSite ? 'All site courses' : 'Select site first' }}
            </option>
            <option v-for="course in siteCourses" :key="course.id" :value="course.id">
              {{ course.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Status</span>
          <select v-model="selectedStatus">
            <option value="all">All statuses</option>
            <option v-for="status in statusOptions" :key="status.value" :value="status.value">
              {{ status.label }}
            </option>
          </select>
        </label>

        <button class="secondary-action filter-reset" type="button" @click="resetFilters">
          Reset
        </button>
      </div>
    </section>

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
    <div v-if="loading" class="panel loading-state">Loading training readiness...</div>

    <div v-else-if="hasSelectedScope" class="workspace-grid">
      <section class="panel panel--large">
        <div class="panel-header">
          <div>
            <h2>{{ isEmployee ? 'My site readiness' : 'Employee site readiness' }}</h2>
            <p>
              {{ filteredSummaries.length }}
              {{
                selectedCourseId === 'all'
                  ? isEmployee
                    ? 'site assignments'
                    : 'employee-site assignments'
                  : isEmployee
                    ? 'course records'
                    : 'employee course records'
              }}
              match your filters.
            </p>
          </div>
        </div>

        <div v-if="filteredSummaries.length" class="table-wrap">
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Site</th>
                <th>Required</th>
                <th>{{ selectedCourseId === 'all' ? 'Site status' : 'Course status' }}</th>
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
              >
                <td>
                  <strong>{{ summary.employee.name }}</strong>
                </td>
                <td>
                  <strong>{{ summary.site.name }}</strong>
                  <span>{{ summary.site.timeZone }}</span>
                </td>
                <td>
                  <strong>{{ summary.completedCount }} / {{ summary.requiredCount }}</strong>
                  <span>{{ summary.requiredCount ? 'courses current' : 'no site requirements' }}</span>
                </td>
                <td><StatusBadge :status="summary.status" /></td>
                <td>{{ nextAction(summary) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty-state">
          <strong>No matching assignments</strong>
          <p>Adjust the filters to widen the compliance view.</p>
        </div>
      </section>

      <aside class="panel detail-panel">
        <div class="panel-header">
          <div>
            <h2>{{ isEmployee ? 'Training detail' : 'Employee detail' }}</h2>
            <p v-if="selectedSummary">
              {{ selectedSummary.employee.name }} at {{ selectedSummary.site.name }}
            </p>
            <p v-else>Select a row to inspect required courses.</p>
          </div>
        </div>

        <div v-if="selectedSummary" class="detail-stack">
          <div class="profile-strip">
            <div>
              <strong>{{ selectedSummary.employee.name }}</strong>
              <span>Employee</span>
            </div>
            <div>
              <strong>{{ selectedSummary.site.name }}</strong>
              <span>{{ selectedSummary.site.timeZone }}</span>
            </div>
          </div>

          <div
            class="eligibility-strip"
            :class="{
              'eligibility-strip--eligible':
                selectedSummary.eligible && selectedSummary.status !== 'expiring',
              'eligibility-strip--warning': selectedSummary.status === 'expiring',
              'eligibility-strip--blocked': !selectedSummary.eligible,
            }"
          >
            <div>
              <strong>
                {{ selectedSummary.eligible ? 'Eligible for site access' : 'Not eligible for site access' }}
              </strong>
              <span v-if="selectedSummary.status === 'expiring'">
                Eligible now. {{ selectedSummary.expiringCount }} required
                {{ selectedSummary.expiringCount === 1 ? 'course expires' : 'courses expire' }} soon.
              </span>
            </div>
          </div>

          <div v-if="!selectedSummary.courses.length" class="empty-state">
            <strong>No site requirements</strong>
            <p>This site does not currently have required courses configured.</p>
          </div>

          <article
            v-for="row in selectedSummary.courses"
            :key="`${row.employeeId}-${row.siteId}-${row.courseId}`"
            class="requirement-row"
          >
            <div>
              <strong>{{ row.course.name }}</strong>
              <span>{{ row.course.validityMonths }} month validity</span>
            </div>
            <div class="requirement-status">
              <StatusBadge :status="row.status" />
              <span>{{ expiryText(row) }}</span>
            </div>
          </article>
        </div>
      </aside>
    </div>
  </section>
</template>
