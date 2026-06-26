<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ArchiveBadge from '@/components/manage/ArchiveBadge.vue';
import CompletionCommentButton from '@/components/manage/CompletionCommentButton.vue';
import ConfirmDialog from '@/components/manage/ConfirmDialog.vue';
import DetailPanel from '@/components/manage/DetailPanel.vue';
import FormDrawer from '@/components/manage/FormDrawer.vue';
import PaginationControls from '@/components/manage/PaginationControls.vue';
import ResourceTable from '@/components/manage/ResourceTable.vue';
import SearchToolbar from '@/components/manage/SearchToolbar.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { addToast } from '@/composables/useToasts';
import { formatDate } from '@/data/trainingDemoData';
import { adminRepository } from '@/services/adminRepository';
import {
  completionStatus,
  daysUntilExpiry,
} from '@/utils/completionStatus';

const route = useRoute();
const router = useRouter();
const items = ref([]);
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const pageSize = 25;
const search = ref(route.query.search || '');
const includeArchived = ref(route.query.archived === 'true');
const selected = ref(null);
const loading = ref(false);
const detailLoading = ref(false);
const errorMessage = ref('');
const drawerOpen = ref(false);
const formMode = ref('create');
const saving = ref(false);
const fieldErrors = ref({});
const confirmOpen = ref(false);
const confirmBusy = ref(false);
const form = reactive({
  displayName: '',
  email: '',
});
const initialForm = ref('');

const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);
const drawerTitle = computed(() =>
  formMode.value === 'create' ? 'Add employee' : 'Edit employee',
);

function setForm(values = {}) {
  Object.assign(form, {
    displayName: values.displayName || '',
    email: values.email || '',
  });
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
}

function syncQuery(extra = {}) {
  router.replace({
    query: {
      ...(search.value ? { search: search.value } : {}),
      ...(includeArchived.value ? { archived: 'true' } : {}),
      ...(page.value > 1 ? { page: page.value } : {}),
      ...(selected.value?.id ? { id: selected.value.id } : {}),
      ...extra,
    },
  });
}

async function loadList() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await adminRepository.listEmployees({
      page: page.value,
      pageSize,
      search: search.value,
      includeArchived: includeArchived.value,
    });
    items.value = result.items;
    total.value = result.total;
    const requestedId = route.query.id;
    if (requestedId) await selectEmployee(requestedId, false);
    else if (selected.value && !items.value.some((item) => item.id === selected.value.id)) {
      selected.value = null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function selectEmployee(id, updateRoute = true) {
  detailLoading.value = true;
  try {
    selected.value = await adminRepository.getEmployee(id);
    if (updateRoute) syncQuery();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    detailLoading.value = false;
  }
}

function openCreate() {
  formMode.value = 'create';
  setForm();
  drawerOpen.value = true;
}

function openEdit() {
  if (!selected.value) return;
  formMode.value = 'edit';
  setForm(selected.value);
  drawerOpen.value = true;
}

async function saveEmployee() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    const payload =
      formMode.value === 'create'
        ? { displayName: form.displayName, email: form.email }
        : { displayName: form.displayName };
    const saved =
      formMode.value === 'create'
        ? await adminRepository.createEmployee(payload)
        : await adminRepository.updateEmployee(selected.value.id, payload);
    drawerOpen.value = false;
    addToast(
      formMode.value === 'create'
        ? 'Employee added and invitation sent.'
        : 'Employee updated.',
    );
    await loadList();
    await selectEmployee(saved.id);
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(fieldErrors.value).length) {
      addToast(error.message, 'danger');
    }
  } finally {
    saving.value = false;
  }
}

async function toggleArchive() {
  if (!selected.value) return;
  confirmBusy.value = true;
  const archived = !selected.value.archivedAt;
  try {
    const updated = await adminRepository.setEmployeeArchived(
      selected.value.id,
      archived,
    );
    confirmOpen.value = false;
    addToast(archived ? 'Employee archived.' : 'Employee restored.');
    await loadList();
    await selectEmployee(updated.id);
  } catch (error) {
    addToast(error.message, 'danger');
  } finally {
    confirmBusy.value = false;
  }
}

function applySearch() {
  page.value = 1;
  syncQuery();
  loadList();
}

function changePage(nextPage) {
  page.value = nextPage;
  syncQuery();
  loadList();
}

function completionExpiryText(completion) {
  const prefix = daysUntilExpiry(completion) < 0 ? 'Expired' : 'Expires';
  return `${prefix} ${formatDate(completion.expiresOn)}`;
}

