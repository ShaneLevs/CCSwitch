import { createApp } from 'vue'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/es/style/index.css'
import './main.css'
import App from './App.vue'

// 检测并应用系统主题
const applySystemTheme = () => {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  if (isDark) {
    document.documentElement.setAttribute('theme-mode', 'dark')
  } else {
    document.documentElement.removeAttribute('theme-mode')
  }
}

// 初始化主题
applySystemTheme()

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySystemTheme)

const app = createApp(App)
app.use(TDesign)
app.mount('#app')
