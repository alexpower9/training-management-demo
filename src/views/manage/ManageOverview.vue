<script setup>
import { onMounted, ref } from 'vue';
import { adminRepository } from '@/services/adminRepository';

const overview = ref(null);
const loading = ref(true);
const errorMessage = ref('');

onMounted(async () => {
  try {
    overview.value = await adminRepository.getOverview();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
});

const quickActions = [
  { label: 'Add employee', route: { name: 'manage-employees', query: { action: 'create' } } },
  { label: 'Add customer or site', route: { name: 'manage-customers', query: { action: 'create' } } },
  { label: 'Add course', route: { name: 'manage-courses', query: { action: 'create' } } },
  { label: 'Record completion', route: { name: 'manage-completions', query: { action: 'create' } } },
];
</script>

<template>
  <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>
  <div v-else-if="loading" class="panel loading-state">Loading management overview...</div>
  <template v-else-if="overview">
    <div class="management-metrics">
      <article class="metric-card">
        <span>Active employees</span>
        <strong>{{ overview.metrics.employees }}</strong>
      </article>
      <article class="metric-card">
        <span>Customers / Sites</span>
        <strong>{{ overview.metrics.customers }} / {{ overview.metrics.sites }}</strong>
      </article>
      <article class="metric-card">
        <span>Active courses</span>
        <strong>{{ overview.metrics.courses }}</strong>
      </article>
      <article class="metric-card">
        <span>Recent completions</span>
        <strong>{{ overview.metrics.recentCompletions }}</strong>
      </article>
    </div>

    <div class="workspace-grid">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Quick actions</h2>
            <p>Start the most common management tasks.</p>
          </div>
        </div>
        <div class="quick-action-grid">
          <RouterLink
            v-for="action in quickActions"
            :key="action.label"
            :to="action.route"
            class="quick-action"
          >
            {{ action.label }}
          </RouterLink>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Configuration health</h2>
            <p>Items that may need administrator attention.</p>
          </div>
        </div>
        <div class="stack-list">
          <div class="mini-row">
            <span>Sites without requirements</span>
            <strong>{{ overview.metrics.sitesWithoutRequirements }}</strong>
          </div>
          <div class="mini-row">
            <span>Completions expiring in 45 days</span>
            <strong>{{ overview.metrics.expiringCompletions }}</strong>
          </div>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Recent administrative activity</h2>
          <p>The newest audited changes.</p>
        </div>
        <RouterLink :to="{ name: 'manage-audit' }" class="text-action">View audit log</RouterLink>
      </div>
      <div v-if="overview.recentAudit.length" class="stack-list">
        <div v-for="event in overview.recentAudit" :key="event.id" class="mini-row">
          <div>
            <strong>{{ event.action }}</strong>
            <span>{{ event.actorName || event.actorSubject }}</span>
          </div>
          <span>{{ new Date(event.occurredAt).toLocaleString() }}</span>
        </div>
      </div>
      <div v-else class="empty-state">
        <strong>No administrative activity yet</strong>
        <p>Audited changes will appear here.</p>
      </div>
    </section>
  </template>
</template>
