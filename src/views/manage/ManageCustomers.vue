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
const customers = ref([]);
const courses = ref([]);
const total = ref(0);
const page = ref(Number(route.query.page) || 1);
const pageSize = 25;
const search = ref(route.query.search || '');
const includeArchived = ref(route.query.archived === 'true');
const selectedCustomer = ref(null);
const selectedSite = ref(null);
const loading = ref(false);
const detailLoading = ref(false);
const errorMessage = ref('');
const drawerOpen = ref(false);
const drawerType = ref('customer');
const formMode = ref('create');
const saving = ref(false);
const fieldErrors = ref({});
const initialForm = ref('');
const confirmOpen = ref(false);
const confirmBusy = ref(false);
const archiveTarget = ref(null);
const archiveType = ref('');
const endOpen = ref(false);
const endBusy = ref(false);
const endingRequirement = ref(null);
const endDate = ref(today());

const customerForm = reactive({ name: '', contact: '' });
const siteForm = reactive({
  customerId: '',
  name: '',
  region: '',
  timeZone: 'America/St_Johns',
});
const requirementForm = reactive({
  courseId: '',
  effectiveFrom: today(),
  effectiveTo: '',
  warningDays: 45,
});

const currentForm = computed(() => {
  if (drawerType.value === 'site') return siteForm;
  if (drawerType.value === 'requirement') return requirementForm;
  return customerForm;
});
const formDirty = computed(
  () => JSON.stringify(currentForm.value) !== initialForm.value,
);
const drawerTitle = computed(() => {
  const verb = formMode.value === 'create' ? 'Add' : 'Edit';
  if (drawerType.value === 'site') return `${verb} site`;
  if (drawerType.value === 'requirement') return `${verb} site requirement`;
  return `${verb} customer`;
});
const showingSite = computed(() => Boolean(selectedSite.value));
const activeSiteCount = computed(
  () => selectedCustomer.value?.sites.filter((site) => !site.archivedAt).length || 0,
);
const archiveIsRestore = computed(() => Boolean(archiveTarget.value?.archivedAt));

function today() {
  return new Date().toISOString().slice(0, 10);
}

function setInitial(form) {
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
}

function listQuery() {
  return {
    ...(search.value ? { search: search.value } : {}),
    ...(includeArchived.value ? { archived: 'true' } : {}),
    ...(page.value > 1 ? { page: page.value } : {}),
    ...(selectedCustomer.value?.id && !showingSite.value
      ? { id: selectedCustomer.value.id }
      : {}),
  };
}

