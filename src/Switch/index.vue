<script setup>
import { ref, computed, onMounted } from "vue";
import { Button, Dropdown } from "tdesign-vue-next";
import {
  ChartIcon,
  DashboardIcon,
  ServerIcon,
  BookIcon,
  ChevronDownIcon,
  AppIcon,
} from "tdesign-icons-vue-next";
import ConfigView from "./ConfigView.vue";
import UsageView from "./UsageView.vue";
import McpView from "./McpView.vue";
import SkillView from "./SkillView.vue";
import PluginView from "./PluginView.vue";
import OpenCodeConfigView from "./OpenCodeConfigView.vue";
import PiConfigView from "./PiConfigView.vue";
import PiMcpView from "./PiMcpView.vue";
import PiSkillView from "./PiSkillView.vue";
import PiPluginView from "./PiPluginView.vue";
import PiUsageView from "./PiUsageView.vue";
import OpenCodeMcpView from "./OpenCodeMcpView.vue";
import OpenCodeSkillView from "./OpenCodeSkillView.vue";
import OpenCodePluginView from "./OpenCodePluginView.vue";
import OpenCodeUsageView from "./OpenCodeUsageView.vue";
import wavingDark from '../assets/waving-dark.gif';
import wavingLight from '../assets/waving-light.gif';
import { useAppContext } from "../composables/useAppContext";

const props = defineProps({
  route: String,
  payload: String,
});

const { activeApp, setActiveApp, isClaude, isOpenCode, isPi } = useAppContext();

const activeTab = ref("config");
const skillViewRef = ref(null);
const wavingKey = ref(0);
const showWaving = ref(true);
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const wavingSrc = isDark ? wavingDark : wavingLight;

setTimeout(() => { showWaving.value = false; }, 3000);

const triggerWaving = () => {
  showWaving.value = true;
  wavingKey.value++;
  setTimeout(() => { showWaving.value = false; }, 3000);
};

const appLabel = computed(() => {
  if (isClaude.value) return 'Claude Code';
  if (isOpenCode.value) return 'Open Code';
  return 'Pi Agent';
});

const pageTitleSuffix = computed(() => {
  const map = {
    claude: { usage: '使用统计', mcp: 'MCP 配置', skill: 'Skill 配置', plugin: '插件管理', config: '配置切换' },
    opencode: { config: '配置管理', mcp: 'MCP 配置', skill: 'Skill', plugin: '扩展管理', usage: '使用统计' },
    pi: { config: '配置管理', mcp: 'MCP 配置', skill: 'Skill 管理', plugin: '扩展管理', usage: '使用统计' },
  }
  return map[activeApp.value]?.[activeTab.value] || '配置切换'
});

const pageTitle = computed(() => `${appLabel.value} ${pageTitleSuffix.value}`);

const switchApp = (app) => {
  if (activeApp.value !== app) {
    setActiveApp(app);
    activeTab.value = 'config';
  }
};

const appDropdownOptions = [
  { content: 'Claude Code', value: 'claude' },
  { content: 'Open Code', value: 'opencode' },
  { content: 'Pi Agent', value: 'pi' },
];

const handleAppSelect = (data) => {
  const app = typeof data === 'object' ? data.value : data;
  switchApp(app);
};

onMounted(() => {
  if (props.route === 'installSkill' && props.payload) {
    activeTab.value = 'skill';
    setTimeout(() => {
      if (skillViewRef.value) {
        skillViewRef.value.openInstallWithUrl(props.payload);
      }
    }, 100);
  }
});
</script>

