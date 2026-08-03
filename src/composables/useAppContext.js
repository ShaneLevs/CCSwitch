import { ref, computed } from 'vue'

const activeApp = ref('claude')

export function useAppContext() {
  const setActiveApp = (app) => {
    activeApp.value = app
  }

  const isClaude = computed(() => activeApp.value === 'claude')
  const isOpenCode = computed(() => activeApp.value === 'opencode')
  const isPi = computed(() => activeApp.value === 'pi')
  const isOmp = computed(() => activeApp.value === 'omp')

  return { activeApp, setActiveApp, isClaude, isOpenCode, isPi, isOmp }
}
