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
import { addToast } from '@/composables/useToasts';
import { formatDate } from '@/data/trainingDemoData';
import { adminRepository } from '@/services/adminRepository';

const props = defineProps({
  resource: {
    type: String,
    default: 'course',
    validator: (value) => ['course', 'medical'].includes(value),
  },
});

const route = useRoute();
const router = useRouter();
const items = ref([]);
const siteOptions = ref([]);
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
  name: '',
  validityMonths: '',
  siteIds: [],
  noSiteRequirement: false,
});
const initialForm = ref('');

const isMedical = computed(() => props.resource === 'medical');
const singular = computed(() => (isMedical.value ? 'medical' : 'course'));
const plural = computed(() => (isMedical.value ? 'medicals' : 'courses'));
const titleLabel = computed(() => (isMedical.value ? 'Medical' : 'Course'));

const activeSites = computed(() =>
  siteOptions.value.filter((site) => !site.archivedAt),
);
const visibleSiteOptions = computed(() =>
  siteOptions.value.filter(
    (site) => !site.archivedAt || form.siteIds.includes(site.id),
  ),
);
const allActiveSitesSelected = computed(
  () =>
    activeSites.value.length > 0 &&
    activeSites.value.every((site) => form.siteIds.includes(site.id)),
);
const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);
const drawerTitle = computed(() =>
  formMode.value === 'create'
    ? `Add ${singular.value}`
    : `Edit ${singular.value}`,
);

function setForm(values = {}) {
  const siteIds =
    values.requirements?.map((requirement) => requirement.siteId) ||
    values.siteIds ||
    [];
  Object.assign(form, {
    name: values.name || '',
    validityMonths: values.validityMonths ?? '',
    siteIds,
    noSiteRequirement:
      values.noSiteRequirement ?? (Boolean(values.id) && siteIds.length === 0),
  });
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
}

function toggleNoSiteRequirement(event) {
  form.noSiteRequirement = event.target.checked;
  if (form.noSiteRequirement) form.siteIds = [];
}

function toggleAllSites() {
  form.noSiteRequirement = false;
  const activeSiteIds = activeSites.value.map((site) => site.id);
  if (allActiveSitesSelected.value) {
    form.siteIds = form.siteIds.filter((siteId) => !activeSiteIds.includes(siteId));
    return;
  }
  form.siteIds = [...new Set([...form.siteIds, ...activeSiteIds])];
}

function onSiteSelectionChange() {
  if (form.siteIds.length) form.noSiteRequirement = false;
}

function hasNoSiteRequirement(course) {
  return !course.requirements?.length;
}

function assignedSiteNames(course) {
  if (hasNoSiteRequirement(course)) return 'No Site Requirement';
  return course.requirements.map((requirement) => requirement.site.name).join(', ');
}

function assignedSiteSummary(course) {
  if (hasNoSiteRequirement(course)) return 'Does not affect readiness';
  return `${course.requirements.length} ${course.requirements.length === 1 ? 'site' : 'sites'}`;
}

function courseDetailSubtitle(course) {
  if (!course) return `Select a ${singular.value} to inspect its usage.`;
  if (hasNoSiteRequirement(course)) return 'No site requirement';
  return `${course.requirements.length} assigned site(s)`;
}

function syncQuery() {
  router.replace({
    query: {
      ...(search.value ? { search: search.value } : {}),
      ...(includeArchived.value ? { archived: 'true' } : {}),
      ...(page.value > 1 ? { page: page.value } : {}),
      ...(selected.value?.id ? { id: selected.value.id } : {}),
    },
  });
}

