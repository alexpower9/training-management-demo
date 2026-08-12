<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DetailPanel from '@/components/manage/DetailPanel.vue';
import FormDrawer from '@/components/manage/FormDrawer.vue';
import PaginationControls from '@/components/manage/PaginationControls.vue';
import ResourceTable from '@/components/manage/ResourceTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { addToast } from '@/composables/useToasts';
import { formatDate } from '@/data/trainingDemoData';
import { adminRepository } from '@/services/adminRepository';
import { completionStatus } from '@/utils/completionStatus';
import { addCalendarMonths, todayDate } from '@/utils/dates';

const route = useRoute();
const router = useRouter();
const normalizeType = (value) => (value === 'medical' ? 'medical' : 'training');
const type = ref(normalizeType(route.query.type));
const items = ref([]);
const employees = ref([]);
const requirements = ref([]);
const siteOptions = ref([]);
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const pageSize = 25;
const search = ref(route.query.search || '');
const includeVoided = ref(route.query.voided === 'true');
const selected = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const optionsErrorMessage = ref('');
const drawerOpen = ref(false);
const saving = ref(false);
const fieldErrors = ref({});
const voidOpen = ref(false);
const voidBusy = ref(false);
const voidReason = ref('');
const form = reactive({
  employeeId: '',
  requirementId: '',
  completedOn: todayDate(),
  comment: '',
});
const initialForm = ref('');
let optionsRequestId = 0;
let listRequestId = 0;

const isMedical = computed(() => type.value === 'medical');
const singular = computed(() => (isMedical.value ? 'medical' : 'course'));
const plural = computed(() => (isMedical.value ? 'medicals' : 'courses'));
const domainLabel = computed(() => (isMedical.value ? 'Medical' : 'Training'));
const itemLabel = computed(() => (isMedical.value ? 'Medical' : 'Course'));
const idKey = computed(() => (isMedical.value ? 'medicalId' : 'courseId'));
const objectKey = computed(() => (isMedical.value ? 'medical' : 'course'));
const selectedRequirement = computed(() =>
  requirements.value.find((requirement) => requirement.id === form.requirementId),
);
const selectedCompletionRequirement = computed(
  () => selected.value?.[objectKey.value] || null,
);
const activeSites = computed(() =>
  siteOptions.value.filter((site) => !site.archivedAt),
);
const activeSiteIds = computed(
  () => new Set(activeSites.value.map((site) => site.id)),
);

function assignedActiveSiteIds(requirement) {
  return new Set(
    requirement.requirements
      ?.map((assignment) => assignment.siteId)
      .filter((siteId) => activeSiteIds.value.has(siteId)) || [],
  );
}

const generalRequirements = computed(() =>
  requirements.value.filter((requirement) => assignedActiveSiteIds(requirement).size > 1),
);
const noSiteRequirements = computed(() =>
  requirements.value.filter((requirement) => !requirement.requirements?.length),
);
const siteRequirementGroups = computed(() => {
  const generalIds = new Set(generalRequirements.value.map((requirement) => requirement.id));
  const noSiteIds = new Set(noSiteRequirements.value.map((requirement) => requirement.id));

  return activeSites.value
    .map((site) => ({
      site,
      requirements: requirements.value.filter(
        (requirement) =>
          !generalIds.has(requirement.id) &&
          !noSiteIds.has(requirement.id) &&
          requirement.requirements?.some((assignment) => assignment.siteId === site.id),
      ),
    }))
    .filter((group) => group.requirements.length);
});
const otherRequirements = computed(() => {
  const groupedIds = new Set([
    ...generalRequirements.value.map((requirement) => requirement.id),
    ...noSiteRequirements.value.map((requirement) => requirement.id),
    ...siteRequirementGroups.value.flatMap((group) =>
      group.requirements.map((requirement) => requirement.id),
    ),
  ]);
  return requirements.value.filter((requirement) => !groupedIds.has(requirement.id));
});
const calculatedExpiry = computed(() =>
  addCalendarMonths(form.completedOn, selectedRequirement.value?.validityMonths),
);
const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);

function completionRequirement(completion) {
  return completion?.[objectKey.value] || null;
}

function baseQuery() {
  return {
    type: type.value,
    ...(search.value ? { search: search.value } : {}),
    ...(includeVoided.value ? { voided: 'true' } : {}),
  };
}

function syncQuery(extra = {}) {
  router.replace({
    query: {
      ...baseQuery(),
      ...(page.value > 1 ? { page: page.value } : {}),
      ...(selected.value?.id ? { id: selected.value.id } : {}),
      ...extra,
    },
  });
}

