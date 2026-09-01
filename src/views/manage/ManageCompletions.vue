<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DetailPanel from '@/components/manage/DetailPanel.vue';
import FormDrawer from '@/components/manage/FormDrawer.vue';
import PaginationControls from '@/components/manage/PaginationControls.vue';
import PendingDateBadge from '@/components/manage/PendingDateBadge.vue';
import ResourceTable from '@/components/manage/ResourceTable.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { addToast } from '@/composables/useToasts';
import { formatDate } from '@/data/trainingDemoData';
import { adminRepository } from '@/services/adminRepository';
import { completionStatus } from '@/utils/completionStatus';
import { addCalendarMonths } from '@/utils/dates';

const route = useRoute();
const router = useRouter();
const normalizeType = (value) => (value === 'medical' ? 'medical' : 'training');
const normalizeView = (value) => (value === 'pending' ? 'pending' : 'history');
const initialView = normalizeView(route.query.view);

const type = ref(normalizeType(route.query.type));
const view = ref(initialView);
const items = ref([]);
const employees = ref([]);
const requirements = ref([]);
const siteOptions = ref([]);
const total = ref(0);
const pageSize = 25;
const historyFilters = reactive({
  page: initialView === 'history' ? Number(route.query.page) || 1 : 1,
  search: initialView === 'history' ? route.query.search || '' : '',
});
const pendingFilters = reactive({
  page: initialView === 'pending' ? Number(route.query.page) || 1 : 1,
  search: initialView === 'pending' ? route.query.search || '' : '',
});
const includeVoided = ref(route.query.voided === 'true');
const includeResolved = ref(
  route.query.resolved === 'true' || route.query.includeResolved === 'true',
);
const selected = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const optionsErrorMessage = ref('');

const drawerOpen = ref(false);
const saving = ref(false);
const fieldErrors = ref({});
const form = reactive({
  employeeId: '',
  requirementId: '',
  completedOn: '',
  comment: '',
});
const initialForm = ref('');

const finalizeDrawerOpen = ref(false);
const finalizeSaving = ref(false);
const finalizeFieldErrors = ref({});
const finalizeForm = reactive({ completedOn: '' });
const initialFinalizeForm = ref('');

const correctionDrawerOpen = ref(false);
const correctionSaving = ref(false);
const correctionFieldErrors = ref({});
const correctionForm = reactive({
  completedOn: '',
  expiresOn: '',
  reason: '',
});
const initialCorrectionForm = ref('');

const voidOpen = ref(false);
const voidBusy = ref(false);
const voidReason = ref('');
const cancelOpen = ref(false);
const cancelBusy = ref(false);
const cancelReason = ref('');

let optionsRequestId = 0;
let listRequestId = 0;
let correctionRequestId = 0;

const isMedical = computed(() => type.value === 'medical');
const isPendingView = computed(() => view.value === 'pending');
const singular = computed(() => (isMedical.value ? 'medical' : 'course'));
const plural = computed(() => (isMedical.value ? 'medicals' : 'courses'));
const domainLabel = computed(() => (isMedical.value ? 'Medical' : 'Training'));
const itemLabel = computed(() => (isMedical.value ? 'Medical' : 'Course'));
const idKey = computed(() => (isMedical.value ? 'medicalId' : 'courseId'));
const objectKey = computed(() => (isMedical.value ? 'medical' : 'course'));
const page = computed({
  get: () => (isPendingView.value ? pendingFilters.page : historyFilters.page),
  set: (value) => {
    if (isPendingView.value) pendingFilters.page = value;
    else historyFilters.page = value;
  },
});
const search = computed({
  get: () => (isPendingView.value ? pendingFilters.search : historyFilters.search),
  set: (value) => {
    if (isPendingView.value) pendingFilters.search = value;
    else historyFilters.search = value;
  },
});
const selectedRequirement = computed(() =>
  requirements.value.find((requirement) => requirement.id === form.requirementId),
);
const selectedRecordRequirement = computed(
  () => selected.value?.[objectKey.value] || null,
);
const activeSites = computed(() =>
  siteOptions.value.filter((site) => !site.archivedAt),
);
const activeSiteIds = computed(
  () => new Set(activeSites.value.map((site) => site.id)),
);
const calculatedExpiry = computed(() =>
  addCalendarMonths(form.completedOn, selectedRequirement.value?.validityMonths),
);
const finalizedExpiry = computed(() =>
  addCalendarMonths(
    finalizeForm.completedOn,
    selected.value?.validityMonthsSnapshot,
  ),
);
const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);
const finalizeFormDirty = computed(
  () => JSON.stringify(finalizeForm) !== initialFinalizeForm.value,
);
const correctionFormDirty = computed(
  () => JSON.stringify(correctionForm) !== initialCorrectionForm.value,
);
const selectedPendingIsOpen = computed(
  () => isPendingView.value && selected.value?.status === 'pending',
);

