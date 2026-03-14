<script setup>
import { ref, onMounted } from 'vue'
import Switch from './Switch/index.vue'

const route = ref('')

onMounted(() => {
  window.utools.onPluginEnter((action) => {
    route.value = action.code
  })
  window.utools.onPluginOut(() => {
    route.value = ''
  })
})
</script>

<template>
  <Switch v-if="route === 'switch'" />
</template>
