<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ArchiveBadge from '@/components/manage/ArchiveBadge.vue';
import ConfirmDialog from '@/components/manage/ConfirmDialog.vue';
import DetailPanel from '@/components/manage/DetailPanel.vue';
import FormDrawer from '@/components/manage/FormDrawer.vue';
import PaginationControls from '@/components/manage/PaginationControls.vue';
import ResourceTable from '@/components/manage/ResourceTable.vue';
import SearchToolbar from '@/components/manage/SearchToolbar.vue';
import { addToast } from '@/composables/useToasts';
import { formatDate } from '@/data/trainingDemoData';
import { adminRepository } from '@/services/adminRepository';

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
  code: '',
  name: '',
  category: '',
  defaultValidityMonths: '',
});
const initialForm = ref('');

const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);
const drawerTitle = computed(() =>
  formMode.value === 'create' ? 'Add course' : 'Edit course',
);
const openRequirements = computed(
  () => selected.value?.requirements.filter((requirement) => !requirement.effectiveTo) || [],
);

function setForm(values = {}) {
  Object.assign(form, {
    code: values.code || '',
    name: values.name || '',
    category: values.category || '',
    defaultValidityMonths: values.defaultValidityMonths ?? '',
  });
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
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

async function loadList() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await adminRepository.listCourses({
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
    selected.value = await adminRepository.getCourse(id);
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
      code: form.code,
      name: form.name,
      category: form.category || null,
      defaultValidityMonths:
        form.defaultValidityMonths === '' ? null : Number(form.defaultValidityMonths),
    };
    const saved =
      formMode.value === 'create'
        ? await adminRepository.createCourse(payload)
        : await adminRepository.updateCourse(selected.value.id, {
            ...payload,
            expectedVersion: selected.value.version,
          });
    drawerOpen.value = false;
    addToast(formMode.value === 'create' ? 'Course added.' : 'Course updated.');
    await loadList();
    await selectCourse(saved.id);
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (error.code === 'EDIT_CONFLICT') errorMessage.value = error.message;
    else if (!Object.keys(fieldErrors.value).length) addToast(error.message, 'danger');
  } finally {
    saving.value = false;
  }
}

async function toggleArchive() {
  if (!selected.value) return;
  confirmBusy.value = true;
  const archived = !selected.value.archivedAt;
  try {
    const updated = await adminRepository.setCourseArchived(
      selected.value.id,
      archived,
      selected.value.version,
    );
    confirmOpen.value = false;
    addToast(archived ? 'Course archived.' : 'Course restored.');
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
  await loadList();
  if (route.query.action === 'create') openCreate();
});

watch(includeArchived, applySearch);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>Course catalogue</h2>
        <p>Maintain reusable training definitions and their default validity periods.</p>
      </div>
      <button class="primary-action" type="button" @click="openCreate">Add course</button>
    </div>

    <SearchToolbar
      v-model="search"
      v-model:include-archived="includeArchived"
      placeholder="Search code, course name, or category"
      @search="applySearch"
    />

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading courses...</div>
        <ResourceTable v-else :has-items="Boolean(items.length)" empty-title="No courses found">
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Course</th>
                <th>Validity</th>
                <th>Open site requirements</th>
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
              >
                <td>
                  <strong>{{ course.code }} · {{ course.name }}</strong>
                  <span>{{ course.category || 'Uncategorized' }}</span>
                </td>
                <td>
                  {{ course.defaultValidityMonths ? `${course.defaultValidityMonths} months` : 'Manual only' }}
                </td>
                <td>{{ course.requirements.length }}</td>
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
        :title="selected ? `${selected.code} · ${selected.name}` : 'Course detail'"
        :subtitle="selected ? selected.category || 'Uncategorized' : 'Select a course to inspect its usage.'"
      >
        <template v-if="selected" #actions>
          <div class="inline-actions">
            <button class="secondary-action" type="button" @click="openEdit">Edit</button>
            <button class="secondary-action" type="button" @click="confirmOpen = true">
              {{ selected.archivedAt ? 'Restore' : 'Archive' }}
            </button>
          </div>
        </template>

        <div v-if="detailLoading" class="loading-state">Loading course...</div>
        <div v-else-if="selected" class="detail-stack">
          <div class="profile-strip">
            <div>
              <strong>
                {{ selected.defaultValidityMonths ? `${selected.defaultValidityMonths} months` : 'Manual' }}
              </strong>
              <span>Default expiry</span>
            </div>
            <div>
              <strong>{{ selected.completions.length }}</strong>
              <span>Recent completions</span>
            </div>
          </div>

          <div>
            <h3 class="detail-heading">Site requirements</h3>
            <div v-if="selected.requirements.length" class="stack-list">
              <article
                v-for="requirement in selected.requirements"
                :key="requirement.id"
                class="requirement-row"
              >
                <div>
                  <strong>{{ requirement.site.customer.name }} · {{ requirement.site.name }}</strong>
                  <span>
                    From {{ formatDate(requirement.effectiveFrom) }}
                    {{ requirement.effectiveTo ? `to ${formatDate(requirement.effectiveTo)}` : '· Open' }}
                  </span>
                </div>
                <span>{{ requirement.warningDays }} day warning</span>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>Not required by a site</strong>
              <p>Add this course from a site's requirement workspace.</p>
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
                <span>Expires {{ formatDate(completion.expiresOn) }}</span>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>No completion history</strong>
              <p>No employee completion has been recorded for this course.</p>
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
      <span>Course code</span>
      <input v-model="form.code" required maxlength="50" />
      <small class="field-help">Codes are permanent identifiers and cannot be reused after archiving.</small>
      <small v-if="fieldErrors.code" class="field-error">{{ fieldErrors.code[0] }}</small>
    </label>
    <label class="field">
      <span>Course name</span>
      <input v-model="form.name" required maxlength="180" />
      <small v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name[0] }}</small>
    </label>
    <label class="field">
      <span>Category</span>
      <input v-model="form.category" maxlength="100" />
    </label>
    <label class="field">
      <span>Default validity in months</span>
      <input v-model="form.defaultValidityMonths" type="number" min="1" max="120" />
      <small class="field-help">Leave blank when expiry must always be entered from the certificate.</small>
      <small v-if="fieldErrors.defaultValidityMonths" class="field-error">
        {{ fieldErrors.defaultValidityMonths[0] }}
      </small>
    </label>
  </FormDrawer>

  <ConfirmDialog
    :open="confirmOpen"
    :title="selected?.archivedAt ? 'Restore course?' : 'Archive course?'"
    :message="
      selected?.archivedAt
        ? 'The course will be available for new requirements and completions.'
        : openRequirements.length
          ? `This course has ${openRequirements.length} open site requirement(s). End them before archiving.`
          : 'The course will no longer be available for new requirements or completions. History is preserved.'
    "
    :confirm-label="selected?.archivedAt ? 'Restore' : 'Archive'"
    :danger="!selected?.archivedAt"
    :busy="confirmBusy"
    @cancel="confirmOpen = false"
    @confirm="toggleArchive"
  />
</template>
