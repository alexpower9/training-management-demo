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
const initialForm = ref('');
const confirmOpen = ref(false);
const confirmBusy = ref(false);

const siteForm = reactive({
  name: '',
  timeZone: 'America/St_Johns',
});

const formDirty = computed(
  () => JSON.stringify(siteForm) !== initialForm.value,
);
const drawerTitle = computed(() =>
  formMode.value === 'create' ? 'Add site' : 'Edit site',
);

function setInitial(form) {
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
}

function syncQuery() {
  router.replace({
    name: 'manage-sites',
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
    const result = await adminRepository.listSites({
      page: page.value,
      pageSize,
      search: search.value,
      includeArchived: includeArchived.value,
    });
    items.value = result.items;
    total.value = result.total;
    const requestedId = route.params.siteId || route.query.id;
    if (requestedId) await selectSite(requestedId, false);
    else if (selected.value && !items.value.some((site) => site.id === selected.value.id)) {
      selected.value = null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function selectSite(id, updateRoute = true) {
  detailLoading.value = true;
  try {
    selected.value = await adminRepository.getSite(id);
    if (updateRoute) syncQuery();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    detailLoading.value = false;
  }
}

function openSiteForm(mode = 'create') {
  formMode.value = mode;
  Object.assign(siteForm, {
    name: mode === 'edit' ? selected.value.name : '',
    timeZone: mode === 'edit' ? selected.value.timeZone : 'America/St_Johns',
  });
  setInitial(siteForm);
  drawerOpen.value = true;
}

async function saveForm() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    const payload = {
      name: siteForm.name,
      timeZone: siteForm.timeZone,
    };
    const saved =
      formMode.value === 'create'
        ? await adminRepository.createSite(payload)
        : await adminRepository.updateSite(selected.value.id, payload);
    drawerOpen.value = false;
    addToast(formMode.value === 'create' ? 'Site added.' : 'Site updated.');
    await loadList();
    await selectSite(saved.id);
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(fieldErrors.value).length) addToast(error.message, 'danger');
  } finally {
    saving.value = false;
  }
}

function askArchive() {
  confirmOpen.value = true;
}

async function confirmAction() {
  confirmBusy.value = true;
  try {
    const archived = !selected.value.archivedAt;
    await adminRepository.setSiteArchived(selected.value.id, archived);
    addToast(archived ? 'Site archived.' : 'Site restored.');
    confirmOpen.value = false;
    await loadList();
    await selectSite(selected.value.id);
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
  if (route.query.action === 'create') openSiteForm();
});

watch(includeArchived, applySearch);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>Sites</h2>
        <p>Maintain sites and review the courses assigned from the course catalogue.</p>
      </div>
      <button class="primary-action" type="button" @click="openSiteForm()">Add site</button>
    </div>

    <SearchToolbar
      v-model="search"
      v-model:include-archived="includeArchived"
      placeholder="Search site name"
      @search="applySearch"
    />

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading sites...</div>
        <ResourceTable v-else :has-items="Boolean(items.length)" empty-title="No sites found">
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Site</th>
                <th>Required courses</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="site in items"
                :key="site.id"
                :class="{ 'is-selected': selected?.id === site.id }"
                tabindex="0"
                @click="selectSite(site.id)"
                @keydown.enter="selectSite(site.id)"
              >
                <td>
                  <strong>{{ site.name }}</strong>
                  <span>{{ site.timeZone }}</span>
                </td>
                <td>{{ site._count.requirements }}</td>
                <td><ArchiveBadge :archived="Boolean(site.archivedAt)" /></td>
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
        :title="selected?.name || 'Site detail'"
        :subtitle="selected ? selected.timeZone : 'Select a site to review its required courses.'"
      >
        <template v-if="selected" #actions>
          <div class="inline-actions">
            <button class="secondary-action" type="button" @click="openSiteForm('edit')">Edit</button>
            <button class="secondary-action" type="button" @click="askArchive">
              {{ selected.archivedAt ? 'Restore' : 'Archive' }}
            </button>
          </div>
        </template>

        <div v-if="detailLoading" class="loading-state">Loading site...</div>
        <div v-else-if="selected" class="detail-stack">
          <div>
            <h3 class="detail-heading">Required courses</h3>
            <div v-if="selected.requirements.length" class="stack-list">
              <article
                v-for="requirement in selected.requirements"
                :key="requirement.courseId"
                class="requirement-row"
              >
                <div>
                  <strong>{{ requirement.course.name }}</strong>
                  <span>
                    {{ requirement.course.validityMonths }} months
                    {{ requirement.course.archivedAt ? ' · Archived course' : '' }}
                  </span>
                </div>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>No required courses</strong>
              <p>Employees are ineligible for this site until courses are assigned.</p>
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
    @save="saveForm"
  >
    <label class="field">
      <span>Site name</span>
      <input v-model="siteForm.name" required maxlength="160" />
      <small v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name[0] }}</small>
    </label>
    <label class="field">
      <span>IANA time zone</span>
      <input v-model="siteForm.timeZone" required maxlength="80" />
      <small class="field-help">Example: America/St_Johns or America/Toronto</small>
    </label>
  </FormDrawer>

  <ConfirmDialog
    :open="confirmOpen"
    :title="selected?.archivedAt ? 'Restore site?' : 'Archive site?'"
    :message="
      selected?.archivedAt
        ? 'The site will return to readiness views with its course assignments preserved.'
        : 'The site will leave readiness views. Its course assignments will be preserved.'
    "
    :confirm-label="selected?.archivedAt ? 'Restore' : 'Archive'"
    :danger="!selected?.archivedAt"
    :busy="confirmBusy"
    @cancel="confirmOpen = false"
    @confirm="confirmAction"
  />
</template>
