<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  intro?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="page-header__copy">
      <div class="page-header__eyebrow">
        {{ eyebrow }}
      </div>
      <h1 class="page-header__title">
        {{ title }}
      </h1>
      <p v-if="intro" class="page-header__intro">
        {{ intro }}
      </p>
    </div>

    <div v-if="$slots.actions || $slots.meta" class="page-header__actions">
      <div v-if="$slots.actions" class="page-header__actions-row">
        <slot name="actions" />
      </div>
      <div v-if="$slots.meta" class="page-header__meta">
        <slot name="meta" />
      </div>
    </div>
  </header>
</template>
