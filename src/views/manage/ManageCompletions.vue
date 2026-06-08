<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DetailPanel from '@/components/manage/DetailPanel.vue';
import FormDrawer from '@/components/manage/FormDrawer.vue';
import PaginationControls from '@/components/manage/PaginationControls.vue';
import ResourceTable from '@/components/manage/ResourceTable.vue';
import { addToast } from '@/composables/useToasts';
import { formatDate } from '@/data/trainingDemoData';
import { adminRepository } from '@/services/adminRepository';
import { addCalendarMonths, todayDate } from '@/utils/dates';

const route = useRoute();
const router = useRouter();
const items = ref([]);
const employees = ref([]);
const courses = ref([]);
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const pageSize = 25;
const search = ref(route.query.search || '');
const includeVoided = ref(route.query.voided === 'true');
const selected = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const drawerOpen = ref(false);
const saving = ref(false);
const fieldErrors = ref({});
const voidOpen = ref(false);
const voidBusy = ref(false);
const voidReason = ref('');
const form = reactive({
  employeeId: '',
  courseId: '',
  completedOn: todayDate(),
  expirySource: 'CALCULATED',
  expiresOn: '',
});
const initialForm = ref('');

const selectedCourse = computed(() =>
  courses.value.find((course) => course.id === form.courseId),
);
const calculatedExpiry = computed(() =>
  form.expirySource === 'CALCULATED'
    ? addCalendarMonths(form.completedOn, selectedCourse.value?.defaultValidityMonths)
    : '',
);
const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);

function syncQuery() {
  router.replace({
    query: {
      ...(search.value ? { search: search.value } : {}),
      ...(includeVoided.value ? { voided: 'true' } : {}),
      ...(page.value > 1 ? { page: page.value } : {}),
      ...(selected.value?.id ? { id: selected.value.id } : {}),
    },
  });
}