function assignedActiveSiteIds(requirement) {
  return new Set(
    requirement.requirements
      ?.map((assignment) => assignment.siteId)
      .filter((siteId) => activeSiteIds.value.has(siteId)) || [],
  );
}

const generalRequirements = computed(() =>
  requirements.value.filter(
    (requirement) => assignedActiveSiteIds(requirement).size > 1,
  ),
);
const noSiteRequirements = computed(() =>
  requirements.value.filter((requirement) => !requirement.requirements?.length),
);
const siteRequirementGroups = computed(() => {
  const generalIds = new Set(
    generalRequirements.value.map((requirement) => requirement.id),
  );
  const noSiteIds = new Set(
    noSiteRequirements.value.map((requirement) => requirement.id),
  );

  return activeSites.value
    .map((site) => ({
      site,
      requirements: requirements.value.filter(
        (requirement) =>
          !generalIds.has(requirement.id) &&
          !noSiteIds.has(requirement.id) &&
          requirement.requirements?.some(
            (assignment) => assignment.siteId === site.id,
          ),
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
  return requirements.value.filter(
    (requirement) => !groupedIds.has(requirement.id),
  );
});

function completionRequirement(completion) {
  return completion?.[objectKey.value] || null;
}

function auditDate(value) {
  return formatDate(value?.slice(0, 10));
}

function finalizedCompletionId(pending) {
  return pending?.completionId || pending?.completion?.id || null;
}

function baseQuery() {
  return {
    type: type.value,
    view: view.value,
    ...(search.value ? { search: search.value } : {}),
    ...(!isPendingView.value && includeVoided.value ? { voided: 'true' } : {}),
    ...(isPendingView.value && includeResolved.value
      ? { resolved: 'true' }
      : {}),
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

function listMethod() {
  if (isPendingView.value) {
    return isMedical.value
      ? adminRepository.listMedicalPendingCompletions
      : adminRepository.listPendingCompletions;
  }
  return isMedical.value
    ? adminRepository.listMedicalCompletions
    : adminRepository.listCompletions;
}

function getMethod() {
  if (isPendingView.value) {
    return isMedical.value
      ? adminRepository.getMedicalPendingCompletion
      : adminRepository.getPendingCompletion;
  }
  return isMedical.value
    ? adminRepository.getMedicalCompletion
    : adminRepository.getCompletion;
}

async function loadList(requestedId = route.query.id) {
  const requestId = ++listRequestId;
  const requestedType = type.value;
  const requestedView = view.value;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await listMethod()({
      page: page.value,
      pageSize,
      search: search.value,
      filters: isPendingView.value
        ? { includeResolved: includeResolved.value ? 'true' : 'false' }
        : { includeVoided: includeVoided.value ? 'true' : 'false' },
    });
    if (
      requestId !== listRequestId ||
      requestedType !== type.value ||
      requestedView !== view.value
    ) {
      return;
    }

    items.value = result.items;
    total.value = result.total;
    if (requestedId) {
      let nextSelected = items.value.find((item) => item.id === requestedId);
      if (!nextSelected) nextSelected = await getMethod()(requestedId);
      if (
        requestId !== listRequestId ||
        requestedType !== type.value ||
        requestedView !== view.value
      ) {
        return;
      }
      selected.value = nextSelected;
    } else if (selected.value) {
      selected.value =
        items.value.find((item) => item.id === selected.value.id) || null;
    }
  } catch (error) {
    if (
      requestId !== listRequestId ||
      requestedType !== type.value ||
      requestedView !== view.value
    ) {
      return;
    }
    errorMessage.value = error.message;
  } finally {
    if (
      requestId === listRequestId &&
      requestedType === type.value &&
      requestedView === view.value
    ) {
      loading.value = false;
    }
  }
}

function selectRecord(record) {
  selected.value = record;
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
    completedOn: values.completedOn || '',
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
  });
  drawerOpen.value = true;
}

async function showSavedRecord(saved, targetView) {
  if (view.value !== targetView) {
    view.value = targetView;
    items.value = [];
  }
  page.value = 1;
  selected.value = null;
  await loadList(null);
  selected.value = items.value.find((item) => item.id === saved.id) || saved;
  syncQuery();
}

async function saveCompletion() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    const payload = {
      employeeId: form.employeeId,
      [idKey.value]: form.requirementId,
      comment: form.comment.trim() || null,
    };
    const isDatedCompletion = Boolean(form.completedOn);
    let saved;
    if (isDatedCompletion) {
      saved = isMedical.value
        ? await adminRepository.createMedicalCompletion({
            ...payload,
            completedOn: form.completedOn,
          })
        : await adminRepository.createCompletion({
            ...payload,
            completedOn: form.completedOn,
          });
    } else {
      saved = isMedical.value
        ? await adminRepository.createMedicalPendingCompletion(payload)
        : await adminRepository.createPendingCompletion(payload);
    }
    drawerOpen.value = false;
    addToast(
      isDatedCompletion
        ? 'Completion recorded.'
        : 'Pending date saved. It will not affect readiness until finalized.',
    );
    await showSavedRecord(saved, isDatedCompletion ? 'history' : 'pending');
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(fieldErrors.value).length) addToast(error.message, 'danger');
  } finally {
    saving.value = false;
  }
}

