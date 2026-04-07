<script setup>
import { ref, computed } from "vue";
import { Button } from "tdesign-vue-next";
import {
  ChartIcon,
  DashboardIcon,
  ServerIcon,
} from "tdesign-icons-vue-next";
import ConfigView from "./ConfigView.vue";
import UsageView from "./UsageView.vue";
import McpView from "./McpView.vue";

const activeTab = ref("config");

const pageTitle = computed(() => {
  if (activeTab.value === 'usage') return 'Claude Code 使用统计';
  if (activeTab.value === 'mcp') return 'Claude Code MCP 配置';
  return 'Claude Code 配置切换';
});
</script>

<template>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <img src="/logo.png" alt="logo" class="logo" />
        <t-typography-title level="h5">{{ pageTitle }}</t-typography-title>
      </div>
      <div class="header-right">
        <div class="tab-buttons">
          <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
            <template #icon><DashboardIcon /></template> 配置管理
          </Button>
          <Button size="small" :theme="activeTab === 'mcp' ? 'primary' : 'default'" :variant="activeTab === 'mcp' ? 'base' : 'outline'" @click="activeTab = 'mcp'">
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button size="small" :theme="activeTab === 'usage' ? 'primary' : 'default'" :variant="activeTab === 'usage' ? 'base' : 'outline'" @click="activeTab = 'usage'">
            <template #icon><ChartIcon /></template> 使用统计
          </Button>
        </div>
      </div>
    </div>

    <ConfigView v-if="activeTab === 'config'" />
    <UsageView v-else-if="activeTab === 'usage'" />
    <McpView v-else-if="activeTab === 'mcp'" />
  </div>
</template>

<style scoped>
.container { padding: 20px; min-height: 100vh; background: var(--td-bg-color-container); }
.header { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 12px; }
.header-right { display: flex; align-items: center; }
.header .logo { width: 32px; height: 32px; border-radius: 6px; }
.header :deep(.t-typography-title) { margin: 0; }
.tab-buttons { display: flex; gap: 4px; }
</style>