async function loadOptions() {
  try {
    const [employeeResult, courseResult] = await Promise.all([
      adminRepository.listEmployees({ page: 1, pageSize: 100 }),
      adminRepository.listCourses({ page: 1, pageSize: 100 }),
    ]);
    employees.value = employeeResult.items;
    courses.value = courseResult.items;
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function loadList() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await adminRepository.listCompletions({
      page: page.value,
      pageSize,
      search: search.value,
      filters: { includeVoided: includeVoided.value ? 'true' : 'false' },
    });
    items.value = result.items;
    total.value = result.total;
    const requestedId = route.query.id;
    if (requestedId) selected.value = items.value.find((item) => item.id === requestedId) || null;
    else if (selected.value) {
      selected.value = items.value.find((item) => item.id === selected.value.id) || null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function selectCompletion(completion) {
  selected.value = completion;
  syncQuery();
}

function resetForm(values = {}) {
  Object.assign(form, {
    employeeId: values.employeeId || route.query.employeeId || '',
    courseId: values.courseId || '',
    completedOn: values.completedOn || todayDate(),
    expirySource: values.expirySource || 'CALCULATED',
    expiresOn: values.expiresOn || '',
  });
  if (
    form.expirySource === 'CALCULATED' &&
    form.courseId &&
    !courses.value.find((course) => course.id === form.courseId)?.defaultValidityMonths
  ) {
    form.expirySource = 'MANUAL';
  }
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
}

function openCreate() {
  resetForm();
  drawerOpen.value = true;
}

function openRenewal(completion) {
  const course = courses.value.find((item) => item.id === completion.courseId);
  resetForm({
    employeeId: completion.employeeId,
    courseId: completion.courseId,
    completedOn: todayDate(),
    expirySource: course?.defaultValidityMonths ? 'CALCULATED' : 'MANUAL',
  });
  drawerOpen.value = true;
}

async function saveCompletion() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    const payload = {
      employeeId: form.employeeId,
      courseId: form.courseId,
      completedOn: form.completedOn,
      expirySource: form.expirySource,
      ...(form.expirySource === 'MANUAL' ? { expiresOn: form.expiresOn } : {}),
    };
    const saved = await adminRepository.createCompletion(payload);
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
    await adminRepository.voidCompletion(selected.value.id, voidReason.value);
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
  syncQuery();
  loadList();
}

function changePage(nextPage) {
  page.value = nextPage;
  syncQuery();
  loadList();
}

onMounted(async () => {
  await loadOptions();
  await loadList();
  if (route.query.action === 'create') openCreate();
});

watch(includeVoided, applySearch);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>Completions</h2>
        <p>Record training, renew expiring records, and void incorrect entries without rewriting history.</p>
      </div>
      <button class="primary-action" type="button" @click="openCreate">Record completion</button>
    </div>

    <form class="search-toolbar" @submit.prevent="applySearch">
      <label class="field search-field">
        <span>Search</span>
        <input v-model="search" type="search" placeholder="Search employee, course, or code" />
      </label>
      <label class="checkbox-field">
        <input v-model="includeVoided" type="checkbox" />
        Show voided
      </label>
      <button class="secondary-action" type="submit">Apply</button>
    </form>

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading completions...</div>
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
                <th>Course</th>
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
              >
                <td>
                  <strong>{{ completion.employee.displayName }}</strong>
                  <span>{{ completion.employee.jobTitle }}</span>
                </td>
                <td>
                  <strong>{{ completion.course.code }}</strong>
                  <span>{{ completion.course.name }}</span>
                </td>
                <td>{{ formatDate(completion.completedOn) }}</td>
                <td>{{ formatDate(completion.expiresOn) }}</td>
                <td>
                  <span
                    class="archive-badge"
                    :class="{ 'archive-badge--archived': completion.voidedAt }"
                  >
                    {{ completion.voidedAt ? 'Voided' : 'Current' }}
                  </span>
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
        :title="selected?.employee?.displayName || 'Completion detail'"
        :subtitle="
          selected?.course
            ? `${selected.course.code} · ${selected.course.name}`
            : 'Select a completion to inspect its immutable record.'
        "
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
          <dl class="detail-list">
            <div>
              <dt>Expiry source</dt>
              <dd>
                {{ selected.expirySource === 'CALCULATED' ? 'Calculated' : 'Manual' }}
                <span v-if="selected.validityMonthsApplied">
                  using {{ selected.validityMonthsApplied }} months
                </span>
              </dd>
            </div>
            <div>
              <dt>Recorded by</dt>
              <dd>{{ selected.recordedBySubject }}</dd>
            </div>
            <div v-if="selected.voidedAt">
              <dt>Void reason</dt>
              <dd>{{ selected.voidReason }}</dd>
            </div>
          </dl>
        </div>
      </DetailPanel>
    </div>
  </section>

  <FormDrawer
    :open="drawerOpen"
    title="Record completion"
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
          {{ employee.displayName }} · {{ employee.jobTitle }}
        </option>
      </select>
      <small v-if="fieldErrors.employeeId" class="field-error">{{ fieldErrors.employeeId[0] }}</small>
    </label>
    <label class="field">
      <span>Course</span>
      <select v-model="form.courseId" required>
        <option value="" disabled>Select a course</option>
        <option v-for="course in courses" :key="course.id" :value="course.id">
          {{ course.code }} · {{ course.name }}
        </option>
      </select>
      <small v-if="fieldErrors.courseId" class="field-error">{{ fieldErrors.courseId[0] }}</small>
    </label>
    <label class="field">
      <span>Completed on</span>
      <input v-model="form.completedOn" type="date" required />
    </label>
    <fieldset class="choice-group">
      <legend>Expiry source</legend>
      <label>
        <input v-model="form.expirySource" type="radio" value="CALCULATED" />
        Calculate from course validity
      </label>
      <label>
        <input v-model="form.expirySource" type="radio" value="MANUAL" />
        Enter certificate expiry
      </label>
    </fieldset>
    <div v-if="form.expirySource === 'CALCULATED'" class="calculation-preview">
      <strong v-if="calculatedExpiry">Expires {{ formatDate(calculatedExpiry) }}</strong>
      <span v-if="selectedCourse?.defaultValidityMonths">
        Calendar-month calculation using {{ selectedCourse.defaultValidityMonths }} months.
      </span>
      <span v-else>Select a course with a default validity period, or choose manual expiry.</span>
      <small v-if="fieldErrors.expirySource" class="field-error">
        {{ fieldErrors.expirySource[0] }}
      </small>
    </div>
    <label v-else class="field">
      <span>Expires on</span>
      <input v-model="form.expiresOn" type="date" :min="form.completedOn" required />
      <small v-if="fieldErrors.expiresOn" class="field-error">{{ fieldErrors.expiresOn[0] }}</small>
    </label>
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
          <button class="secondary-action" type="button" :disabled="voidBusy" @click="voidOpen = false">
            Cancel
          </button>
          <button class="danger-action" type="submit" :disabled="voidBusy || voidReason.trim().length < 3">
            {{ voidBusy ? 'Voiding...' : 'Void completion' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
