import { ref, computed } from 'vue'

const activeApp = ref('claude')

export function useAppContext() {
  const setActiveApp = (app) => {
    activeApp.value = app
  }

  const isClaude = computed(() => activeApp.value === 'claude')
  const isOpenCode = computed(() => activeApp.value === 'opencode')
  const isCodex = computed(() => activeApp.value === 'codex')

  return { activeApp, setActiveApp, isClaude, isOpenCode, isCodex }
}