async function loadSiteOptions() {
  try {
    siteOptions.value = await adminRepository.listSiteOptions();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function loadList() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const list = isMedical.value
      ? adminRepository.listMedicals
      : adminRepository.listCourses;
    const result = await list({
      page: page.value,
      pageSize,
      search: search.value,
      includeArchived: includeArchived.value,
    });
    items.value = result.items;
    total.value = result.total;
    if (route.query.id) await selectCourse(route.query.id, false);
    else if (selected.value && !items.value.some((course) => course.id === selected.value.id)) {
      selected.value = null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function selectCourse(id, updateRoute = true) {
  detailLoading.value = true;
  try {
    selected.value = isMedical.value
      ? await adminRepository.getMedical(id)
      : await adminRepository.getCourse(id);
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

async function saveCourse() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    const payload = {
      name: form.name,
      validityMonths: Number(form.validityMonths),
      siteIds: form.noSiteRequirement ? [] : form.siteIds,
    };
    const saved = formMode.value === 'create'
      ? await (isMedical.value
          ? adminRepository.createMedical(payload)
          : adminRepository.createCourse(payload))
      : await (isMedical.value
          ? adminRepository.updateMedical(selected.value.id, payload)
          : adminRepository.updateCourse(selected.value.id, payload));
    drawerOpen.value = false;
    addToast(
      formMode.value === 'create'
        ? `${titleLabel.value} added.`
        : `${titleLabel.value} updated.`,
    );
    await loadList();
    await selectCourse(saved.id);
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(fieldErrors.value).length) addToast(error.message, 'danger');
  } finally {
    saving.value = false;
  }
}

async function toggleArchive() {
  if (!selected.value) return;
  confirmBusy.value = true;
  const archived = !selected.value.archivedAt;
  try {
    const updated = isMedical.value
      ? await adminRepository.setMedicalArchived(selected.value.id, archived)
      : await adminRepository.setCourseArchived(selected.value.id, archived);
    confirmOpen.value = false;
    addToast(
      archived
        ? `${titleLabel.value} archived.`
        : `${titleLabel.value} restored.`,
    );
    await loadList();
    await selectCourse(updated.id);
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

onMounted(async () => {
  await Promise.all([loadSiteOptions(), loadList()]);
  if (route.query.action === 'create') openCreate();
});

watch(includeArchived, applySearch);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>{{ titleLabel }} catalogue</h2>
        <p>Create {{ plural }}, choose their required sites, and set automatic expiry.</p>
      </div>
      <button class="primary-action" type="button" @click="openCreate">Add {{ singular }}</button>
    </div>

    <SearchToolbar
      v-model="search"
      v-model:include-archived="includeArchived"
      :placeholder="`Search ${singular} name`"
      @search="applySearch"
    />

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading {{ plural }}...</div>
        <ResourceTable
          v-else
          :has-items="Boolean(items.length)"
          :empty-title="`No ${plural} found`"
          :empty-message="isMedical ? 'Add the first medical to begin tracking medical readiness.' : undefined"
        >
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>{{ titleLabel }}</th>
                <th>Validity</th>
                <th>Assigned sites</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="course in items"
                :key="course.id"
                :class="{ 'is-selected': selected?.id === course.id }"
                tabindex="0"
                @click="selectCourse(course.id)"
                @keydown.enter="selectCourse(course.id)"
                @keydown.space.prevent="selectCourse(course.id)"
              >
                <td><strong>{{ course.name }}</strong></td>
                <td>{{ course.validityMonths }} months</td>
                <td>
                  <strong>{{ assignedSiteNames(course) }}</strong>
                  <span>{{ assignedSiteSummary(course) }}</span>
                </td>
                <td><ArchiveBadge :archived="Boolean(course.archivedAt)" /></td>
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
        :title="selected?.name || `${titleLabel} detail`"
        :subtitle="courseDetailSubtitle(selected)"
      >
        <template v-if="selected" #actions>
          <div class="inline-actions">
            <button class="secondary-action" type="button" @click="openEdit">Edit</button>
            <button class="secondary-action" type="button" @click="confirmOpen = true">
              {{ selected.archivedAt ? 'Restore' : 'Archive' }}
            </button>
          </div>
        </template>

        <div v-if="detailLoading" class="loading-state">Loading {{ singular }}...</div>
        <div v-else-if="selected" class="detail-stack">
          <div class="profile-strip">
            <div>
              <strong>{{ selected.validityMonths }} months</strong>
              <span>Automatic expiry</span>
            </div>
            <div>
              <strong>{{ selected.completions.length }}</strong>
              <span>Recent completions</span>
            </div>
          </div>

          <div>
            <h3 class="detail-heading">Required sites</h3>
            <div v-if="selected.requirements.length" class="stack-list">
              <article
                v-for="requirement in selected.requirements"
                :key="`${requirement.siteId}:${requirement.courseId || requirement.medicalId}`"
                class="requirement-row"
              >
                <div>
                  <strong>{{ requirement.site.name }}</strong>
                  <span>{{ requirement.site.archivedAt ? 'Archived site' : 'Active site' }}</span>
                </div>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>No site requirement</strong>
              <p>This {{ singular }} can be recorded as a completion, but it does not count toward site readiness.</p>
            </div>
          </div>

          <div>
            <h3 class="detail-heading">Recent completion history</h3>
            <div v-if="selected.completions.length" class="stack-list">
              <article
                v-for="completion in selected.completions.slice(0, 10)"
                :key="completion.id"
                class="requirement-row"
              >
                <div>
                  <strong>{{ completion.employee.displayName }}</strong>
                  <span>Completed {{ formatDate(completion.completedOn) }}</span>
                </div>
                <div class="completion-meta-actions">
                  <span>Expires {{ formatDate(completion.expiresOn) }}</span>
                  <CompletionCommentButton
                    :comment="completion.comment"
                    :label="`View completion comment for ${completion.employee.displayName}`"
                  />
                </div>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>No completion history</strong>
              <p>No employee completion has been recorded for this {{ singular }}.</p>
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
    @save="saveCourse"
  >
    <label class="field">
      <span>{{ titleLabel }} name</span>
      <input v-model="form.name" required maxlength="180" />
      <small v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name[0] }}</small>
    </label>
    <fieldset class="choice-group site-choice-group">
      <legend>Required sites</legend>
      <label class="site-select-all no-site-requirement">
        <input
          type="checkbox"
          :checked="form.noSiteRequirement"
          @change="toggleNoSiteRequirement"
        />
        No Site Requirement
      </label>
      <label v-if="activeSites.length" class="site-select-all">
        <input
          type="checkbox"
          :checked="allActiveSitesSelected"
          @change="toggleAllSites"
        />
        Select all active sites
      </label>
      <label v-for="site in visibleSiteOptions" :key="site.id">
        <input
          v-model="form.siteIds"
          type="checkbox"
          :value="site.id"
          :disabled="Boolean(site.archivedAt) && !form.siteIds.includes(site.id)"
          @change="onSiteSelectionChange"
        />
        {{ site.name }}{{ site.archivedAt ? ' (archived)' : '' }}
      </label>
      <small v-if="!siteOptions.length" class="field-help">
        Add a site before creating a {{ singular }}.
      </small>
      <small v-if="fieldErrors.siteIds" class="field-error">
        {{ fieldErrors.siteIds[0] }}
      </small>
    </fieldset>
    <label class="field">
      <span>Validity in months</span>
      <input v-model="form.validityMonths" type="number" min="1" max="120" required />
      <small class="field-help">
        Completion expiry is calculated automatically from this value.
      </small>
      <small v-if="fieldErrors.validityMonths" class="field-error">
        {{ fieldErrors.validityMonths[0] }}
      </small>
    </label>
  </FormDrawer>

  <ConfirmDialog
    :open="confirmOpen"
    :title="selected?.archivedAt ? `Restore ${singular}?` : `Archive ${singular}?`"
    :message="
      selected?.archivedAt
        ? `The ${singular} and its saved site assignments will return to readiness and completion entry.`
        : `The ${singular} will stop affecting readiness and new completions. Its site assignments and history are preserved.`
    "
    :confirm-label="selected?.archivedAt ? 'Restore' : 'Archive'"
    :danger="!selected?.archivedAt"
    :busy="confirmBusy"
    @cancel="confirmOpen = false"
    @confirm="toggleArchive"
  />
</template>
