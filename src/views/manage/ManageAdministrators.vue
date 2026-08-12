<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import FormDrawer from '@/components/manage/FormDrawer.vue';
import ResourceTable from '@/components/manage/ResourceTable.vue';
import { addToast } from '@/composables/useToasts';
import { adminRepository } from '@/services/adminRepository';

const items = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const drawerOpen = ref(false);
const saving = ref(false);
const fieldErrors = ref({});
const form = reactive({
  displayName: '',
  email: '',
});
const initialForm = ref('');
const formDirty = computed(() => JSON.stringify(form) !== initialForm.value);

function resetForm() {
  Object.assign(form, {
    displayName: '',
    email: '',
  });
  initialForm.value = JSON.stringify(form);
  fieldErrors.value = {};
}

function openInvitation() {
  resetForm();
  drawerOpen.value = true;
}

function statusLabel(status) {
  if (status === 'FORCE_CHANGE_PASSWORD') return 'Invitation pending';
  if (status === 'CONFIRMED') return 'Active';
  return status ? status.replaceAll('_', ' ').toLowerCase() : 'Unknown';
}

async function loadAdministrators() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await adminRepository.listAdministrators();
    items.value = result.items;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function inviteAdministrator() {
  saving.value = true;
  fieldErrors.value = {};
  try {
    await adminRepository.inviteAdministrator({
      email: form.email,
      ...(form.displayName ? { displayName: form.displayName } : {}),
    });
    drawerOpen.value = false;
    addToast('Administrator invitation sent.');
    await loadAdministrators();
  } catch (error) {
    fieldErrors.value = error.fieldErrors || {};
    if (!Object.keys(fieldErrors.value).length) {
      addToast(error.message, 'danger');
    }
  } finally {
    saving.value = false;
  }
}

onMounted(loadAdministrators);
</script>

<template>
  <section class="management-section">
    <div class="section-heading">
      <div>
        <h2>Administrators</h2>
        <p>Invite administrators who can maintain compliance records.</p>
      </div>
      <button class="primary-action" type="button" @click="openInvitation">
        Invite administrator
      </button>
    </div>

    <section class="account-panel" aria-label="Owner access notice">
      <div>
        <h3 class="detail-heading">Owner-controlled access</h3>
        <p>
          New users are created in Cognito and added only to the
          <code>admin</code> group. This screen cannot create another owner.
        </p>
      </div>
    </section>

    <div v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</div>

    <section class="panel">
      <div v-if="loading" class="loading-state">Loading administrators...</div>
      <ResourceTable
        v-else
        :has-items="Boolean(items.length)"
        empty-title="No administrators found"
        empty-message="Invite the first administrator when record management access is needed."
      >
        <table class="data-table">
          <thead>
            <tr>
              <th>Administrator</th>
              <th>Email</th>
              <th>Account status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="administrator in items" :key="administrator.username">
              <td>
                <strong>{{ administrator.displayName || administrator.email }}</strong>
              </td>
              <td>{{ administrator.email }}</td>
              <td>{{ statusLabel(administrator.status) }}</td>
            </tr>
          </tbody>
        </table>
      </ResourceTable>
    </section>
  </section>

  <FormDrawer
    :open="drawerOpen"
    title="Invite administrator"
    :dirty="formDirty"
    :saving="saving"
    @close="drawerOpen = false"
    @save="inviteAdministrator"
  >
    <label class="field">
      <span>Name</span>
      <input v-model.trim="form.displayName" maxlength="160" autocomplete="name" />
      <small class="field-help">Optional. This becomes the Cognito name attribute.</small>
      <small v-if="fieldErrors.displayName" class="field-error">
        {{ fieldErrors.displayName[0] }}
      </small>
    </label>

    <label class="field">
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
</template>
