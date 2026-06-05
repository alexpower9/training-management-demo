<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { completeSignIn } from '@/auth/auth';

const router = useRouter();
const errorMessage = ref('');

onMounted(async () => {
  try {
    const returnTo = await completeSignIn();
    await router.replace(returnTo);
  } catch {
    errorMessage.value = 'Sign-in could not be completed. Please return to the application and try again.';
  }
});
</script>

<template>
  <section class="auth-state">
    <div class="panel auth-state__panel">
      <h1>{{ errorMessage ? 'Sign-in failed' : 'Completing sign-in' }}</h1>
      <p>{{ errorMessage || 'Your NME session is being prepared.' }}</p>
      <RouterLink v-if="errorMessage" to="/training" class="primary-action">
        Return to training
      </RouterLink>
    </div>
  </section>
</template>
