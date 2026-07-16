import { ref } from 'vue'

// 深色模式背景开关 + 效果选择（模块级单例，App.vue 渲染 / index.vue 设置按钮共享）
const DOC_ID = 'ccswitch_dark_background'

const darkBackgroundEnabled = ref(true)
// 'prismatic' | 'pixel'
const darkEffect = ref('prismatic')

function readDoc() {
  try {
    return window.utools?.db?.get(DOC_ID)
  } catch (e) {
    return null
  }
}

let initialized = false
function init() {
  if (initialized) return
  initialized = true
  const doc = readDoc()
  if (doc) {
    if (typeof doc.enabled === 'boolean') darkBackgroundEnabled.value = doc.enabled
    if (doc.effect === 'prismatic' || doc.effect === 'pixel') darkEffect.value = doc.effect
  }
}

function saveDoc() {
  const existing = readDoc()
  window.utools?.db?.put({
    _id: DOC_ID,
    enabled: darkBackgroundEnabled.value,
    effect: darkEffect.value,
    ...(existing ? { _rev: existing._rev } : {}),
  })
}

export function useDarkBackground() {
  init()

  const setDarkBackground = (enabled) => {
    darkBackgroundEnabled.value = enabled
    try { saveDoc() } catch (e) { /* ignore write error */ }
  }

  const setDarkEffect = (effect) => {
    darkEffect.value = effect
    try { saveDoc() } catch (e) { /* ignore write error */ }
  }

  return { darkBackgroundEnabled, setDarkBackground, darkEffect, setDarkEffect }
}
