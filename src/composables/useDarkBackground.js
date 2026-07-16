import { ref } from 'vue'

// 深色模式背景开关 + 效果选择（模块级单例，App.vue 渲染 / index.vue 设置按钮共享）
const ENABLED_ID = 'ccswitch_dark_background'
const EFFECT_ID = 'ccswitch_dark_effect'

const darkBackgroundEnabled = ref(true)
// 'prismatic' | 'pixel'
const darkEffect = ref('prismatic')

let initialized = false
function init() {
  if (initialized) return
  initialized = true
  try {
    const eDoc = window.utools?.db?.get(ENABLED_ID)
    if (eDoc && typeof eDoc.enabled === 'boolean') darkBackgroundEnabled.value = eDoc.enabled
    const fDoc = window.utools?.db?.get(EFFECT_ID)
    if (fDoc && (fDoc.effect === 'prismatic' || fDoc.effect === 'pixel')) darkEffect.value = fDoc.effect
  } catch (e) {
    /* ignore read error */
  }
}

export function useDarkBackground() {
  init()

  const setDarkBackground = (enabled) => {
    darkBackgroundEnabled.value = enabled
    try {
      const existing = window.utools?.db?.get(ENABLED_ID)
      window.utools?.db?.put({ _id: ENABLED_ID, enabled, ...(existing ? { _rev: existing._rev } : {}) })
    } catch (e) {
      /* ignore write error */
    }
  }

  const setDarkEffect = (effect) => {
    darkEffect.value = effect
    try {
      const existing = window.utools?.db?.get(EFFECT_ID)
      window.utools?.db?.put({ _id: EFFECT_ID, effect, ...(existing ? { _rev: existing._rev } : {}) })
    } catch (e) {
      /* ignore write error */
    }
  }

  return { darkBackgroundEnabled, setDarkBackground, darkEffect, setDarkEffect }
}
