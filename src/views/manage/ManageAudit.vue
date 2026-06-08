<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DetailPanel from '@/components/manage/DetailPanel.vue';
import PaginationControls from '@/components/manage/PaginationControls.vue';
import ResourceTable from '@/components/manage/ResourceTable.vue';
import { adminRepository } from '@/services/adminRepository';

const route = useRoute();
const router = useRouter();
const items = ref([]);
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const pageSize = 25;
const search = ref(route.query.search || '');
const entityType = ref(route.query.entityType || '');
const selected = ref(null);
const loading = ref(false);
const errorMessage = ref('');

function formatTimestamp(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function label(value) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('.', ' · ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function syncQuery() {
  router.replace({
    query: {
      ...(search.value ? { search: search.value } : {}),
      ...(entityType.value ? { entityType: entityType.value } : {}),
      ...(page.value > 1 ? { page: page.value } : {}),
      ...(selected.value?.id ? { id: selected.value.id } : {}),
    },
  });
}

async function loadEvents() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await adminRepository.listAuditEvents({
      page: page.value,
      pageSize,
      search: search.value,
      filters: { entityType: entityType.value || undefined },
    });
    items.value = result.items;
    total.value = result.total;
    if (route.query.id) selected.value = items.value.find((item) => item.id === route.query.id) || null;
    else if (selected.value) {
      selected.value = items.value.find((item) => item.id === selected.value.id) || null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function selectEvent(event) {
  selected.value = event;
  syncQuery();
}

function applyFilters() {
  page.value = 1;
  syncQuery();
  loadEvents();
}

function changePage(nextPage) {
  page.value = nextPage;
  syncQuery();
  loadEvents();
}

onMounted(loadEvents);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>Audit log</h2>
        <p>Review the actor, request, and before/after snapshots for every data mutation.</p>
      </div>
    </div>

    <form class="search-toolbar" @submit.prevent="applyFilters">
      <label class="field search-field">
        <span>Search</span>
        <input v-model="search" type="search" placeholder="Search actor, action, or entity" />
      </label>
      <label class="field compact-field">
        <span>Entity</span>
        <select v-model="entityType">
          <option value="">All entities</option>
          <option value="employee">Employee</option>
          <option value="customer">Customer</option>
          <option value="site">Site</option>
          <option value="course">Course</option>
          <option value="site_course_requirement">Site requirement</option>
          <option value="course_completion">Completion</option>
        </select>
      </label>
      <button class="secondary-action" type="submit">Apply</button>
    </form>

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading audit events...</div>
        <ResourceTable
          v-else
          :has-items="Boolean(items.length)"
          empty-title="No audit events found"
          empty-message="Mutations will appear here as they occur."
        >
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="event in items"
                :key="event.id"
                :class="{ 'is-selected': selected?.id === event.id }"
                tabindex="0"
                @click="selectEvent(event)"
                @keydown.enter="selectEvent(event)"
              >
                <td>{{ formatTimestamp(event.occurredAt) }}</td>
                <td><strong>{{ label(event.action) }}</strong></td>
                <td>
                  <strong>{{ label(event.entityType) }}</strong>
                  <span>{{ event.entityId }}</span>
                </td>
                <td>
                  <strong>{{ event.actorName || event.actorSubject }}</strong>
                  <span>{{ event.requestId }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </ResourceTable>
        <PaginationControls
          :page="page"
          :page-size="pageSize"
          :total="total"
          @change="changePage"
        />
      </section>

      <DetailPanel
        :title="selected ? label(selected.action) : 'Audit event detail'"
        :subtitle="selected ? formatTimestamp(selected.occurredAt) : 'Select an event to inspect its snapshots.'"
      >
        <div v-if="selected" class="detail-stack">
          <dl class="detail-list">
            <div><dt>Entity</dt><dd>{{ label(selected.entityType) }}</dd></div>
            <div><dt>Entity ID</dt><dd class="mono-value">{{ selected.entityId }}</dd></div>
            <div><dt>Actor</dt><dd>{{ selected.actorName || selected.actorSubject }}</dd></div>
            <div><dt>Request ID</dt><dd class="mono-value">{{ selected.requestId }}</dd></div>
          </dl>
          <div>
            <h3 class="detail-heading">Before</h3>
            <pre class="json-view">{{ JSON.stringify(selected.beforeData, null, 2) }}</pre>
          </div>
          <div>
            <h3 class="detail-heading">After</h3>
            <pre class="json-view">{{ JSON.stringify(selected.afterData, null, 2) }}</pre>
          </div>
        </div>
      </DetailPanel>
    </div>
  </section>
</template>
