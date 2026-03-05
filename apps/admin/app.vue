<template>
  <UApp>
    <div class="app-shell">
      <div class="accent-orb -top-24 -left-20"></div>
      <div class="accent-orb -bottom-40 right-[-120px] opacity-60"></div>
      <ApiKeyGate>
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </ApiKeyGate>
    </div>
  </UApp>
</template>
