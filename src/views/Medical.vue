<script setup>
import ReadinessWorkspace from '@/components/ReadinessWorkspace.vue';
import { medicalRepository } from '@/services/medicalRepository';
</script>

<template>
  <ReadinessWorkspace domain="medical" :repository="medicalRepository" />
</template>
