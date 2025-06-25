<script setup>

import Card from '@/components/Card.vue';

</script>

<template>
    <div class="overflow-hidden h-full w-full bg-base-100"> <!-- Container div -->
        <div class="flex justify-start items-center pt-4 lg:pt-10 flex-col lg:flex-row lg:justify-center lg:items-start">
            <div class="gap-6 w-[75vw] flex flex-col items-center lg:flex-row lg:justify-around lg:items-center lg:gap-10">
                <Card class="" title="Training" desc="View training status of both employees and customers" img_path="drill2.jpg" path="/training"/>
                <Card title="Schedule" desc="View or adjust schedule" img_path="drill2.jpg" path="/schedule" />
            </div>
        </div>
    </div>
</template>

