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
const items = ref([]);
const employees = ref([]);
const courses = ref([]);
const siteOptions = ref([]);
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
  comment: '',
});
const initialForm = ref('');

const selectedCourse = computed(() =>
  courses.value.find((course) => course.id === form.courseId),
);
const activeSites = computed(() =>
  siteOptions.value.filter((site) => !site.archivedAt),
);
const activeSiteIds = computed(
  () => new Set(activeSites.value.map((site) => site.id)),
);
function assignedActiveSiteIds(course) {
  return new Set(
    course.requirements
      ?.map((requirement) => requirement.siteId)
      .filter((siteId) => activeSiteIds.value.has(siteId)) || [],
  );
}
const generalCourses = computed(() => {
  return courses.value.filter(
    (course) => assignedActiveSiteIds(course).size > 1,
  );
});
const siteCourseGroups = computed(() => {
  const generalCourseIds = new Set(generalCourses.value.map((course) => course.id));

  return activeSites.value
    .map((site) => ({
      site,
      courses: courses.value.filter(
        (course) =>
          !generalCourseIds.has(course.id) &&
          course.requirements?.some((requirement) => requirement.siteId === site.id),
      ),
    }))
    .filter((group) => group.courses.length);
});
const otherCourses = computed(() => {
  const groupedCourseIds = new Set([
    ...generalCourses.value.map((course) => course.id),
    ...siteCourseGroups.value.flatMap((group) =>
      group.courses.map((course) => course.id),
    ),
  ]);
  return courses.value.filter((course) => !groupedCourseIds.has(course.id));
});
const calculatedExpiry = computed(() =>
  addCalendarMonths(form.completedOn, selectedCourse.value?.validityMonths),
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
    const [employeeResult, courseResult, sites] = await Promise.all([
      adminRepository.listEmployees({ page: 1, pageSize: 100 }),
      adminRepository.listCourses({ page: 1, pageSize: 100 }),
      adminRepository.listSiteOptions(),
    ]);
    employees.value = employeeResult.items;
    courses.value = courseResult.items;
    siteOptions.value = sites;
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
    courseId: completion.courseId,
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
      courseId: form.courseId,
      completedOn: form.completedOn,
      comment: form.comment.trim() || null,
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
        <input v-model="search" type="search" placeholder="Search employee or course" />
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
                </td>
                <td>
                  <strong>{{ completion.course.name }}</strong>
                </td>
                <td>{{ formatDate(completion.completedOn) }}</td>
                <td>{{ formatDate(completion.expiresOn) }}</td>
                <td>
                  <span
                    v-if="completion.voidedAt"
                    class="archive-badge archive-badge--archived"
                  >
                    Voided
                  </span>
                  <StatusBadge v-else :status="completionStatus(completion)" />
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
            ? selected.course.name
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
          {{ employee.displayName }}
        </option>
      </select>
      <small v-if="fieldErrors.employeeId" class="field-error">{{ fieldErrors.employeeId[0] }}</small>
    </label>
    <label class="field">
      <span>Course</span>
      <select v-model="form.courseId" required>
        <option value="" disabled>Select a course</option>
        <optgroup v-if="generalCourses.length" label="General courses">
          <option v-for="course in generalCourses" :key="course.id" :value="course.id">
            {{ course.name }}
          </option>
        </optgroup>
        <optgroup
          v-for="group in siteCourseGroups"
          :key="group.site.id"
          :label="group.site.name"
        >
          <option
            v-for="course in group.courses"
            :key="`${group.site.id}:${course.id}`"
            :value="course.id"
          >
            {{ course.name }}
          </option>
        </optgroup>
        <optgroup v-if="otherCourses.length" label="Other courses">
          <option v-for="course in otherCourses" :key="course.id" :value="course.id">
            {{ course.name }}
          </option>
        </optgroup>
      </select>
      <small v-if="fieldErrors.courseId" class="field-error">{{ fieldErrors.courseId[0] }}</small>
    </label>
    <label class="field">
      <span>Completed on</span>
      <input v-model="form.completedOn" type="date" required />
    </label>
    <label class="field">
      <span>Comment</span>
      <textarea
        v-model="form.comment"
        maxlength="500"
        rows="4"
        placeholder="Optional"
      />
      <small v-if="fieldErrors.comment" class="field-error">{{ fieldErrors.comment[0] }}</small>
    </label>
    <div class="calculation-preview">
      <strong v-if="calculatedExpiry">Expires {{ formatDate(calculatedExpiry) }}</strong>
      <span v-if="selectedCourse?.validityMonths">
        Calendar-month calculation using {{ selectedCourse.validityMonths }} months.
      </span>
      <span v-else>Select a course to preview its expiry.</span>
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
