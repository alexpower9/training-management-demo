<script setup>
import logoUrl from '@/assets/nme-logo.png';
</script>

<template>
  <header class="app-header">
    <RouterLink to="/" class="brand-link" aria-label="Northern Mining Equipment dashboard">
      <img :src="logoUrl" alt="Northern Mining Equipment" class="brand-logo" />
      <span class="brand-text">
        <span class="brand-name">Northern Mining Equipment</span>
        <span class="brand-product">Training Compliance MVP</span>
      </span>
    </RouterLink>

    <nav class="app-nav" aria-label="Primary navigation">
      <RouterLink to="/" class="nav-link" active-class="is-active" exact-active-class="is-active">
        Dashboard
      </RouterLink>
      <RouterLink to="/training" class="nav-link" active-class="is-active">
        Training
      </RouterLink>
    </nav>
  </header>
</template>
