<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";
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
import OpenCodePluginView from "./OpenCodePluginView.vue";
import OpenCodeSkillView from "./OpenCodeSkillView.vue";
import OpenCodeUsageView from "./OpenCodeUsageView.vue";
import wavingDark from "../assets/waving-dark.gif";
import wavingLight from "../assets/waving-light.gif";
import { useAppContext } from "../composables/useAppContext";

const props = defineProps({
  route: String,
  payload: String,
});

const { activeApp, setActiveApp, isClaude, isOpenCode, isPi } = useAppContext();

const activeTab = ref("config");
const skillViewRef = ref(null);
const ocSkillViewRef = ref(null);
// 记录哪些应用已被激活过，激活后保留组件不销毁，避免 v-show 导致热力图宽度计算为 0
const activatedApps = ref(new Set(['claude']));

const ensureAppActivated = (app) => {
  if (!activatedApps.value.has(app)) {
    activatedApps.value.add(app);
  }
};

// 初始化当前应用为已 activated
ensureAppActivated(activeApp.value);

const isAppReady = (app) => activatedApps.value.has(app);

// 记录每个应用下已访问过的标签页，首次访问后保持组件不销毁
const visitedTabs = ref(new Set(['claude:config']));

const markTabVisited = (app, tab) => {
  visitedTabs.value.add(`${app}:${tab}`);
};

const isTabVisited = (app, tab) => visitedTabs.value.has(`${app}:${tab}`);

// 初始化当前标签为已访问
markTabVisited(activeApp.value, activeTab.value);

// 标签页/应用切换时自动标记已访问，保持组件不销毁
watch([activeTab, activeApp], () => {
  markTabVisited(activeApp.value, activeTab.value);
});

const wavingKey = ref(0);
const showWaving = ref(true);
const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const wavingSrc = isDark ? wavingDark : wavingLight;

setTimeout(() => {
  showWaving.value = false;
}, 3000);

const triggerWaving = () => {
  showWaving.value = true;
  wavingKey.value++;
  setTimeout(() => {
    showWaving.value = false;
  }, 3000);
};

const appLabel = computed(() => {
  if (isClaude.value) return "Claude Code";
  if (isOpenCode.value) return "OpenCode";
  return "Pi Agent";
});

const pageTitleSuffix = computed(() => {
  const map = {
    claude: {
      usage: "使用统计",
      mcp: "MCP 配置",
      skill: "Skill 配置",
      plugin: "插件管理",
      config: "配置切换",
    },
    opencode: {
      config: "配置管理",
      mcp: "MCP 配置",
      skill: "Skill",
      plugin: "扩展管理",
      usage: "使用统计",
    },
    pi: {
      config: "配置管理",
      mcp: "MCP 配置",
      skill: "Skill 管理",
      plugin: "扩展管理",
      usage: "使用统计",
    },
  };
  return map[activeApp.value]?.[activeTab.value] || "配置切换";
});

const pageTitle = computed(() => `${appLabel.value} ${pageTitleSuffix.value}`);

const switchApp = (app) => {
  if (activeApp.value !== app) {
    setActiveApp(app);
    activeTab.value = "config";
    ensureAppActivated(app);
    // 切到新应用后，触发一次 resize 让热力图重新计算宽度
    nextTick(() => window.dispatchEvent(new Event("resize")));
  }
};

const appDropdownOptions = [
  { content: "Claude Code", value: "claude" },
  { content: "OpenCode", value: "opencode" },
  { content: "Pi Agent", value: "pi" },
];

const handleAppSelect = (data) => {
  const app = typeof data === "object" ? data.value : data;
  switchApp(app);
};

