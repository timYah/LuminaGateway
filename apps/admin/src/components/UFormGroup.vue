<script setup lang="ts">
const props = defineProps<{
  label?: string;
  help?: string;
  error?: string;
}>();
</script>

<template>
  <UFormField v-bind="props">
    <slot />
  </UFormField>
</template>
