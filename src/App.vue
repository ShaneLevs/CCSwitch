<script setup>
import { ref, onMounted } from 'vue'
import Switch from './Switch/index.vue'

const route = ref('')
const payload = ref('')

onMounted(() => {
  window.utools.onPluginEnter((action) => {
    route.value = action.code
    payload.value = action.payload || ''
  })
  window.utools.onPluginOut(() => {
    route.value = ''
    payload.value = ''
  })
})
</script>

<template>
  <Switch v-if="['claudeConfig', 'opencodeConfig', 'piConfig', 'installClaudeSkill', 'installOpencodeSkill', 'installPiExtension'].includes(route)" :route="route" :payload="payload" />
</template>
