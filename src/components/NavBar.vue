<script setup>
import logoUrl from '@/assets/ledcor-logo.jpg';
</script>

<template>
  <header class="app-header">
    <RouterLink to="/training" class="brand-link" aria-label="Ledcor Group compliance">
      <span class="brand-logo-frame">
        <img :src="logoUrl" alt="Ledcor Group" class="brand-logo" />
      </span>
    </RouterLink>

    <div class="header-actions">
      <nav class="app-nav" aria-label="Primary navigation">
        <RouterLink to="/training" class="nav-link" active-class="is-active">
          Training
        </RouterLink>
        <RouterLink to="/medical" class="nav-link" active-class="is-active">
          Medical
        </RouterLink>
        <RouterLink
          to="/manage"
          class="nav-link"
          active-class="is-active"
        >
          Manage
        </RouterLink>
      </nav>
    </div>
  </header>
</template>
