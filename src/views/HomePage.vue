<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import StatusBadge from '@/components/StatusBadge.vue';
import {
  courses,
  customers,
  employees,
  formatDate,
  getComplianceRows,
  getEmployeeSiteSummaries,
  referenceDate,
  statusMeta,
} from '@/data/trainingDemoData';

const rows = computed(() => getComplianceRows());
const summaries = computed(() => getEmployeeSiteSummaries(rows.value));

const completedRows = computed(() =>
  rows.value.filter((row) => ['compliant', 'expiring'].includes(row.status)),
);

const completionRate = computed(() =>
  Math.round((completedRows.value.length / rows.value.length) * 100),
);

const priorityRows = computed(() => {
  const priority = {
    overdue: 0,
    incomplete: 1,
    expiring: 2,
    compliant: 3,
  };

  return rows.value
    .filter((row) => row.status !== 'compliant')
    .sort((a, b) => {
      const priorityDelta = priority[a.status] - priority[b.status];

      if (priorityDelta !== 0) return priorityDelta;
      if (a.daysUntilExpiry === null) return 1;
      if (b.daysUntilExpiry === null) return -1;

      return a.daysUntilExpiry - b.daysUntilExpiry;
    })
    .slice(0, 7);
});

const customerRollups = computed(() =>
  customers.map((customer) => {
    const customerRows = rows.value.filter((row) => row.customerId === customer.id);
    const ready = customerRows.filter((row) => ['compliant', 'expiring'].includes(row.status)).length;
    const attention = customerRows.length - ready;

    return {
      ...customer,
      required: customerRows.length,
      ready,
      attention,
      rate: Math.round((ready / customerRows.length) * 100),
    };
  }),
);

const courseRollups = computed(() =>
  courses
    .map((course) => {
      const courseRows = rows.value.filter((row) => row.courseId === course.id);
      const complete = courseRows.filter((row) => ['compliant', 'expiring'].includes(row.status)).length;

      return {
        ...course,
        required: courseRows.length,
        complete,
        rate: courseRows.length ? Math.round((complete / courseRows.length) * 100) : 0,
      };
    })
    .filter((course) => course.required > 0)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 4),
);

const metrics = computed(() => [
  {
    label: 'Employees Tracked',
    value: employees.length,
    note: `${customers.length} active customer sites`,
  },
  {
    label: 'Ready Assignments',
    value: `${completionRate.value}%`,
    note: `${completedRows.value.length} of ${rows.value.length} requirements current`,
  },
  {
    label: 'Expiring Soon',
    value: rows.value.filter((row) => row.status === 'expiring').length,
    note: 'Within the next 45 days',
  },
  {
    label: 'Needs Attention',
    value: rows.value.filter((row) => ['incomplete', 'overdue'].includes(row.status)).length,
    note: 'Missing or expired training',
  },
]);

function expiryText(row) {
  if (!row.completion) return 'No completion recorded';
  if (row.daysUntilExpiry < 0) return `Expired ${formatDate(row.completion.expiresOn)}`;

  return `Expires ${formatDate(row.completion.expiresOn)}`;
}
</script>

<template>
  <section class="page-stack">
    <div class="page-header">
      <div>
        <p class="eyebrow">Training compliance</p>
        <h1>Operational dashboard</h1>
        <p class="page-intro">
          Demo view for NME staff to spot site access risk, expiring training, and missing
          course requirements before work is scheduled.
        </p>
      </div>

      <RouterLink to="/training" class="primary-action">Open training workspace</RouterLink>
    </div>

    <div class="metric-grid">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small>{{ metric.note }}</small>
      </article>
    </div>

    <div class="dashboard-grid">
      <section class="panel panel--large">
        <div class="panel-header">
          <div>
            <h2>Immediate attention</h2>
            <p>{{ priorityRows.length }} requirements need review as of {{ formatDate(referenceDate) }}.</p>
          </div>
          <RouterLink to="/training" class="text-action">Review all</RouterLink>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Customer / Site</th>
                <th>Course</th>
                <th>Status</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in priorityRows" :key="`${row.employeeId}-${row.customerId}-${row.courseId}`">
                <td>
                  <strong>{{ row.employee.name }}</strong>
                  <span>{{ row.employee.position }}</span>
                </td>
                <td>
                  <strong>{{ row.customer.name }}</strong>
                  <span>{{ row.customer.site }}</span>
                </td>
                <td>
                  <strong>{{ row.course.name }}</strong>
                  <span>{{ row.course.code }}</span>
                </td>
                <td><StatusBadge :status="row.status" /></td>
                <td>{{ expiryText(row) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-header">
          <div>
            <h2>Customer readiness</h2>
            <p>Current requirements by customer site.</p>
          </div>
        </div>

        <div class="stack-list">
          <article v-for="customer in customerRollups" :key="customer.id" class="mini-row">
            <div>
              <strong>{{ customer.name }}</strong>
              <span>{{ customer.site }}</span>
            </div>
            <div class="mini-row-stat">
              <strong>{{ customer.rate }}%</strong>
              <span>{{ customer.attention }} open</span>
            </div>
          </article>
        </div>
      </aside>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Mandatory course health</h2>
          <p>Lowest completion rates across active customer requirements.</p>
        </div>
      </div>

      <div class="course-health-grid">
        <article v-for="course in courseRollups" :key="course.id" class="course-health-card">
          <div>
            <span>{{ course.code }}</span>
            <strong>{{ course.name }}</strong>
          </div>
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" :style="{ width: `${course.rate}%` }"></div>
          </div>
          <p>{{ course.complete }} of {{ course.required }} requirements current</p>
        </article>
      </div>
    </section>
  </section>
</template>