onMounted(() => {
  // 根据入口命令预选对应应用
  const appMap = {
    claudeConfig: "claude",
    opencodeConfig: "opencode",
    piConfig: "pi",
  };
  if (appMap[props.route]) {
    setActiveApp(appMap[props.route]);
    ensureAppActivated(appMap[props.route]);
  }

  if (props.route === "installClaudeSkill" && props.payload) {
    setActiveApp("claude");
    ensureAppActivated("claude");
    markTabVisited("claude", "skill");
    activeTab.value = "skill";
    setTimeout(() => {
      if (skillViewRef.value) {
        skillViewRef.value.openInstallWithUrl(props.payload);
      }
    }, 100);
  } else if (props.route === "installOpencodeSkill" && props.payload) {
    setActiveApp("opencode");
    ensureAppActivated("opencode");
    markTabVisited("opencode", "skill");
    activeTab.value = "skill";
    setTimeout(() => {
      if (ocSkillViewRef.value) {
        ocSkillViewRef.value.openInstallWithUrl(props.payload);
      }
    }, 100);
  }
});
</script>

<template>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <img
          v-if="showWaving && isClaude"
          :key="wavingKey"
          :src="wavingSrc"
          alt="logo"
          class="logo"
          @click="triggerWaving"
        />
        <img
          v-else-if="isClaude"
          src="/logo.png"
          alt="logo"
          class="logo"
          @click="triggerWaving"
        />
        <img
          v-else-if="isOpenCode"
          src="/icon-opencode.png"
          alt="logo"
          class="logo"
        />
        <img v-else src="/icon-pi.png" alt="logo" class="logo" />
        <Dropdown
          :options="appDropdownOptions"
          :min-column-width="160"
          @click="handleAppSelect"
        >
          <span class="app-selector">
            {{ appLabel }} <ChevronDownIcon size="16px" />
          </span>
        </Dropdown>
        <t-typography-title level="h5">{{
          pageTitleSuffix
        }}</t-typography-title>
      </div>
      <div class="header-right">
        <!-- Claude Code tabs -->
        <div v-if="isClaude" class="tab-buttons">
          <Button
            size="small"
            :theme="activeTab === 'config' ? 'primary' : 'default'"
            :variant="activeTab === 'config' ? 'base' : 'outline'"
            @click="activeTab = 'config'"
          >
            <template #icon><DashboardIcon /></template> 配置
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'mcp' ? 'primary' : 'default'"
            :variant="activeTab === 'mcp' ? 'base' : 'outline'"
            @click="activeTab = 'mcp'"
          >
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'skill' ? 'primary' : 'default'"
            :variant="activeTab === 'skill' ? 'base' : 'outline'"
            @click="activeTab = 'skill'"
          >
            <template #icon><BookIcon /></template> Skill
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'plugin' ? 'primary' : 'default'"
            :variant="activeTab === 'plugin' ? 'base' : 'outline'"
            @click="activeTab = 'plugin'"
          >
            <template #icon><AppIcon /></template> Plugin
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'usage' ? 'primary' : 'default'"
            :variant="activeTab === 'usage' ? 'base' : 'outline'"
            @click="activeTab = 'usage'"
          >
            <template #icon><ChartIcon /></template> 统计
          </Button>
        </div>
        <!-- Pi Agent tabs -->
        <div v-else-if="isPi" class="tab-buttons">
          <Button
            size="small"
            :theme="activeTab === 'config' ? 'primary' : 'default'"
            :variant="activeTab === 'config' ? 'base' : 'outline'"
            @click="activeTab = 'config'"
          >
            <template #icon><DashboardIcon /></template> 配置
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'mcp' ? 'primary' : 'default'"
            :variant="activeTab === 'mcp' ? 'base' : 'outline'"
            @click="activeTab = 'mcp'"
          >
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'skill' ? 'primary' : 'default'"
            :variant="activeTab === 'skill' ? 'base' : 'outline'"
            @click="activeTab = 'skill'"
          >
            <template #icon><BookIcon /></template> Skill
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'plugin' ? 'primary' : 'default'"
            :variant="activeTab === 'plugin' ? 'base' : 'outline'"
            @click="activeTab = 'plugin'"
          >
            <template #icon><AppIcon /></template> Plugin
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'usage' ? 'primary' : 'default'"
            :variant="activeTab === 'usage' ? 'base' : 'outline'"
            @click="activeTab = 'usage'"
          >
            <template #icon><ChartIcon /></template> 统计
          </Button>
        </div>
        <!-- OpenCode tabs -->
        <div v-else class="tab-buttons">
          <Button
            size="small"
            :theme="activeTab === 'config' ? 'primary' : 'default'"
            :variant="activeTab === 'config' ? 'base' : 'outline'"
            @click="activeTab = 'config'"
          >
            <template #icon><DashboardIcon /></template> 配置
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'mcp' ? 'primary' : 'default'"
            :variant="activeTab === 'mcp' ? 'base' : 'outline'"
            @click="activeTab = 'mcp'"
          >
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'skill' ? 'primary' : 'default'"
            :variant="activeTab === 'skill' ? 'base' : 'outline'"
            @click="activeTab = 'skill'"
          >
            <template #icon><BookIcon /></template> Skill
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'plugin' ? 'primary' : 'default'"
            :variant="activeTab === 'plugin' ? 'base' : 'outline'"
            @click="activeTab = 'plugin'"
          >
            <template #icon><AppIcon /></template> Plugin
          </Button>
          <Button
            size="small"
            :theme="activeTab === 'usage' ? 'primary' : 'default'"
            :variant="activeTab === 'usage' ? 'base' : 'outline'"
            @click="activeTab = 'usage'"
          >
            <template #icon><ChartIcon /></template> 统计
          </Button>
        </div>
      </div>
    </div>

    <!-- Claude Code views：已访问的标签页用 v-show 保持挂载，避免重复加载 -->
    <template v-if="isAppReady('claude')">
      <ConfigView v-if="isClaude && activeTab === 'config'" />
      <UsageView v-if="isTabVisited('claude', 'usage')" v-show="isClaude && activeTab === 'usage'" />
      <McpView v-if="isTabVisited('claude', 'mcp')" v-show="isClaude && activeTab === 'mcp'" />
      <SkillView v-if="isTabVisited('claude', 'skill')" v-show="isClaude && activeTab === 'skill'" ref="skillViewRef" />
      <PluginView v-if="isTabVisited('claude', 'plugin')" v-show="isClaude && activeTab === 'plugin'" />
    </template>

    <!-- Pi Agent views -->
    <template v-if="isAppReady('pi')">
      <PiConfigView v-if="isPi && activeTab === 'config'" />
      <PiUsageView v-if="isTabVisited('pi', 'usage')" v-show="isPi && activeTab === 'usage'" />
      <PiMcpView v-if="isTabVisited('pi', 'mcp')" v-show="isPi && activeTab === 'mcp'" />
      <PiSkillView v-if="isTabVisited('pi', 'skill')" v-show="isPi && activeTab === 'skill'" />
      <PiPluginView v-if="isTabVisited('pi', 'plugin')" v-show="isPi && activeTab === 'plugin'" />
    </template>

    <!-- OpenCode views -->
    <template v-if="isAppReady('opencode')">
      <OpenCodeConfigView v-if="isOpenCode && activeTab === 'config'" />
      <OpenCodeMcpView v-if="isTabVisited('opencode', 'mcp')" v-show="isOpenCode && activeTab === 'mcp'" />
      <OpenCodeSkillView v-if="isTabVisited('opencode', 'skill')" v-show="isOpenCode && activeTab === 'skill'" ref="ocSkillViewRef" />
      <OpenCodePluginView v-if="isTabVisited('opencode', 'plugin')" v-show="isOpenCode && activeTab === 'plugin'" />
      <OpenCodeUsageView v-if="isTabVisited('opencode', 'usage')" v-show="isOpenCode && activeTab === 'usage'" />
    </template>
  </div>
</template>

<style scoped>
.container {
  padding: 10px 20px 20px;
  min-height: 100vh;
  box-sizing: border-box;
  background: var(--td-bg-color-container);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-right {
  display: flex;
  align-items: center;
}
.header .logo {
  width: 32px;
  height: 32px;
  border-radius: var(--td-radius-default);
}
.header :deep(.t-typography-title) {
  margin: 0;
}
.tab-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
}
.opencode-static-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
  padding: 0 8px;
}

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
:root[theme-mode="dark"] :deep(.t-switch) {
  background-color: var(--td-gray-color-6);
}
:root[theme-mode="dark"] :deep(.t-switch:hover) {
  background-color: var(--td-gray-color-5);
}
</style>