async function loadCustomers() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await adminRepository.listCustomers({
      page: page.value,
      pageSize,
      search: search.value,
      includeArchived: includeArchived.value,
    });
    customers.value = result.items;
    total.value = result.total;
    if (route.params.siteId) await loadSite(route.params.siteId);
    else if (route.query.id) await selectCustomer(route.query.id, false);
    else if (
      selectedCustomer.value &&
      !customers.value.some((customer) => customer.id === selectedCustomer.value.id)
    ) {
      selectedCustomer.value = null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadCourseOptions() {
  try {
    const result = await adminRepository.listCourses({
      page: 1,
      pageSize: 100,
      includeArchived: false,
    });
    courses.value = result.items;
  } catch (error) {
    addToast(error.message, 'danger');
  }
}

async function selectCustomer(id, updateRoute = true) {
  detailLoading.value = true;
  try {
    selectedSite.value = null;
    selectedCustomer.value = await adminRepository.getCustomer(id);
    if (updateRoute) {
      await router.push({ name: 'manage-customers', query: { ...listQuery(), id } });
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    detailLoading.value = false;
  }
}

async function loadSite(id) {
  detailLoading.value = true;
  try {
    selectedSite.value = await adminRepository.getSite(id);
    selectedCustomer.value = await adminRepository.getCustomer(selectedSite.value.customerId);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    detailLoading.value = false;
  }
}

async function openSite(site) {
  await router.push({
    name: 'manage-site',
    params: { siteId: site.id },
    query: listQuery(),
  });
  await loadSite(site.id);
}

function openCustomerForm(mode = 'create') {
  drawerType.value = 'customer';
  formMode.value = mode;
  Object.assign(customerForm, {
    name: mode === 'edit' ? selectedCustomer.value.name : '',
    contact: mode === 'edit' ? selectedCustomer.value.contact || '' : '',
  });
  setInitial(customerForm);
  drawerOpen.value = true;
}

function openSiteForm(mode = 'create') {
  drawerType.value = 'site';
  formMode.value = mode;
  Object.assign(siteForm, {
    customerId:
      mode === 'edit' ? selectedSite.value.customerId : selectedCustomer.value?.id || '',
    name: mode === 'edit' ? selectedSite.value.name : '',
    region: mode === 'edit' ? selectedSite.value.region || '' : '',
    timeZone: mode === 'edit' ? selectedSite.value.timeZone : 'America/St_Johns',
  });
  setInitial(siteForm);
  drawerOpen.value = true;
}

function openRequirementForm(requirement = null) {
  drawerType.value = 'requirement';
  formMode.value = requirement ? 'edit' : 'create';
  Object.assign(requirementForm, {
    courseId: requirement?.courseId || '',
    effectiveFrom: requirement?.effectiveFrom || today(),
    effectiveTo: requirement?.effectiveTo || '',
    warningDays: requirement?.warningDays ?? 45,
    id: requirement?.id,
    version: requirement?.version,
  });
  setInitial(requirementForm);
  drawerOpen.value = true;
}

async function saveForm() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    let saved;
    if (drawerType.value === 'customer') {
      const payload = {
        name: customerForm.name,
        contact: customerForm.contact || null,
      };
      saved =
        formMode.value === 'create'
          ? await adminRepository.createCustomer(payload)
          : await adminRepository.updateCustomer(selectedCustomer.value.id, {
              ...payload,
              expectedVersion: selectedCustomer.value.version,
            });
      addToast(formMode.value === 'create' ? 'Customer added.' : 'Customer updated.');
      drawerOpen.value = false;
      await loadCustomers();
      await selectCustomer(saved.id);
    } else if (drawerType.value === 'site') {
      const payload = {
        customerId: siteForm.customerId,
        name: siteForm.name,
        region: siteForm.region || null,
        timeZone: siteForm.timeZone,
      };
      saved =
        formMode.value === 'create'
          ? await adminRepository.createSite(payload)
          : await adminRepository.updateSite(selectedSite.value.id, {
              ...payload,
              expectedVersion: selectedSite.value.version,
            });
      addToast(formMode.value === 'create' ? 'Site added.' : 'Site updated.');
      drawerOpen.value = false;
      await loadCustomers();
      await openSite(saved);
    } else {
      const payload = {
        siteId: selectedSite.value.id,
        courseId: requirementForm.courseId,
        effectiveFrom: requirementForm.effectiveFrom,
        effectiveTo: requirementForm.effectiveTo || null,
        warningDays: Number(requirementForm.warningDays),
      };
      if (formMode.value === 'create') {
        await adminRepository.createRequirement(payload);
        addToast('Site requirement added.');
      } else {
        await adminRepository.updateRequirement(requirementForm.id, {
          ...payload,
          expectedVersion: requirementForm.version,
        });
        addToast('Site requirement updated.');
      }
      drawerOpen.value = false;
      await loadSite(selectedSite.value.id);
    }
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (error.code === 'EDIT_CONFLICT') errorMessage.value = error.message;
    else if (!Object.keys(fieldErrors.value).length) addToast(error.message, 'danger');
  } finally {
    saving.value = false;
  }
}

function askArchive(type, target) {
  archiveType.value = type;
  archiveTarget.value = target;
  confirmOpen.value = true;
}

async function toggleArchive() {
  confirmBusy.value = true;
  const restore = archiveIsRestore.value;
  try {
    if (archiveType.value === 'customer') {
      await adminRepository.setCustomerArchived(
        archiveTarget.value.id,
        !restore,
        archiveTarget.value.version,
      );
      addToast(restore ? 'Customer restored.' : 'Customer archived.');
      confirmOpen.value = false;
      await loadCustomers();
      await selectCustomer(archiveTarget.value.id);
    } else {
      await adminRepository.setSiteArchived(
        archiveTarget.value.id,
        !restore,
        archiveTarget.value.version,
      );
      addToast(restore ? 'Site restored.' : 'Site archived.');
      confirmOpen.value = false;
      await loadCustomers();
      await loadSite(archiveTarget.value.id);
    }
  } catch (error) {
    addToast(error.message, 'danger');
  } finally {
    confirmBusy.value = false;
  }
}

function askEnd(requirement) {
  endingRequirement.value = requirement;
  endDate.value = today();
  endOpen.value = true;
}

async function endRequirement() {
  endBusy.value = true;
  try {
    await adminRepository.endRequirement(endingRequirement.value.id, {
      effectiveTo: endDate.value,
      expectedVersion: endingRequirement.value.version,
    });
    endOpen.value = false;
    addToast('Requirement ended.');
    await loadSite(selectedSite.value.id);
  } catch (error) {
    addToast(error.message, 'danger');
  } finally {
    endBusy.value = false;
  }
}

function applySearch() {
  page.value = 1;
  router.replace({ name: 'manage-customers', query: listQuery() });
  loadCustomers();
}