async function loadEmployeeOptions() {
  if (typeof adminRepository.listEmployeeOptions === 'function') {
    return adminRepository.listEmployeeOptions();
  }
  return (await adminRepository.listEmployees({ page: 1, pageSize: 100 })).items;
}

async function loadRequirementOptions() {
  if (isMedical.value) {
    if (typeof adminRepository.listMedicalOptions === 'function') {
      return adminRepository.listMedicalOptions();
    }
    return (await adminRepository.listMedicals({ page: 1, pageSize: 100 })).items;
  }
  if (typeof adminRepository.listCourseOptions === 'function') {
    return adminRepository.listCourseOptions();
  }
  return (await adminRepository.listCourses({ page: 1, pageSize: 100 })).items;
}

async function loadOptions() {
  const requestId = ++optionsRequestId;
  const requestedType = type.value;
  optionsErrorMessage.value = '';
  try {
    const [employeeOptions, requirementOptions, sites] = await Promise.all([
      loadEmployeeOptions(),
      loadRequirementOptions(),
      adminRepository.listSiteOptions(),
    ]);
    if (requestId !== optionsRequestId || requestedType !== type.value) return;
    employees.value = employeeOptions;
    requirements.value = requirementOptions;
    siteOptions.value = sites;
  } catch (error) {
    if (requestId !== optionsRequestId || requestedType !== type.value) return;
    optionsErrorMessage.value = error.message;
  }
}

async function loadList() {
  const requestId = ++listRequestId;
  const requestedType = type.value;
  loading.value = true;
  errorMessage.value = '';
  try {
    const list = isMedical.value
      ? adminRepository.listMedicalCompletions
      : adminRepository.listCompletions;
    const result = await list({
      page: page.value,
      pageSize,
      search: search.value,
      filters: { includeVoided: includeVoided.value ? 'true' : 'false' },
    });
    if (requestId !== listRequestId || requestedType !== type.value) return;
    items.value = result.items;
    total.value = result.total;
    const requestedId = route.query.id;
    if (requestedId) {
      selected.value = items.value.find((item) => item.id === requestedId) || null;
    } else if (selected.value) {
      selected.value = items.value.find((item) => item.id === selected.value.id) || null;
    }
  } catch (error) {
    if (requestId !== listRequestId || requestedType !== type.value) return;
    errorMessage.value = error.message;
  } finally {
    if (requestId === listRequestId && requestedType === type.value) {
      loading.value = false;
    }
  }
}

function selectCompletion(completion) {
  selected.value = completion;
  syncQuery();
}

function resetForm(values = {}) {
  const hasEmployee = Object.prototype.hasOwnProperty.call(values, 'employeeId');
  const hasRequirement = Object.prototype.hasOwnProperty.call(
    values,
    'requirementId',
  );
  Object.assign(form, {
    employeeId: hasEmployee ? values.employeeId : route.query.employeeId || '',
    requirementId: hasRequirement
      ? values.requirementId
      : route.query[isMedical.value ? 'medicalId' : 'courseId'] || '',
    completedOn: values.completedOn || todayDate(),
    comment: values.comment || '',
  });
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
}

function openCreate() {
  resetForm();
  drawerOpen.value = true;
}

function openRenewal(completion) {
  resetForm({
    employeeId: completion.employeeId,
    requirementId: completion[idKey.value],
    completedOn: todayDate(),
  });
  drawerOpen.value = true;
}

async function saveCompletion() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    const payload = {
      employeeId: form.employeeId,
      [idKey.value]: form.requirementId,
      completedOn: form.completedOn,
      comment: form.comment.trim() || null,
    };
    const saved = isMedical.value
      ? await adminRepository.createMedicalCompletion(payload)
      : await adminRepository.createCompletion(payload);
    drawerOpen.value = false;
    addToast('Completion recorded.');
    await loadList();
    selected.value = items.value.find((item) => item.id === saved.id) || null;
    syncQuery();
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(fieldErrors.value).length) addToast(error.message, 'danger');
  } finally {
    saving.value = false;
  }
}

function askVoid() {
  voidReason.value = '';
  voidOpen.value = true;
}

async function voidCompletion() {
  if (!voidReason.value.trim()) return;
  voidBusy.value = true;
  try {
    if (isMedical.value) {
      await adminRepository.voidMedicalCompletion(selected.value.id, voidReason.value);
    } else {
      await adminRepository.voidCompletion(selected.value.id, voidReason.value);
    }
    voidOpen.value = false;
    addToast('Completion voided.');
    await loadList();
  } catch (error) {
    addToast(error.message, 'danger');
  } finally {
    voidBusy.value = false;
  }
}

