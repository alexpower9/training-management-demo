<script setup>
import { auth } from '@/auth/auth';
</script>

<template>
  <section class="auth-state">
    <div class="panel auth-state__panel">
      <p class="eyebrow">Configuration required</p>
      <h1>Authentication is not configured</h1>
      <p>
        This production build requires Amazon Cognito before compliance data can be displayed.
      </p>
      <code>{{ auth.state.configurationError }}</code>
    </div>
  </section>
</template>
