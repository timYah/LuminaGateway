<script setup lang="ts">
import ApiKeyGate from "./components/ApiKeyGate.vue";
import AppLayout from "./components/AppLayout.vue";
</script>

<template>
  <div class="isolate">
    <UApp>
      <div class="app-shell">
        <div class="accent-orb -top-24 -left-20"></div>
        <div class="accent-orb -bottom-40 right-[-120px] opacity-60"></div>
        <ApiKeyGate>
          <AppLayout>
            <RouterView />
          </AppLayout>
        </ApiKeyGate>
      </div>
    </UApp>
  </div>
</template>
