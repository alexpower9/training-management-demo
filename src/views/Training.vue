<script setup>
import {ref} from 'vue'
import DashSelect from '@/components/DashSelect.vue';
import Dashboard from '@/components/Dashboard.vue';
import Mandatory from '@/components/Mandatory.vue';

const currentMode = ref('status');

// Handle mode changes from DashSelect
const handleModeChange = (mode) => {
  currentMode.value = mode;
};
</script>

<template>
    <div class="">
        <div>
            <!-- Mode selector at the top of the view -->
            <div class="lg:flex py-3 px-7">
                <DashSelect @update:mode="handleModeChange" />
            </div>
            
            <!-- Conditional rendering based on selected mode -->
            <Dashboard v-if="currentMode === 'status'" />
            
            <!-- Placeholder for the modification component -->
            <div v-else-if="currentMode === 'modify'" class="flex-grow w-full bg-base-100 p-6 min-h-[calc(100vh-80px)]">
            <div class="text-center p-8">
                <h2 class="text-2xl font-semibold mb-4">Modify Mode</h2>
                <p class="text-base-content/70">Modification interface will be implemented here.</p>
            </div>
            </div>
            
            <Mandatory v-else-if="currentMode === 'mandatory'"/>


        </div>
    </div>
</template>