function applySearch() {
  page.value = 1;
  selected.value = null;
  syncQuery();
  loadList();
}

function changePage(nextPage) {
  page.value = nextPage;
  selected.value = null;
  syncQuery();
  loadList();
}

async function changeType(nextType, updateRoute = true) {
  const normalized = normalizeType(nextType);
  if (normalized === type.value) return;
  const compatibleEmployeeId = updateRoute
    ? form.employeeId || route.query.employeeId || ''
    : route.query.employeeId || '';
  type.value = normalized;
  page.value = 1;
  selected.value = null;
  drawerOpen.value = false;
  voidOpen.value = false;
  items.value = [];
  requirements.value = [];
  optionsErrorMessage.value = '';
  resetForm({ employeeId: compatibleEmployeeId, requirementId: '' });
  if (updateRoute) {
    syncQuery(compatibleEmployeeId ? { employeeId: compatibleEmployeeId } : {});
  }
  await Promise.all([loadOptions(), loadList()]);
}

onMounted(async () => {
  await loadOptions();
  await loadList();
  if (route.query.action === 'create') openCreate();
});

watch(includeVoided, applySearch);
watch(
  () => route.query.type,
  (nextType) => changeType(nextType, false),
);
</script>

<template>
  <section class="management-section">
    <nav class="completion-type-switch" aria-label="Completion type">
      <button
        type="button"
        :class="{ 'is-active': !isMedical }"
        :aria-pressed="!isMedical"
        @click="changeType('training')"
      >
        Training
      </button>
      <button
        type="button"
        :class="{ 'is-active': isMedical }"
        :aria-pressed="isMedical"
        @click="changeType('medical')"
      >
        Medical
      </button>
    </nav>

    <div class="section-heading">
      <div>
        <h2>{{ domainLabel }} completions</h2>
        <p>Record {{ singular }} completions, renew expiring records, and void incorrect entries without rewriting history.</p>
      </div>
      <button class="primary-action" type="button" @click="openCreate">Record completion</button>
    </div>

    <form class="search-toolbar" @submit.prevent="applySearch">
      <label class="field search-field">
        <span>Search</span>
        <input v-model="search" type="search" :placeholder="`Search employee or ${singular}`" />
      </label>
      <label class="checkbox-field">
        <input v-model="includeVoided" type="checkbox" />
        Show voided
      </label>
      <button class="secondary-action" type="submit">Apply</button>
    </form>

    <div v-if="errorMessage || optionsErrorMessage" class="error-banner" role="alert">
      {{ errorMessage || optionsErrorMessage }}
    </div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading {{ domainLabel.toLowerCase() }} completions...</div>
        <ResourceTable
          v-else
          :has-items="Boolean(items.length)"
          empty-title="No completions found"
          empty-message="Record a completion or adjust the filters."
        >
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Employee</th>
                <th>{{ itemLabel }}</th>
                <th>Completed</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="completion in items"
                :key="completion.id"
                :class="{ 'is-selected': selected?.id === completion.id }"
                tabindex="0"
                @click="selectCompletion(completion)"
                @keydown.enter="selectCompletion(completion)"
                @keydown.space.prevent="selectCompletion(completion)"
              >
                <td><strong>{{ completion.employee.displayName }}</strong></td>
                <td><strong>{{ completionRequirement(completion)?.name }}</strong></td>
                <td>{{ formatDate(completion.completedOn) }}</td>
                <td>{{ formatDate(completion.expiresOn) }}</td>
                <td>
                  <span v-if="completion.voidedAt" class="archive-badge archive-badge--archived">Voided</span>
                  <StatusBadge v-else :status="completionStatus(completion)" />
                </td>
              </tr>
            </tbody>
          </table>
        </ResourceTable>
        <PaginationControls :page="page" :page-size="pageSize" :total="total" @change="changePage" />
      </section>

      <DetailPanel
        :title="selected?.employee?.displayName || 'Completion detail'"
        :subtitle="selectedCompletionRequirement?.name || 'Select a completion to inspect its immutable record.'"
      >
        <template v-if="selected && !selected.voidedAt" #actions>
          <div class="inline-actions">
            <button class="secondary-action" type="button" @click="openRenewal(selected)">Renew</button>
            <button class="secondary-action" type="button" @click="askVoid">Void</button>
          </div>
        </template>

        <div v-if="selected" class="detail-stack">
          <div class="profile-strip">
            <div><strong>{{ formatDate(selected.completedOn) }}</strong><span>Completed</span></div>
            <div><strong>{{ formatDate(selected.expiresOn) }}</strong><span>Expires</span></div>
          </div>
          <section v-if="selected.comment" class="completion-comment" aria-label="Completion comment">
            <h3 class="detail-heading">Comment</h3>
            <p>{{ selected.comment }}</p>
          </section>
          <dl class="detail-list">
            <div>
              <dt>Validity applied</dt>
              <dd>{{ selected.validityMonthsApplied ? `${selected.validityMonthsApplied} months` : 'Legacy saved expiry' }}</dd>
            </div>
            <div><dt>Recorded by</dt><dd>{{ selected.recordedBySubject }}</dd></div>
            <div v-if="selected.voidedAt"><dt>Void reason</dt><dd>{{ selected.voidReason }}</dd></div>
          </dl>
        </div>
      </DetailPanel>
    </div>
  </section>

  <FormDrawer
    :open="drawerOpen"
    :title="`Record ${singular} completion`"
    :dirty="formDirty"
    :saving="saving"
    @close="drawerOpen = false"
    @save="saveCompletion"
  >
    <label class="field">
      <span>Employee</span>
      <select v-model="form.employeeId" required>
        <option value="" disabled>Select an employee</option>
        <option v-for="employee in employees" :key="employee.id" :value="employee.id">{{ employee.displayName }}</option>
      </select>
      <small v-if="fieldErrors.employeeId" class="field-error">{{ fieldErrors.employeeId[0] }}</small>
    </label>
    <label class="field">
      <span>{{ itemLabel }}</span>
      <select v-model="form.requirementId" required>
        <option value="" disabled>Select a {{ singular }}</option>
        <optgroup v-if="generalRequirements.length" :label="`General ${plural}`">
          <option v-for="requirement in generalRequirements" :key="requirement.id" :value="requirement.id">{{ requirement.name }}</option>
        </optgroup>
        <optgroup v-if="noSiteRequirements.length" label="No Site Requirement">
          <option v-for="requirement in noSiteRequirements" :key="requirement.id" :value="requirement.id">{{ requirement.name }}</option>
        </optgroup>
        <optgroup v-for="group in siteRequirementGroups" :key="group.site.id" :label="group.site.name">
          <option v-for="requirement in group.requirements" :key="`${group.site.id}:${requirement.id}`" :value="requirement.id">{{ requirement.name }}</option>
        </optgroup>
        <optgroup v-if="otherRequirements.length" :label="`Other ${plural}`">
          <option v-for="requirement in otherRequirements" :key="requirement.id" :value="requirement.id">{{ requirement.name }}</option>
        </optgroup>
      </select>
      <small v-if="fieldErrors[idKey]" class="field-error">{{ fieldErrors[idKey][0] }}</small>
    </label>
    <label class="field">
      <span>Completed on</span>
      <input v-model="form.completedOn" type="date" required />
    </label>
    <label class="field">
      <span>Comment</span>
      <textarea v-model="form.comment" maxlength="500" rows="4" placeholder="Optional" />
      <small v-if="fieldErrors.comment" class="field-error">{{ fieldErrors.comment[0] }}</small>
    </label>
    <div class="calculation-preview">
      <strong v-if="calculatedExpiry">Expires {{ formatDate(calculatedExpiry) }}</strong>
      <span v-if="selectedRequirement?.validityMonths">Calendar-month calculation using {{ selectedRequirement.validityMonths }} months.</span>
      <span v-else>Select a {{ singular }} to preview its expiry.</span>
    </div>
  </FormDrawer>

  <Teleport to="body">
    <div v-if="voidOpen" class="dialog-layer">
      <form class="confirm-dialog" role="dialog" aria-modal="true" @submit.prevent="voidCompletion">
        <h2>Void completion?</h2>
        <p>The record remains in history and will no longer count toward readiness.</p>
        <label class="field">
          <span>Reason</span>
          <textarea v-model="voidReason" required minlength="3" maxlength="500" rows="4" />
        </label>
        <div class="dialog-actions">
          <button class="secondary-action" type="button" :disabled="voidBusy" @click="voidOpen = false">Cancel</button>
          <button class="danger-action" type="submit" :disabled="voidBusy || voidReason.trim().length < 3">{{ voidBusy ? 'Voiding...' : 'Void completion' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
