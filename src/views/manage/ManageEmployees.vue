<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ArchiveBadge from '@/components/manage/ArchiveBadge.vue';
import CompletionCommentButton from '@/components/manage/CompletionCommentButton.vue';
import ConfirmDialog from '@/components/manage/ConfirmDialog.vue';
import DetailPanel from '@/components/manage/DetailPanel.vue';
import FormDrawer from '@/components/manage/FormDrawer.vue';
import PaginationControls from '@/components/manage/PaginationControls.vue';
import PendingDateBadge from '@/components/manage/PendingDateBadge.vue';
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
const invitationConfirmOpen = ref(false);
const invitationBusy = ref(false);
const form = reactive({
  displayName: '',
  email: '',
});
const initialForm = ref('');

const accountStatuses = {
  invitationPending: {
    label: 'Invitation pending',
    description: 'The employee has not completed account setup.',
    tone: 'warning',
  },
  confirmed: {
    label: 'Account confirmed',
    description: 'The employee has completed account setup.',
    tone: 'success',
  },
  passwordResetRequired: {
    label: 'Password reset required',
    description: 'The employee must reset their password before signing in.',
    tone: 'warning',
  },
  disabled: {
    label: 'Account disabled',
    description: 'This account is disabled and cannot sign in.',
    tone: 'danger',
  },
  misconfigured: {
    label: 'Account mismatch',
    description: 'The employee email does not match the linked Cognito account.',
    tone: 'danger',
  },
  missing: {
    label: 'Account missing',
    description: 'No matching employee account was found.',
    tone: 'danger',
  },
  unknown: {
    label: 'Status unavailable',
    description: 'The employee account status could not be determined.',
    tone: 'neutral',
  },
};

const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);
const drawerTitle = computed(() =>
  formMode.value === 'create' ? 'Add employee' : 'Edit employee',
);

function accountStatus(employee) {
  return accountStatuses[employee?.account?.status] || accountStatuses.unknown;
}

function accountStatusClass(employee) {
  return `status-badge status-badge--${accountStatus(employee).tone}`;
}

function canResendInvitation(employee) {
  return (
    !employee?.archivedAt &&
    employee?.account?.status === 'invitationPending' &&
    employee.account.canResendInvitation === true
  );
}

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

function askResendInvitation() {
  if (!canResendInvitation(selected.value) || invitationBusy.value) return;
  invitationConfirmOpen.value = true;
}