function openFinalize() {
  if (!selectedPendingIsOpen.value) return;
  finalizeForm.completedOn = '';
  initialFinalizeForm.value = JSON.stringify(finalizeForm);
  finalizeFieldErrors.value = {};
  finalizeDrawerOpen.value = true;
}

async function finalizePendingCompletion() {
  if (!selectedPendingIsOpen.value || !finalizeForm.completedOn) return;
  finalizeSaving.value = true;
  finalizeFieldErrors.value = {};
  try {
    const updated = isMedical.value
      ? await adminRepository.finalizeMedicalPendingCompletion(
          selected.value.id,
          finalizeForm.completedOn,
        )
      : await adminRepository.finalizePendingCompletion(
          selected.value.id,
          finalizeForm.completedOn,
        );
    finalizeDrawerOpen.value = false;
    addToast('Completion date added. The completion now counts toward readiness.');
    await loadList(null);
    selected.value = updated;
    syncQuery();
  } catch (error) {
    finalizeFieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(finalizeFieldErrors.value).length) {
      addToast(error.message, 'danger');
    }
  } finally {
    finalizeSaving.value = false;
  }
}

async function showFinalizedCompletion() {
  const id = finalizedCompletionId(selected.value);
  if (!id) return;
  view.value = 'history';
  historyFilters.page = 1;
  selected.value = null;
  items.value = [];
  syncQuery({ id });
  await loadList(id);
}

function openDateCorrection() {
  if (!selected.value || selected.value.voidedAt || isPendingView.value) return;
  Object.assign(correctionForm, {
    completedOn: selected.value.completedOn,
    expiresOn: selected.value.expiresOn,
    reason: '',
  });
  initialCorrectionForm.value = JSON.stringify(correctionForm);
  correctionFieldErrors.value = {};
  correctionDrawerOpen.value = true;
}