onMounted(async () => {
  await loadList();
  if (route.query.action === 'create') openCreate();
});

watch(includeArchived, applySearch);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>Employees</h2>
        <p>Create, maintain, archive, and review employee training records.</p>
      </div>
      <button class="primary-action" type="button" @click="openCreate">Add employee</button>
    </div>

    <SearchToolbar
      v-model="search"
      v-model:include-archived="includeArchived"
      placeholder="Search employee name or email"
      @search="applySearch"
    />

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading employees...</div>
        <ResourceTable v-else :has-items="Boolean(items.length)" empty-title="No employees found">
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Email</th>
                <th>Latest completion</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="employee in items"
                :key="employee.id"
                :class="{ 'is-selected': selected?.id === employee.id }"
                tabindex="0"
                @click="selectEmployee(employee.id)"
                @keydown.enter="selectEmployee(employee.id)"
              >
                <td>
                  <strong>{{ employee.displayName }}</strong>
                </td>
                <td>{{ employee.email }}</td>
                <td>{{ employee.latestCompletionOn ? formatDate(employee.latestCompletionOn) : 'None' }}</td>
                <td><ArchiveBadge :archived="Boolean(employee.archivedAt)" /></td>
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
        :title="selected?.displayName || 'Employee detail'"
        :subtitle="selected ? 'Training record' : 'Select an employee to inspect their record.'"
      >
        <template v-if="selected" #actions>
          <div class="inline-actions">
            <button class="secondary-action" type="button" @click="openEdit">Edit</button>
            <button class="secondary-action" type="button" @click="confirmOpen = true">
              {{ selected.archivedAt ? 'Restore' : 'Archive' }}
            </button>
          </div>
        </template>

        <div v-if="detailLoading" class="loading-state">Loading employee...</div>
        <div v-else-if="selected" class="detail-stack">
          <section class="account-panel" aria-label="Employee account">
            <div>
              <h3 class="detail-heading">Account</h3>
              <strong>{{ selected.email }}</strong>
            </div>
          </section>
          <RouterLink
            :to="{ name: 'manage-completions', query: { action: 'create', employeeId: selected.id } }"
            class="primary-action"
          >
            Record completion
          </RouterLink>
          <div>
            <h3 class="detail-heading">Completion history</h3>
            <div v-if="selected.completions.length" class="stack-list">
              <article
                v-for="completion in selected.completions"
                :key="completion.id"
                class="requirement-row"
              >
                <div>
                  <strong>{{ completion.course.name }}</strong>
                  <span>Completed {{ formatDate(completion.completedOn) }}</span>
                </div>
                <div class="requirement-status">
                  <ArchiveBadge v-if="completion.voidedAt" archived />
                  <StatusBadge v-else :status="completionStatus(completion)" />
                  <div class="completion-meta-actions">
                    <span>{{ completionExpiryText(completion) }}</span>
                    <CompletionCommentButton
                      :comment="completion.comment"
                      :label="`View completion comment for ${completion.course.name}`"
                    />
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>No completion history</strong>
              <p>Record the employee's first course completion.</p>
            </div>
          </div>
        </div>
      </DetailPanel>
    </div>
  </section>

  <FormDrawer
    :open="drawerOpen"
    :title="drawerTitle"
    :dirty="formDirty"
    :saving="saving"
    @close="drawerOpen = false"
    @save="saveEmployee"
  >
    <label class="field">
      <span>Name</span>
      <input v-model="form.displayName" required maxlength="160" />
      <small v-if="fieldErrors.displayName" class="field-error">{{ fieldErrors.displayName[0] }}</small>
    </label>

    <label v-if="formMode === 'create'" class="field">
      <span>Email</span>
      <input
        v-model.trim="form.email"
        required
        maxlength="254"
        type="email"
        autocomplete="email"
      />
      <small class="field-help">
        Cognito sends this address a temporary-password invitation.
      </small>
      <small v-if="fieldErrors.email" class="field-error">
        {{ fieldErrors.email[0] }}
      </small>
    </label>
  </FormDrawer>

  <ConfirmDialog
    :open="confirmOpen"
    :title="selected?.archivedAt ? 'Restore employee?' : 'Archive employee?'"
    :message="
      selected?.archivedAt
        ? 'The employee will return to current readiness views.'
        : 'The employee will be removed from current readiness views. Completion history is preserved.'
    "
    :confirm-label="selected?.archivedAt ? 'Restore' : 'Archive'"
    :danger="!selected?.archivedAt"
    :busy="confirmBusy"
    @cancel="confirmOpen = false"
    @confirm="toggleArchive"
  />

</template>