<template>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <img v-if="showWaving && isClaude" :key="wavingKey" :src="wavingSrc" alt="logo" class="logo" @click="triggerWaving" />
        <img v-else-if="isClaude" src="/logo.png" alt="logo" class="logo" @click="triggerWaving" />
        <img v-else-if="isOpenCode" src="/icon-opencode.png" alt="logo" class="logo" />
        <img v-else src="/icon-pi.png" alt="logo" class="logo" />
        <Dropdown :options="appDropdownOptions" :min-column-width="160" @click="handleAppSelect">
          <span class="app-selector">
            {{ appLabel }} <ChevronDownIcon size="16px" />
          </span>
        </Dropdown>
        <t-typography-title level="h5">{{ pageTitleSuffix }}</t-typography-title>
      </div>
      <div class="header-right">
        <!-- Claude Code tabs -->
        <div v-if="isClaude" class="tab-buttons">
          <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
            <template #icon><DashboardIcon /></template> 配置管理
          </Button>
          <Button size="small" :theme="activeTab === 'mcp' ? 'primary' : 'default'" :variant="activeTab === 'mcp' ? 'base' : 'outline'" @click="activeTab = 'mcp'">
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button size="small" :theme="activeTab === 'skill' ? 'primary' : 'default'" :variant="activeTab === 'skill' ? 'base' : 'outline'" @click="activeTab = 'skill'">
            <template #icon><BookIcon /></template> Skill
          </Button>
          <Button size="small" :theme="activeTab === 'plugin' ? 'primary' : 'default'" :variant="activeTab === 'plugin' ? 'base' : 'outline'" @click="activeTab = 'plugin'">
            <template #icon><AppIcon /></template> Plugin
          </Button>
          <Button size="small" :theme="activeTab === 'usage' ? 'primary' : 'default'" :variant="activeTab === 'usage' ? 'base' : 'outline'" @click="activeTab = 'usage'">
            <template #icon><ChartIcon /></template> 使用统计
          </Button>
        </div>
        <!-- Pi Agent tabs -->
        <div v-else-if="isPi" class="tab-buttons">
          <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
            <template #icon><DashboardIcon /></template> 配置管理
          </Button>
          <Button size="small" :theme="activeTab === 'mcp' ? 'primary' : 'default'" :variant="activeTab === 'mcp' ? 'base' : 'outline'" @click="activeTab = 'mcp'">
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button size="small" :theme="activeTab === 'skill' ? 'primary' : 'default'" :variant="activeTab === 'skill' ? 'base' : 'outline'" @click="activeTab = 'skill'">
            <template #icon><BookIcon /></template> Skill
          </Button>
          <Button size="small" :theme="activeTab === 'plugin' ? 'primary' : 'default'" :variant="activeTab === 'plugin' ? 'base' : 'outline'" @click="activeTab = 'plugin'">
            <template #icon><AppIcon /></template> Plugin
          </Button>
          <Button size="small" :theme="activeTab === 'usage' ? 'primary' : 'default'" :variant="activeTab === 'usage' ? 'base' : 'outline'" @click="activeTab = 'usage'">
            <template #icon><ChartIcon /></template> 使用统计
          </Button>
        </div>
        <!-- Open Code tabs -->
        <div v-else class="tab-buttons">
          <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
            <template #icon><DashboardIcon /></template> 配置管理
          </Button>
          <Button size="small" :theme="activeTab === 'mcp' ? 'primary' : 'default'" :variant="activeTab === 'mcp' ? 'base' : 'outline'" @click="activeTab = 'mcp'">
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button size="small" :theme="activeTab === 'skill' ? 'primary' : 'default'" :variant="activeTab === 'skill' ? 'base' : 'outline'" @click="activeTab = 'skill'">
            <template #icon><BookIcon /></template> Skill
          </Button>
          <Button size="small" :theme="activeTab === 'plugin' ? 'primary' : 'default'" :variant="activeTab === 'plugin' ? 'base' : 'outline'" @click="activeTab = 'plugin'">
            <template #icon><AppIcon /></template> Plugin
          </Button>
          <Button size="small" :theme="activeTab === 'usage' ? 'primary' : 'default'" :variant="activeTab === 'usage' ? 'base' : 'outline'" @click="activeTab = 'usage'">
            <template #icon><ChartIcon /></template> 使用统计
          </Button>
        </div>
      </div>
    </div>

    <!-- Claude Code views -->
    <template v-if="isClaude">
      <ConfigView v-if="activeTab === 'config'" />
      <UsageView v-else-if="activeTab === 'usage'" />
      <McpView v-else-if="activeTab === 'mcp'" />
      <SkillView v-else-if="activeTab === 'skill'" ref="skillViewRef" />
      <PluginView v-else-if="activeTab === 'plugin'" />
    </template>

    <!-- Pi Agent views -->
    <template v-else-if="isPi">
      <PiConfigView v-if="activeTab === 'config'" />
      <PiUsageView v-else-if="activeTab === 'usage'" />
      <PiMcpView v-else-if="activeTab === 'mcp'" />
      <PiSkillView v-else-if="activeTab === 'skill'" />
      <PiPluginView v-else-if="activeTab === 'plugin'" />
    </template>

    <!-- Open Code views -->
    <template v-else>
      <OpenCodeConfigView v-if="activeTab === 'config'" />
      <OpenCodeMcpView v-else-if="activeTab === 'mcp'" />
      <OpenCodeSkillView v-else-if="activeTab === 'skill'" />
      <OpenCodePluginView v-else-if="activeTab === 'plugin'" />
      <OpenCodeUsageView v-else-if="activeTab === 'usage'" />
    </template>
  </div>
</template>

<style scoped>
.container { padding: 10px 20px 20px; min-height: 100vh; box-sizing: border-box; background: var(--td-bg-color-container); }
.header { display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 8px; }
.header-right { display: flex; align-items: center; }
.header .logo { width: 32px; height: 32px; border-radius: var(--td-radius-default); }
.header :deep(.t-typography-title) { margin: 0; }
.tab-buttons { display: flex; gap: 4px; align-items: center; }
.opencode-static-title { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 500; color: var(--td-text-color-primary); padding: 0 8px; }

.app-selector {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  padding: 4px 8px;
  border-radius: var(--td-radius-default);
  transition: background-color 0.2s;
  user-select: none;
  min-width: 110px;
}
.app-selector:hover {
  background-color: var(--td-bg-color-container-hover);
}

/* Switch dark mode fix: darken track when off so handle (white #fff) is visible */
:root[theme-mode="dark"] :deep(.t-switch) { background-color: var(--td-gray-color-6); }
:root[theme-mode="dark"] :deep(.t-switch:hover) { background-color: var(--td-gray-color-5); }
</style>