async function resendInvitation() {
  if (!canResendInvitation(selected.value) || invitationBusy.value) return;

  const employeeId = selected.value.id;
  invitationBusy.value = true;
  try {
    const updated = await adminRepository.resendEmployeeInvitation(employeeId);
    invitationConfirmOpen.value = false;
    if (selected.value?.id === employeeId) {
      selected.value = { ...selected.value, ...updated };
    }
    items.value = items.value.map((item) =>
      item.id === employeeId ? { ...item, ...updated } : item,
    );
    addToast('Employee invitation resent.');
  } catch (error) {
    invitationConfirmOpen.value = false;
    addToast(error.message, 'danger');
    const employeeStillSelected = selected.value?.id === employeeId;
    const employeeAccount = employeeStillSelected
      ? selected.value.account
      : items.value.find((item) => item.id === employeeId)?.account;
    const unavailableForImmediateResend = {
      ...employeeAccount,
      canResendInvitation: false,
    };
    if (employeeStillSelected) {
      selected.value = {
        ...selected.value,
        account: unavailableForImmediateResend,
      };
    }
    items.value = items.value.map((item) =>
      item.id === employeeId
        ? { ...item, account: unavailableForImmediateResend }
        : item,
    );
    if (employeeStillSelected) {
      await selectEmployee(employeeId);
      if (selected.value?.id === employeeId) {
        items.value = items.value.map((item) =>
          item.id === employeeId
            ? {
                ...item,
                displayName: selected.value.displayName,
                email: selected.value.email,
                archivedAt: selected.value.archivedAt,
                account: selected.value.account,
              }
            : item,
        );
      }
    }
  } finally {
    invitationBusy.value = false;
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

function auditDate(value) {
  return formatDate(value?.slice(0, 10));
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
        <p>Create, maintain, archive, and review employee compliance records.</p>
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
                <th>Latest training</th>
                <th>Latest medical</th>
                <th>Account</th>
                <th>Record status</th>
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
                @keydown.space.prevent="selectEmployee(employee.id)"
              >
                <td>
                  <strong>{{ employee.displayName }}</strong>
                </td>
                <td>{{ employee.email }}</td>
                <td>{{ employee.latestCompletionOn ? formatDate(employee.latestCompletionOn) : 'None' }}</td>
                <td>{{ employee.latestMedicalCompletionOn ? formatDate(employee.latestMedicalCompletionOn) : 'None' }}</td>
                <td>
                  <span :class="accountStatusClass(employee)">
                    {{ accountStatus(employee).label }}
                  </span>
                </td>
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
        :subtitle="selected ? 'Compliance record' : 'Select an employee to inspect their record.'"
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
              <p>
                <span :class="accountStatusClass(selected)">
                  {{ accountStatus(selected).label }}
                </span>
              </p>
              <small>{{ accountStatus(selected).description }}</small>
            </div>
            <button
              v-if="canResendInvitation(selected)"
              class="secondary-action"
              type="button"
              :disabled="invitationBusy"
              @click="askResendInvitation"
            >
              {{ invitationBusy ? 'Resending...' : 'Resend invitation' }}
            </button>
          </section>
          <div class="inline-actions">
            <RouterLink
              :to="{ name: 'manage-completions', query: { type: 'training', view: 'history', action: 'create', employeeId: selected.id } }"
              class="primary-action"
            >
              Record training
            </RouterLink>
            <RouterLink
              :to="{ name: 'manage-completions', query: { type: 'medical', view: 'history', action: 'create', employeeId: selected.id } }"
              class="primary-action"
            >
              Record medical
            </RouterLink>
          </div>
          <div>
            <h3 class="detail-heading">Training pending dates</h3>
            <div v-if="selected.pendingCompletions?.length" class="stack-list">
              <article
                v-for="pending in selected.pendingCompletions"
                :key="pending.id"
                class="requirement-row"
              >
                <div>
                  <strong>{{ pending.course.name }}</strong>
                  <span>Created {{ auditDate(pending.createdAt) }}</span>
                </div>
                <div class="requirement-status">
                  <PendingDateBadge />
                  <RouterLink
                    :to="{
                      name: 'manage-completions',
                      query: {
                        type: 'training',
                        view: 'pending',
                        id: pending.id,
                        action: 'finalize',
                      },
                    }"
                    class="secondary-action secondary-action--compact"
                  >
                    Add date
                  </RouterLink>
                </div>
              </article>
            </div>
            <div v-else class="empty-state empty-state--compact">
              <strong>No pending training dates</strong>
            </div>
          </div>
          <div>
            <h3 class="detail-heading">Medical pending dates</h3>
            <div v-if="selected.pendingMedicalCompletions?.length" class="stack-list">
              <article
                v-for="pending in selected.pendingMedicalCompletions"
                :key="pending.id"
                class="requirement-row"
              >
                <div>
                  <strong>{{ pending.medical.name }}</strong>
                  <span>Created {{ auditDate(pending.createdAt) }}</span>
                </div>
                <div class="requirement-status">
                  <PendingDateBadge />
                  <RouterLink
                    :to="{
                      name: 'manage-completions',
                      query: {
                        type: 'medical',
                        view: 'pending',
                        id: pending.id,
                        action: 'finalize',
                      },
                    }"
                    class="secondary-action secondary-action--compact"
                  >
                    Add date
                  </RouterLink>
                </div>
              </article>
            </div>
            <div v-else class="empty-state empty-state--compact">
              <strong>No pending medical dates</strong>
            </div>
          </div>
          <div>
            <h3 class="detail-heading">Training completion history</h3>
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
          <div>
            <h3 class="detail-heading">Medical completion history</h3>
            <div v-if="selected.medicalCompletions?.length" class="stack-list">
              <article
                v-for="completion in selected.medicalCompletions"
                :key="completion.id"
                class="requirement-row"
              >
                <div>
                  <strong>{{ completion.medical.name }}</strong>
                  <span>Completed {{ formatDate(completion.completedOn) }}</span>
                </div>
                <div class="requirement-status">
                  <ArchiveBadge v-if="completion.voidedAt" archived />
                  <StatusBadge v-else :status="completionStatus(completion)" />
                  <div class="completion-meta-actions">
                    <span>{{ completionExpiryText(completion) }}</span>
                    <CompletionCommentButton
                      :comment="completion.comment"
                      :label="`View medical completion comment for ${completion.medical.name}`"
                    />
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>No medical completion history</strong>
              <p>Record the employee's first medical completion.</p>
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
        ? 'The employee will return to Training and Medical readiness views.'
        : 'The employee will be removed from Training and Medical readiness views. Completion history is preserved.'
    "
    :confirm-label="selected?.archivedAt ? 'Restore' : 'Archive'"
    :danger="!selected?.archivedAt"
    :busy="confirmBusy"
    @cancel="confirmOpen = false"
    @confirm="toggleArchive"
  />

  <ConfirmDialog
    :open="invitationConfirmOpen"
    title="Resend employee invitation?"
    :message="`A new temporary password will be emailed to ${selected?.email || 'this employee'}. The previous temporary password will no longer work.`"
    confirm-label="Resend invitation"
    :busy="invitationBusy"
    @cancel="invitationConfirmOpen = false"
    @confirm="resendInvitation"
  />

</template>