function correctionValidationErrors() {
  const errors = {};
  if (!correctionForm.completedOn) {
    errors.completedOn = ['Enter the corrected completion date.'];
  }
  if (!correctionForm.expiresOn) {
    errors.expiresOn = ['Enter the corrected expiration date.'];
  }
  if (
    correctionForm.completedOn &&
    correctionForm.expiresOn &&
    correctionForm.completedOn === selected.value?.completedOn &&
    correctionForm.expiresOn === selected.value?.expiresOn
  ) {
    errors.completedOn = ['Enter a different completion or expiry date.'];
    errors.expiresOn = ['Enter a different completion or expiry date.'];
  } else if (
    correctionForm.completedOn &&
    correctionForm.expiresOn &&
    correctionForm.expiresOn < correctionForm.completedOn
  ) {
    errors.expiresOn = ['Expiry date must be on or after the completion date.'];
  }
  const reasonLength = correctionForm.reason.trim().length;
  if (reasonLength < 3 || reasonLength > 500) {
    errors.reason = ['Enter a correction reason between 3 and 500 characters.'];
  }
  return errors;
}

async function correctCompletionDates() {
  correctionFieldErrors.value = correctionValidationErrors();
  if (Object.keys(correctionFieldErrors.value).length) return;

  const requestId = ++correctionRequestId;
  const requestedType = type.value;
  const requestedView = view.value;
  const sourceId = selected.value?.id;
  const contextMatchesSource = () =>
    requestId === correctionRequestId &&
    requestedType === type.value &&
    requestedView === view.value &&
    sourceId === selected.value?.id &&
    correctionDrawerOpen.value;
  const contextMatchesDomain = () =>
    requestId === correctionRequestId &&
    requestedType === type.value &&
    requestedView === view.value &&
    correctionDrawerOpen.value;

  correctionSaving.value = true;
  try {
    const payload = {
      completedOn: correctionForm.completedOn,
      expiresOn: correctionForm.expiresOn,
      reason: correctionForm.reason.trim(),
    };
    const replacement = requestedType === 'medical'
      ? await adminRepository.correctMedicalCompletionDates(
          sourceId,
          payload,
        )
      : await adminRepository.correctCompletionDates(sourceId, payload);
    if (!contextMatchesSource()) return;

    await loadList(null);
    if (!contextMatchesDomain()) return;

    selected.value =
      items.value.find((item) => item.id === replacement.id) || replacement;
    correctionDrawerOpen.value = false;
    addToast('Completion dates corrected. The original remains in voided history.');
    syncQuery();
  } catch (error) {
    if (!contextMatchesSource()) return;
    correctionFieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(correctionFieldErrors.value).length) {
      addToast(error.message, 'danger');
    }
  } finally {
    if (requestId === correctionRequestId) correctionSaving.value = false;
  }
}

function askCancelPending() {
  cancelReason.value = '';
  cancelOpen.value = true;
}

