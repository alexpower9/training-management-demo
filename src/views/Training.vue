<script setup>
import { computed, onMounted, ref, watch } from 'vue';
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

const hasSelectedSite = computed(() => selectedSiteId.value !== 'all');
const statusOptions = computed(() =>
  Object.entries(statusMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
);

const courseScopedSummaries = computed(() => {
  if (selectedCourseId.value === 'all') {
    return siteSummaries.value;
  }

  return siteSummaries.value
    .map((summary) =>
      summarizeEmployeeReadiness(
        summary.employee,
        summary.customer,
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
  try {
    [employees.value, sites.value] = await Promise.all([
      trainingRepository.listEmployees(),
      trainingRepository.listSites(),
    ]);
  } catch (error) {
    errorMessage.value = error.message;
  }
});

watch(selectedSiteId, async (siteId) => {
  selectedCourseId.value = 'all';
  selectedSummaryId.value = null;
  siteCourses.value = [];
  siteSummaries.value = [];
  errorMessage.value = '';

  if (siteId === 'all') return;

  loading.value = true;

  try {
    [siteCourses.value, siteSummaries.value] = await Promise.all([
      trainingRepository.listSiteCourses(siteId),
      trainingRepository.getSiteReadiness(siteId),
    ]);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
});

watch([selectedEmployeeId, selectedCourseId, selectedStatus], () => {
  selectedSummaryId.value = null;
});

function resetFilters() {
  selectedSiteId.value = 'all';
  selectedEmployeeId.value = 'all';
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
          <span>Customer / Site</span>
          <select v-model="selectedSiteId">
            <option value="all">Select a customer site</option>
            <option v-for="site in sites" :key="site.id" :value="site.id">
              {{ site.customer.name }} - {{ site.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Employee</span>
          <select v-model="selectedEmployeeId">
            <option value="all">All employees</option>
            <option v-for="employee in employees" :key="employee.id" :value="employee.id">
              {{ employee.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Course</span>
          <select v-model="selectedCourseId" :disabled="!hasSelectedSite">
            <option value="all">
              {{ hasSelectedSite ? 'All site courses' : 'Select customer first' }}
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
    <div v-if="loading" class="panel loading-state">Loading site readiness...</div>

    <div v-else-if="hasSelectedSite" class="workspace-grid">
      <section class="panel panel--large">
        <div class="panel-header">
          <div>
            <h2>Employee site readiness</h2>
            <p>
              {{ filteredSummaries.length }}
              {{ selectedCourseId === 'all' ? 'employee-site assignments' : 'employee course records' }}
              match your filters.
            </p>
          </div>
        </div>

        <div v-if="filteredSummaries.length" class="table-wrap">
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Customer / Site</th>
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
                  <span>{{ summary.employee.position }}</span>
                </td>
                <td>
                  <strong>{{ summary.customer.name }}</strong>
                  <span>{{ summary.site.name }}</span>
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
            <h2>Employee detail</h2>
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
              <span>{{ selectedSummary.employee.position }}</span>
            </div>
            <div>
              <strong>{{ selectedSummary.customer.name }}</strong>
              <span>{{ selectedSummary.site.region }}</span>
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
            <p>This customer site does not currently have required courses configured.</p>
          </div>

          <article
            v-for="row in selectedSummary.courses"
            :key="`${row.employeeId}-${row.siteId}-${row.courseId}`"
            class="requirement-row"
          >
            <div>
              <strong>{{ row.course.name }}</strong>
              <span>{{ row.course.code }} · {{ row.course.category }}</span>
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
