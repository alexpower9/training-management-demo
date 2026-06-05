<script setup>
import { auth } from '@/auth/auth';
</script>

<template>
  <section class="page-stack">
    <div class="page-header">
      <div>
        <p class="eyebrow">Administrator workspace</p>
        <h1>Manage training data</h1>
        <p class="page-intro">
          This restricted area will manage employees, customer sites, site courses, and completion
          history.
        </p>
      </div>
      <span class="access-label">Admin access</span>
    </div>

    <section class="panel manage-placeholder">
      <div>
        <p class="eyebrow">Foundation ready</p>
        <h2>Management tools are being prepared</h2>
        <p>
          The route and authorization boundary are in place. Editing controls will be connected to
          the audited training API in the next implementation pass.
        </p>
      </div>

      <dl class="manage-scope">
        <div>
          <dt>Employees</dt>
          <dd>Create, update, and archive staff records.</dd>
        </div>
        <div>
          <dt>Customers and sites</dt>
          <dd>Maintain customer locations and their required courses.</dd>
        </div>
        <div>
          <dt>Completions</dt>
          <dd>Record renewals and preserve the full history.</dd>
        </div>
      </dl>

      <p class="signed-in-note">
        Signed in as <strong>{{ auth.state.userName }}</strong>.
      </p>
    </section>
  </section>
</template>
