<script setup>
import logoUrl from '@/assets/nme-logo.png';
import { auth, signOut } from '@/auth/auth';
</script>

<template>
  <header class="app-header">
    <RouterLink to="/training" class="brand-link" aria-label="Northern Mining Equipment compliance">
      <img :src="logoUrl" alt="Northern Mining Equipment" class="brand-logo" />
      <span class="brand-text">
        <span class="brand-name">Northern Mining Equipment</span>
      </span>
    </RouterLink>

    <div v-if="auth.state.isAuthenticated" class="header-actions">
      <nav class="app-nav" aria-label="Primary navigation">
        <RouterLink to="/training" class="nav-link" active-class="is-active">
          Training
        </RouterLink>
        <RouterLink to="/medical" class="nav-link" active-class="is-active">
          Medical
        </RouterLink>
        <RouterLink
          v-if="auth.canManage.value"
          to="/manage"
          class="nav-link"
          active-class="is-active"
        >
          Manage
        </RouterLink>
      </nav>

      <button
        v-if="!auth.isDevelopmentAuth"
        type="button"
        class="sign-out-button"
        @click="signOut"
      >
        Sign out
      </button>
    </div>
  </header>
</template>
