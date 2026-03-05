<template>
  <div class="relative z-10">
    <div class="max-w-[1400px] mx-auto px-4 md:px-8 py-10">
      <div class="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-10">
        <aside class="space-y-8">
          <div class="glass-panel radius-panel p-5 subtle-ring">
            <div class="text-xs uppercase tracking-[0.32em] text-slate-500">
              Lumina Gateway
            </div>
            <div class="mt-3 text-2xl font-semibold text-slate-900">
              Admin Console
            </div>
            <p class="mt-2 text-sm text-slate-600 leading-relaxed">
              Manage providers, balances, and usage activity with a single view.
            </p>
          </div>
          <nav class="space-y-2">
            <RouterLink
              to="/providers"
              class="block radius-card px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-white/70 hover:text-slate-900 action-press"
              active-class="bg-white text-slate-900 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.4)]"
            >
              Providers
            </RouterLink>
            <RouterLink
              to="/usage"
              class="block radius-card px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-white/70 hover:text-slate-900 action-press"
              active-class="bg-white text-slate-900 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.4)]"
            >
              Usage
            </RouterLink>
          </nav>
        </aside>

        <main class="space-y-8">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