function changePage(nextPage) {
  page.value = nextPage;
  router.replace({ name: 'manage-customers', query: listQuery() });
  loadCustomers();
}

onMounted(async () => {
  await Promise.all([loadCustomers(), loadCourseOptions()]);
  if (route.query.action === 'create') openCustomerForm();
});

watch(includeArchived, applySearch);
watch(
  () => route.params.siteId,
  (siteId) => {
    if (siteId && siteId !== selectedSite.value?.id) loadSite(siteId);
  },
);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>Customers & sites</h2>
        <p>Maintain customer locations and the courses required at each site.</p>
      </div>
      <button class="primary-action" type="button" @click="openCustomerForm()">Add customer</button>
    </div>

    <SearchToolbar
      v-model="search"
      v-model:include-archived="includeArchived"
      placeholder="Search customer name"
      @search="applySearch"
    />

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <div class="workspace-grid">
      <section class="panel panel--large">
        <div v-if="loading" class="loading-state">Loading customers...</div>
        <ResourceTable v-else :has-items="Boolean(customers.length)" empty-title="No customers found">
          <table class="data-table data-table--interactive">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Sites</th>
                <th>Requirements</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="customer in customers"
                :key="customer.id"
                :class="{ 'is-selected': selectedCustomer?.id === customer.id }"
                tabindex="0"
                @click="selectCustomer(customer.id)"
                @keydown.enter="selectCustomer(customer.id)"
              >
                <td>
                  <strong>{{ customer.name }}</strong>
                  <span>{{ customer.contact || 'No contact recorded' }}</span>
                </td>
                <td>{{ customer.sites.length }}</td>
                <td>
                  {{ customer.sites.reduce((count, site) => count + site._count.requirements, 0) }}
                </td>
                <td><ArchiveBadge :archived="Boolean(customer.archivedAt)" /></td>
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
        :title="showingSite ? selectedSite.name : selectedCustomer?.name || 'Customer detail'"
        :subtitle="
          showingSite
            ? `${selectedSite.customer.name} · ${selectedSite.region || 'No region'}`
            : selectedCustomer
              ? selectedCustomer.contact || 'No contact recorded'
              : 'Select a customer to inspect its sites.'
        "
      >
        <template v-if="selectedCustomer" #actions>
          <div v-if="showingSite" class="inline-actions">
            <button class="secondary-action" type="button" @click="selectCustomer(selectedCustomer.id)">
              Customer
            </button>
            <button class="secondary-action" type="button" @click="openSiteForm('edit')">Edit</button>
            <button class="secondary-action" type="button" @click="askArchive('site', selectedSite)">
              {{ selectedSite.archivedAt ? 'Restore' : 'Archive' }}
            </button>
          </div>
          <div v-else class="inline-actions">
            <button class="secondary-action" type="button" @click="openCustomerForm('edit')">Edit</button>
            <button
              class="secondary-action"
              type="button"
              @click="askArchive('customer', selectedCustomer)"
            >
              {{ selectedCustomer.archivedAt ? 'Restore' : 'Archive' }}
            </button>
          </div>
        </template>

        <div v-if="detailLoading" class="loading-state">Loading details...</div>
        <div v-else-if="selectedCustomer && !showingSite" class="detail-stack">
          <div class="profile-strip">
            <div><strong>{{ selectedCustomer.sites.length }}</strong><span>Total sites</span></div>
            <div><strong>{{ activeSiteCount }}</strong><span>Active sites</span></div>
          </div>
          <button
            class="primary-action"
            type="button"
            :disabled="Boolean(selectedCustomer.archivedAt)"
            @click="openSiteForm()"
          >
            Add site
          </button>
          <div>
            <h3 class="detail-heading">Sites</h3>
            <div v-if="selectedCustomer.sites.length" class="stack-list">
              <button
                v-for="site in selectedCustomer.sites"
                :key="site.id"
                class="requirement-row requirement-row--button"
                type="button"
                @click="openSite(site)"
              >
                <div>
                  <strong>{{ site.name }}</strong>
                  <span>{{ site.region || 'No region' }} · {{ site.timeZone }}</span>
                </div>
                <div class="requirement-status">
                  <ArchiveBadge :archived="Boolean(site.archivedAt)" />
                  <span>{{ site._count.requirements }} requirement records</span>
                </div>
              </button>
            </div>
            <div v-else class="empty-state">
              <strong>No sites yet</strong>
              <p>Add a site before configuring training requirements.</p>
            </div>
          </div>
        </div>

        <div v-else-if="selectedSite" class="detail-stack">
          <div class="profile-strip">
            <div><strong>{{ selectedSite.timeZone }}</strong><span>Time zone</span></div>
            <div><strong>{{ selectedSite.requirements.length }}</strong><span>Requirement records</span></div>
          </div>
          <button
            class="primary-action"
            type="button"
            :disabled="Boolean(selectedSite.archivedAt)"
            @click="openRequirementForm()"
          >
            Add requirement
          </button>
          <div>
            <h3 class="detail-heading">Course requirements</h3>
            <div v-if="selectedSite.requirements.length" class="stack-list">
              <article
                v-for="requirement in selectedSite.requirements"
                :key="requirement.id"
                class="requirement-row"
              >
                <div>
                  <strong>{{ requirement.course.code }} · {{ requirement.course.name }}</strong>
                  <span>
                    {{ formatDate(requirement.effectiveFrom) }}
                    {{ requirement.effectiveTo ? `to ${formatDate(requirement.effectiveTo)}` : 'onward' }}
                    · {{ requirement.warningDays }} day warning
                  </span>
                </div>
                <div class="inline-actions">
                  <button
                    v-if="requirement.effectiveFrom > today()"
                    class="text-action"
                    type="button"
                    @click="openRequirementForm(requirement)"
                  >
                    Edit
                  </button>
                  <button
                    v-if="!requirement.effectiveTo"
                    class="text-action"
                    type="button"
                    @click="askEnd(requirement)"
                  >
                    End
                  </button>
                </div>
              </article>
            </div>
            <div v-else class="empty-state">
              <strong>No course requirements</strong>
              <p>Every employee will be ineligible for this site until requirements are added.</p>
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
    <template v-if="drawerType === 'customer'">
      <label class="field">
        <span>Customer name</span>
        <input v-model="customerForm.name" required maxlength="160" />
        <small v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name[0] }}</small>
      </label>
      <label class="field">
        <span>Contact</span>
        <input v-model="customerForm.contact" maxlength="160" />
      </label>
    </template>

    <template v-else-if="drawerType === 'site'">
      <label class="field">
        <span>Customer</span>
        <select v-model="siteForm.customerId" required>
          <option value="" disabled>Select a customer</option>
          <option
            v-for="customer in customers.filter((item) => !item.archivedAt)"
            :key="customer.id"
            :value="customer.id"
          >
            {{ customer.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Site name</span>
        <input v-model="siteForm.name" required maxlength="160" />
        <small v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name[0] }}</small>
      </label>
      <label class="field">
        <span>Region</span>
        <input v-model="siteForm.region" maxlength="160" />
      </label>
      <label class="field">
        <span>IANA time zone</span>
        <input v-model="siteForm.timeZone" required maxlength="80" />
        <small class="field-help">Example: America/St_Johns or America/Toronto</small>
      </label>
    </template>

    <template v-else>
      <label class="field">
        <span>Course</span>
        <select v-model="requirementForm.courseId" required>
          <option value="" disabled>Select a course</option>
          <option v-for="course in courses" :key="course.id" :value="course.id">
            {{ course.code }} · {{ course.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>Effective from</span>
        <input v-model="requirementForm.effectiveFrom" type="date" required />
      </label>
      <label class="field">
        <span>Effective to</span>
        <input v-model="requirementForm.effectiveTo" type="date" />
        <small class="field-help">Leave blank for an open-ended requirement.</small>
      </label>
      <label class="field">
        <span>Expiry warning days</span>
        <input v-model="requirementForm.warningDays" type="number" min="0" max="365" required />
      </label>
    </template>
  </FormDrawer>

  <ConfirmDialog
    :open="confirmOpen"
    :title="`${archiveIsRestore ? 'Restore' : 'Archive'} ${archiveType}?`"
    :message="
      archiveType === 'customer' && !archiveIsRestore && activeSiteCount
        ? 'All sites must be archived before this customer can be archived.'
        : archiveType === 'site' && !archiveIsRestore
          ? 'The site leaves current readiness views. Requirement history is preserved.'
          : `The ${archiveType} status will be updated.`
    "
    :confirm-label="archiveIsRestore ? 'Restore' : 'Archive'"
    :danger="!archiveIsRestore"
    :busy="confirmBusy"
    @cancel="confirmOpen = false"
    @confirm="toggleArchive"
  />

  <ConfirmDialog
    :open="endOpen"
    title="End site requirement?"
    message="The end date is inclusive. Add a replacement requirement separately when the rule changes."
    confirm-label="End requirement"
    :busy="endBusy"
    @cancel="endOpen = false"
    @confirm="endRequirement"
  >
    <label class="field">
      <span>Effective to</span>
      <input v-model="endDate" type="date" required />
    </label>
  </ConfirmDialog>
</template>
