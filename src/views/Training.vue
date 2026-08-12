<script setup>
import ReadinessWorkspace from '@/components/ReadinessWorkspace.vue';
import { trainingRepository } from '@/services/trainingRepository';
</script>

<template>
  <ReadinessWorkspace domain="training" :repository="trainingRepository" />
</template>