async function cancelPendingCompletion() {
  if (!selectedPendingIsOpen.value || cancelReason.value.trim().length < 3) return;
  cancelBusy.value = true;
  try {
    const updated = isMedical.value
      ? await adminRepository.cancelMedicalPendingCompletion(
          selected.value.id,
          cancelReason.value.trim(),
        )
      : await adminRepository.cancelPendingCompletion(
          selected.value.id,
          cancelReason.value.trim(),
        );
    cancelOpen.value = false;
    addToast('Pending date cancelled.');
    await loadList(null);
    selected.value = updated;
    syncQuery();
  } catch (error) {
    addToast(error.message, 'danger');
  } finally {
    cancelBusy.value = false;
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
      await adminRepository.voidMedicalCompletion(
        selected.value.id,
        voidReason.value,
      );
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
  loadList(null);
}

function changePage(nextPage) {
  page.value = nextPage;
  selected.value = null;
  syncQuery();
  loadList(null);
}

async function changeView(nextView, updateRoute = true) {
  const normalized = normalizeView(nextView);
  if (normalized === view.value) return;
  view.value = normalized;
  selected.value = null;
  items.value = [];
  drawerOpen.value = false;
  finalizeDrawerOpen.value = false;
  correctionDrawerOpen.value = false;
  voidOpen.value = false;
  cancelOpen.value = false;
  if (updateRoute) syncQuery();
  await loadList(null);
}

async function changeType(nextType, updateRoute = true) {
  const normalized = normalizeType(nextType);
  if (normalized === type.value) return;
  const compatibleEmployeeId = updateRoute
    ? form.employeeId || route.query.employeeId || ''
    : route.query.employeeId || '';
  type.value = normalized;
  historyFilters.page = 1;
  pendingFilters.page = 1;
  selected.value = null;
  drawerOpen.value = false;
  finalizeDrawerOpen.value = false;
  correctionDrawerOpen.value = false;
  voidOpen.value = false;
  cancelOpen.value = false;
  items.value = [];
  requirements.value = [];
  optionsErrorMessage.value = '';
  resetForm({ employeeId: compatibleEmployeeId, requirementId: '' });
  if (updateRoute) {
    syncQuery(compatibleEmployeeId ? { employeeId: compatibleEmployeeId } : {});
  }
  await Promise.all([loadOptions(), loadList(null)]);
}

onMounted(async () => {
  await loadOptions();
  await loadList();
  if (route.query.action === 'create') openCreate();
  if (
    route.query.action === 'finalize' &&
    isPendingView.value &&
    selectedPendingIsOpen.value
  ) {
    openFinalize();
  }
});

watch(includeVoided, () => {
  if (!isPendingView.value) applySearch();
});
watch(includeResolved, () => {
  if (isPendingView.value) applySearch();
});
watch(
  () => route.query.type,
  (nextType) => changeType(nextType, false),
);
watch(
  () => route.query.view,
  (nextView) => changeView(nextView, false),
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

    <nav class="completion-type-switch" aria-label="Completion view">
      <button
        type="button"
        :class="{ 'is-active': !isPendingView }"
        :aria-pressed="!isPendingView"
        @click="changeView('history')"
      >
        Completion history
      </button>
      <button
        type="button"
        :class="{ 'is-active': isPendingView }"
        :aria-pressed="isPendingView"
        @click="changeView('pending')"
      >
        Pending dates
      </button>
    </nav>

    <div class="section-heading">
      <div>
        <h2>
          {{ domainLabel }} {{ isPendingView ? 'pending dates' : 'completions' }}
        </h2>
        <p v-if="isPendingView">
          Add completion dates when they are confirmed. Pending dates do not affect readiness.
        </p>
        <p v-else>
          Record {{ singular }} completions, renew expiring records, and void incorrect entries without rewriting history.
        </p>
      </div>
      <button class="primary-action" type="button" @click="openCreate">
        Add completion
      </button>
    </div>

    <form class="search-toolbar" @submit.prevent="applySearch">
      <label class="field search-field">
        <span>Search</span>
        <input
          v-model="search"
          type="search"
          :placeholder="`Search employee or ${singular}`"
        />
      </label>
      <label v-if="isPendingView" class="checkbox-field">
        <input v-model="includeResolved" type="checkbox" />
        Show resolved
      </label>
      <label v-else class="checkbox-field">
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
        <div v-if="loading" class="loading-state">
          Loading {{ domainLabel.toLowerCase() }} {{ isPendingView ? 'pending dates' : 'completions' }}...
        </div>
        <ResourceTable
          v-else
          :has-items="Boolean(items.length)"
          :empty-title="isPendingView ? 'No pending dates found' : 'No completions found'"
          :empty-message="
            isPendingView
              ? 'Add a completion without a date or adjust the filters.'
              : 'Record a completion or adjust the filters.'
          "
        >
          <table v-if="isPendingView" class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Employee</th>
                <th>{{ itemLabel }}</th>
                <th>Created</th>
                <th>Validity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="pending in items"
                :key="pending.id"
                :class="{ 'is-selected': selected?.id === pending.id }"
                tabindex="0"
                @click="selectRecord(pending)"
                @keydown.enter="selectRecord(pending)"
                @keydown.space.prevent="selectRecord(pending)"
              >
                <td><strong>{{ pending.employee.displayName }}</strong></td>
                <td><strong>{{ completionRequirement(pending)?.name }}</strong></td>
                <td>{{ auditDate(pending.createdAt) }}</td>
                <td>{{ pending.validityMonthsSnapshot }} months</td>
                <td><PendingDateBadge :status="pending.status" /></td>
              </tr>
            </tbody>
          </table>

          <table v-else class="data-table data-table--interactive">
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
                @click="selectRecord(completion)"
                @keydown.enter="selectRecord(completion)"
                @keydown.space.prevent="selectRecord(completion)"
              >
                <td><strong>{{ completion.employee.displayName }}</strong></td>
                <td><strong>{{ completionRequirement(completion)?.name }}</strong></td>
                <td>{{ formatDate(completion.completedOn) }}</td>
                <td>{{ formatDate(completion.expiresOn) }}</td>
                <td>
                  <div class="completion-status-stack">
                    <span
                      v-if="completion.voidedAt"
                      class="archive-badge archive-badge--archived"
                    >
                      Voided
                    </span>
                    <StatusBadge v-else :status="completionStatus(completion)" />
                    <span v-if="completion.expiryManuallySet" class="manual-expiry-indicator">
                      Corrected · manual expiry
                    </span>
                  </div>
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
        :title="selected?.employee?.displayName || (isPendingView ? 'Pending date detail' : 'Completion detail')"
        :subtitle="
          selectedRecordRequirement?.name ||
          (isPendingView
            ? 'Select a pending date to inspect its record.'
            : 'Select a completion to inspect its immutable record.')
        "
      >
        <template v-if="selected" #actions>
          <div v-if="isPendingView" class="inline-actions">
            <template v-if="selectedPendingIsOpen">
              <button class="primary-action" type="button" @click="openFinalize">
                Add completion date
              </button>
              <button class="secondary-action" type="button" @click="askCancelPending">
                Cancel
              </button>
            </template>
            <button
              v-else-if="selected.status === 'finalized' && finalizedCompletionId(selected)"
              class="secondary-action"
              type="button"
              @click="showFinalizedCompletion"
            >
              View completion
            </button>
          </div>
          <div v-else-if="!selected.voidedAt" class="inline-actions">
            <button class="secondary-action" type="button" @click="openRenewal(selected)">
              Renew
            </button>
            <button class="secondary-action" type="button" @click="openDateCorrection">
              Edit dates
            </button>
            <button class="secondary-action" type="button" @click="askVoid">Void</button>
          </div>
        </template>

        <div v-if="selected && isPendingView" class="detail-stack">
          <div class="profile-strip">
            <div>
              <strong>{{ auditDate(selected.createdAt) }}</strong>
              <span>Created</span>
            </div>
            <div>
              <strong>{{ selected.validityMonthsSnapshot }} months</strong>
              <span>Validity saved</span>
            </div>
          </div>
          <p><PendingDateBadge :status="selected.status" /></p>
          <section v-if="selected.comment" class="completion-comment" aria-label="Pending date comment">
            <h3 class="detail-heading">Comment</h3>
            <p>{{ selected.comment }}</p>
          </section>
          <div v-if="selected.status === 'finalized' && selected.completion" class="profile-strip">
            <div>
              <strong>{{ formatDate(selected.completion.completedOn) }}</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>{{ formatDate(selected.completion.expiresOn) }}</strong>
              <span>Expires</span>
            </div>
          </div>
          <dl class="detail-list">
            <div><dt>Created by</dt><dd>{{ selected.createdBySubject }}</dd></div>
            <div v-if="selected.resolvedAt">
              <dt>Resolved</dt><dd>{{ auditDate(selected.resolvedAt) }}</dd>
            </div>
            <div v-if="selected.resolvedBySubject">
              <dt>Resolved by</dt><dd>{{ selected.resolvedBySubject }}</dd>
            </div>
            <div v-if="selected.cancellationReason">
              <dt>Cancellation reason</dt><dd>{{ selected.cancellationReason }}</dd>
            </div>
          </dl>
        </div>

        <div v-else-if="selected" class="detail-stack">
          <p v-if="selected.expiryManuallySet">
            <span class="manual-expiry-indicator">Corrected dates · expiry manually set</span>
          </p>
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
              <dd>
                {{ selected.validityMonthsApplied ? `${selected.validityMonthsApplied} months` : 'Legacy saved expiry' }}
              </dd>
            </div>
            <div><dt>Recorded by</dt><dd>{{ selected.recordedBySubject }}</dd></div>
            <div v-if="selected.correctsCompletionId">
              <dt>Date audit</dt><dd>Corrected replacement of an earlier completion</dd>
            </div>
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
        <option v-for="employee in employees" :key="employee.id" :value="employee.id">
          {{ employee.displayName }}
        </option>
      </select>
      <small v-if="fieldErrors.employeeId" class="field-error">{{ fieldErrors.employeeId[0] }}</small>
    </label>
    <label class="field">
      <span>{{ itemLabel }}</span>
      <select v-model="form.requirementId" required>
        <option value="" disabled>Select a {{ singular }}</option>
        <optgroup v-if="generalRequirements.length" :label="`General ${plural}`">
          <option v-for="requirement in generalRequirements" :key="requirement.id" :value="requirement.id">
            {{ requirement.name }}
          </option>
        </optgroup>
        <optgroup v-if="noSiteRequirements.length" label="No Site Requirement">
          <option v-for="requirement in noSiteRequirements" :key="requirement.id" :value="requirement.id">
            {{ requirement.name }}
          </option>
        </optgroup>
        <optgroup v-for="group in siteRequirementGroups" :key="group.site.id" :label="group.site.name">
          <option v-for="requirement in group.requirements" :key="`${group.site.id}:${requirement.id}`" :value="requirement.id">
            {{ requirement.name }}
          </option>
        </optgroup>
        <optgroup v-if="otherRequirements.length" :label="`Other ${plural}`">
          <option v-for="requirement in otherRequirements" :key="requirement.id" :value="requirement.id">
            {{ requirement.name }}
          </option>
        </optgroup>
      </select>
      <small v-if="fieldErrors[idKey]" class="field-error">{{ fieldErrors[idKey][0] }}</small>
    </label>
    <label class="field">
      <span>Completed on (optional)</span>
      <input v-model="form.completedOn" type="date" />
      <small class="field-help">
        Leave this blank to save a pending date. It will not count toward readiness until finalized.
      </small>
      <small v-if="fieldErrors.completedOn" class="field-error">{{ fieldErrors.completedOn[0] }}</small>
    </label>
    <label class="field">
      <span>Comment</span>
      <textarea v-model="form.comment" maxlength="500" rows="4" placeholder="Optional" />
      <small v-if="fieldErrors.comment" class="field-error">{{ fieldErrors.comment[0] }}</small>
    </label>
    <div class="calculation-preview">
      <template v-if="form.completedOn">
        <strong v-if="calculatedExpiry">Expires {{ formatDate(calculatedExpiry) }}</strong>
        <span v-if="selectedRequirement?.validityMonths">
          Calendar-month calculation using {{ selectedRequirement.validityMonths }} months.
        </span>
        <span v-else>Select a {{ singular }} to preview its expiry.</span>
      </template>
      <template v-else>
        <strong>Pending date</strong>
        <span>
          The {{ singular }} and its current validity will be saved now; add the confirmed completion date later.
        </span>
      </template>
    </div>
  </FormDrawer>

  <FormDrawer
    :open="finalizeDrawerOpen"
    title="Add completion date"
    :dirty="finalizeFormDirty"
    :saving="finalizeSaving"
    @close="finalizeDrawerOpen = false"
    @save="finalizePendingCompletion"
  >
    <div v-if="selected" class="pending-finalize-summary">
      <strong>{{ selected.employee?.displayName }}</strong>
      <span>{{ selectedRecordRequirement?.name }}</span>
      <p v-if="selected.comment">{{ selected.comment }}</p>
    </div>
    <label class="field">
      <span>Completed on</span>
      <input v-model="finalizeForm.completedOn" type="date" required />
      <small v-if="finalizeFieldErrors.completedOn" class="field-error">
        {{ finalizeFieldErrors.completedOn[0] }}
      </small>
    </label>
    <div class="calculation-preview">
      <strong v-if="finalizedExpiry">Expires {{ formatDate(finalizedExpiry) }}</strong>
      <span>
        Calendar-month calculation using the saved {{ selected?.validityMonthsSnapshot }}-month validity.
      </span>
    </div>
  </FormDrawer>

  <FormDrawer
    :open="correctionDrawerOpen"
    :title="`Edit ${singular} completion dates`"
    :dirty="correctionFormDirty"
    :saving="correctionSaving"
    @close="correctionDrawerOpen = false"
    @save="correctCompletionDates"
  >
    <div class="calculation-preview" role="note">
      <strong>Creates an audited replacement</strong>
      <span>
        Saving voids the original record and keeps it in completion history. The corrected dates are saved as a new immutable completion.
      </span>
    </div>
    <label class="field">
      <span>Completed on</span>
      <input v-model="correctionForm.completedOn" type="date" required />
      <small v-if="correctionFieldErrors.completedOn" class="field-error">
        {{ correctionFieldErrors.completedOn[0] }}
      </small>
    </label>
    <label class="field">
      <span>Expires on</span>
      <input v-model="correctionForm.expiresOn" type="date" required />
      <small class="field-help">Change the completion date, expiration date, or both.</small>
      <small v-if="correctionFieldErrors.expiresOn" class="field-error">
        {{ correctionFieldErrors.expiresOn[0] }}
      </small>
    </label>
    <label class="field">
      <span>Correction reason</span>
      <textarea
        v-model="correctionForm.reason"
        required
        minlength="3"
        maxlength="500"
        rows="4"
        placeholder="Why are these dates being corrected?"
      />
      <small v-if="correctionFieldErrors.reason" class="field-error">
        {{ correctionFieldErrors.reason[0] }}
      </small>
    </label>
  </FormDrawer>

  <Teleport to="body">
    <div v-if="voidOpen" class="dialog-layer">
      <form
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-completion-title"
        @submit.prevent="voidCompletion"
      >
        <h2 id="void-completion-title">Void completion?</h2>
        <p>The record remains in history and will no longer count toward readiness.</p>
        <label class="field">
          <span>Reason</span>
          <textarea v-model="voidReason" required minlength="3" maxlength="500" rows="4" />
        </label>
        <div class="dialog-actions">
          <button class="secondary-action" type="button" :disabled="voidBusy" @click="voidOpen = false">
            Cancel
          </button>
          <button class="danger-action" type="submit" :disabled="voidBusy || voidReason.trim().length < 3">
            {{ voidBusy ? 'Voiding...' : 'Void completion' }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="cancelOpen" class="dialog-layer">
      <form
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-pending-title"
        @submit.prevent="cancelPendingCompletion"
      >
        <h2 id="cancel-pending-title">Cancel pending date?</h2>
        <p>The request remains in resolved history and cannot be reopened.</p>
        <label class="field">
          <span>Reason</span>
          <textarea v-model="cancelReason" required minlength="3" maxlength="500" rows="4" />
        </label>
        <div class="dialog-actions">
          <button class="secondary-action" type="button" :disabled="cancelBusy" @click="cancelOpen = false">
            Keep pending
          </button>
          <button class="danger-action" type="submit" :disabled="cancelBusy || cancelReason.trim().length < 3">
            {{ cancelBusy ? 'Cancelling...' : 'Cancel pending date' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
