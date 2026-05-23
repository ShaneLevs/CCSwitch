<script setup>
import { ref, computed, onMounted } from "vue";
import { Button } from "tdesign-vue-next";
import {
  ChartIcon,
  DashboardIcon,
  ServerIcon,
  BookIcon,
} from "tdesign-icons-vue-next";
import ConfigView from "./ConfigView.vue";
import UsageView from "./UsageView.vue";
import McpView from "./McpView.vue";
import SkillView from "./SkillView.vue";
import wavingDark from '../assets/waving-dark.gif';
import wavingLight from '../assets/waving-light.gif';

const props = defineProps({
  route: String,
  payload: String,
});

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

const pageTitle = computed(() => {
  if (activeTab.value === 'usage') return 'Claude Code 使用统计';
  if (activeTab.value === 'mcp') return 'Claude Code MCP 配置';
  if (activeTab.value === 'skill') return 'Claude Code Skill 配置';
  return 'Claude Code 配置切换';
});

onMounted(() => {
  // 如果通过匹配指令进入，切换到 skill 标签并打开安装
  if (props.route === 'installSkill' && props.payload) {
    activeTab.value = 'skill';
    // 等待 SkillView 渲染完成
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
        <img v-if="showWaving" :key="wavingKey" :src="wavingSrc" alt="logo" class="logo" @click="triggerWaving" />
        <img v-else src="/logo.png" alt="logo" class="logo" @click="triggerWaving" />
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
          <Button size="small" :theme="activeTab === 'skill' ? 'primary' : 'default'" :variant="activeTab === 'skill' ? 'base' : 'outline'" @click="activeTab = 'skill'">
            <template #icon><BookIcon /></template> Skill
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
    <SkillView v-else-if="activeTab === 'skill'" ref="skillViewRef" />
  </div>
</template>

<style scoped>
.container { padding: 20px; min-height: 100vh; box-sizing: border-box; background: var(--td-bg-color-container); }
.header { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 12px; }
.header-right { display: flex; align-items: center; }
.header .logo { width: 32px; height: 32px; border-radius: var(--td-radius-default); }
.header :deep(.t-typography-title) { margin: 0; }
.tab-buttons { display: flex; gap: 4px; }

/* Switch dark mode fix: darken track when off so handle (white #fff) is visible */
:root[theme-mode="dark"] :deep(.t-switch) { background-color: var(--td-gray-color-6); }
:root[theme-mode="dark"] :deep(.t-switch:hover) { background-color: var(--td-gray-color-5); }
</style>