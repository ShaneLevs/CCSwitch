<script setup>
import { ref, onMounted, nextTick, computed } from "vue";
import { Card, Statistic, Empty, Button, Tag, Tooltip, MessagePlugin } from "tdesign-vue-next";
import {
  RefreshIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  TimeIcon,
  LayersIcon,
  ChartIcon,
  SumIcon,
  FileAddIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "tdesign-icons-vue-next";
import ContributionGrid from "./ContributionGrid.vue";

const loading = ref(false);
const showAllModels = ref(false);
const showAllProjects = ref(false);

const usageData = ref({
  summary: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    sessionCount: 0,
  },
  modelStats: [],
  projectStats: [],
  contributions: [],
  avgTokensPerSession: 0,
});

const stats = [
  // 第一行：总处理、会话数、平均每会话
  { key: "total", title: "总处理 Tokens", icon: SumIcon, colorClass: "stat-green", iconColor: "#52c41a" },
  { key: "sessions", title: "总会话数", icon: LayersIcon, colorClass: "stat-blue", iconColor: "#1890ff", suffix: "次" },
  { key: "avg", title: "平均每会话", icon: ChartIcon, colorClass: "stat-teal", iconColor: "#13c2c2" },
  // 第二行：输入、首次缓存、命中缓存、输出
  { key: "input", title: "输入 Tokens", icon: ArrowUpIcon, colorClass: "stat-red", iconColor: "#f5222d" },
  { key: "cacheCreation", title: "首次缓存", icon: FileAddIcon, colorClass: "stat-orange", iconColor: "#fa8c16" },
  { key: "cacheRead", title: "命中缓存", icon: CheckCircleIcon, colorClass: "stat-purple", iconColor: "#722ed1" },
  { key: "output", title: "输出 Tokens", icon: ArrowDownIcon, colorClass: "stat-pink", iconColor: "#eb2f96" },
];

const displayLimit = 5;

const displayedModelStats = computed(() => {
  if (showAllModels.value) return usageData.value.modelStats;
  return usageData.value.modelStats.slice(0, displayLimit);
});

const displayedProjectStats = computed(() => {
  if (showAllProjects.value) return usageData.value.projectStats;
  return usageData.value.projectStats.slice(0, displayLimit);
});

const hasMoreModels = computed(() => usageData.value.modelStats.length > displayLimit);
const hasMoreProjects = computed(() => usageData.value.projectStats.length > displayLimit);

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
};

const getStatValue = (key) => {
  switch (key) {
    case "total": return usageData.value.summary.totalTokens;
    case "input": return usageData.value.summary.inputTokens;
    case "cacheCreation": return usageData.value.summary.cacheCreationTokens;
    case "cacheRead": return usageData.value.summary.cacheReadTokens;
    case "output": return usageData.value.summary.outputTokens;
    case "sessions": return usageData.value.summary.sessionCount;
    case "avg": return usageData.value.avgTokensPerSession;
    default: return 0;
  }
};

const loadData = async () => {
  loading.value = true;
  await nextTick();
  setTimeout(() => {
    try {
      const data = window.services.readClaudeUsage();
      usageData.value = data;
    } catch {
      // keep defaults
    }
    loading.value = false;
  }, 50);
};

onMounted(() => loadData());

defineExpose({ loadData });

const handleProjectClick = (projectPath) => {
  const result = window.services.copyClaudeCommand(projectPath);
  if (result.success) {
    MessagePlugin.success('命令已复制到剪贴板，请在终端中粘贴执行');
  } else {
    MessagePlugin.error(result.error || '复制命令失败');
  }
};
</script>

<template>
  <div class="usage-view">
    <div class="usage-header">
      <span class="usage-tip">当前统计数据仅用于展示处理的 token 数量，不做其他参考。</span>
      <Button size="small" variant="outline" :loading="loading" @click="loadData">
        <template #icon><RefreshIcon /></template>
        刷新数据
      </Button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards-row1">
      <div v-for="s in stats.slice(0, 3)" :key="s.key" class="stat-card" :class="s.colorClass">
        <Statistic :value="getStatValue(s.key)" :format="formatNumber" :suffix="s.suffix">
          <template #title>
            <span class="stat-title-row">
              <span class="stat-icon-wrap" :style="{ background: s.iconColor + '20', color: s.iconColor }">
                <component :is="s.icon" size="14px" />
              </span>
              <span>{{ s.title }}</span>
            </span>
          </template>
        </Statistic>
      </div>
    </div>
    <div class="stat-cards-row2">
      <div v-for="s in stats.slice(3)" :key="s.key" class="stat-card" :class="s.colorClass">
        <Statistic :value="getStatValue(s.key)" :format="formatNumber" :suffix="s.suffix">
          <template #title>
            <span class="stat-title-row">
              <span class="stat-icon-wrap" :style="{ background: s.iconColor + '20', color: s.iconColor }">
                <component :is="s.icon" size="14px" />
              </span>
              <span>{{ s.title }}</span>
            </span>
          </template>
        </Statistic>
      </div>
    </div>

    <!-- 贡献墙 -->
    <Card title="Usage Heatmap">
      <div v-if="loading" class="empty-small">
        <Empty description="加载中..." size="small" />
      </div>
      <div v-else-if="usageData.contributions.length === 0" class="empty-small">
        <Empty description="暂无数据" size="small" />
      </div>
      <ContributionGrid v-else :contributions="usageData.contributions" />
    </Card>

    <!-- 模型使用分布 -->
    <Card title="模型使用分布" class="model-card">
      <template #actions>
        <span class="model-hint">同一会话可能使用多个模型，故各模型会话数之和可能大于总会话数</span>
      </template>
      <div v-if="loading" class="empty-small">
        <Empty description="加载中..." size="small" />
      </div>
      <div v-else-if="usageData.modelStats.length === 0" class="empty-small">
        <Empty description="暂无数据" size="small" />
      </div>
      <div v-else class="model-list">
        <div v-for="model in displayedModelStats" :key="model.name" class="model-block">
          <div class="model-row">
            <div class="model-left">
              <span class="model-name">{{ model.name }}</span>
              <span class="model-sessions">{{ model.sessions }} 次会话</span>
            </div>
            <span class="model-tokens">{{ formatNumber(model.tokens) }} Tokens · In {{ formatNumber(model.inputTokens) }} · Out {{ formatNumber(model.outputTokens) }}</span>
          </div>
          <div class="model-bar-bg">
            <div class="model-bar" :style="{ width: (model.tokens / (usageData.summary.totalTokens || 1) * 100) + '%' }"></div>
          </div>
        </div>
        <div v-if="hasMoreModels" class="expand-btn-wrapper">
          <Button theme="default" variant="text" size="small" @click="showAllModels = !showAllModels">
            <template #icon>
              <component :is="showAllModels ? ChevronUpIcon : ChevronDownIcon" size="14px" />
            </template>
            {{ showAllModels ? '收起' : `查看更多 (${usageData.modelStats.length - displayLimit})` }}
          </Button>
        </div>
      </div>
    </Card>

    <!-- 项目使用分布 -->
    <Card title="项目使用分布" class="project-card">
      <div v-if="loading" class="empty-small">
        <Empty description="加载中..." size="small" />
      </div>
      <div v-else-if="usageData.projectStats.length === 0" class="empty-small">
        <Empty description="暂无数据" size="small" />
      </div>
      <div v-else class="project-list">
        <div v-for="project in displayedProjectStats" :key="project.name" class="project-block">
          <div class="project-row">
            <div class="project-left">
              <span class="project-name">{{ project.name }}</span>
              <Tag v-if="!project.exists" theme="warning" variant="light" size="small">已删除</Tag>
              <template v-if="project.exists">
                <Tooltip content="点击复制命令" placement="top">
                  <span
                    class="project-path clickable"
                    @click="handleProjectClick(project.path)"
                  >{{ project.path }}</span>
                </Tooltip>
              </template>
              <template v-else>
                <span class="project-path">{{ project.path }}</span>
              </template>
            </div>
            <span class="project-tokens">{{ formatNumber(project.tokens) }} Tokens · {{ project.sessions }} 次会话</span>
          </div>
          <div class="project-bar-bg">
            <div class="project-bar" :style="{ width: (project.tokens / (usageData.summary.totalTokens || 1) * 100) + '%' }"></div>
          </div>
        </div>
        <div v-if="hasMoreProjects" class="expand-btn-wrapper">
          <Button theme="default" variant="text" size="small" @click="showAllProjects = !showAllProjects">
            <template #icon>
              <component :is="showAllProjects ? ChevronUpIcon : ChevronDownIcon" size="14px" />
            </template>
            {{ showAllProjects ? '收起' : `查看更多 (${usageData.projectStats.length - displayLimit})` }}
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.usage-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.usage-tip {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.stat-cards-row1 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat-cards-row2 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  flex: 1;
  padding: 14px 16px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 统计卡片颜色 - 浅色模式 */
.stat-green { background: #f6ffed; }
.stat-blue { background: #e6f7ff; }
.stat-teal { background: #e6fffb; }
.stat-red { background: #fff1f0; }
.stat-orange { background: #fff7e6; }
.stat-purple { background: #f9f0ff; }
.stat-pink { background: #fff0f6; }

/* 统计卡片颜色 - 深色模式 */
:root[theme-mode="dark"] .stat-green { background: rgba(82, 196, 26, 0.12); }
:root[theme-mode="dark"] .stat-blue { background: rgba(24, 144, 255, 0.12); }
:root[theme-mode="dark"] .stat-teal { background: rgba(19, 194, 194, 0.12); }
:root[theme-mode="dark"] .stat-red { background: rgba(245, 34, 45, 0.12); }
:root[theme-mode="dark"] .stat-orange { background: rgba(250, 140, 22, 0.12); }
:root[theme-mode="dark"] .stat-purple { background: rgba(114, 46, 209, 0.12); }
:root[theme-mode="dark"] .stat-pink { background: rgba(235, 47, 150, 0.12); }

.stat-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon-wrap {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.stat-card :deep(.t-statistic-title) {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.stat-card :deep(.t-statistic-content) {
  font-size: 22px;
  font-weight: 700;
  color: var(--td-text-color-primary);
}

.stat-card :deep(.t-statistic-suffix) {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.model-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.model-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.model-sessions {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.model-tokens {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.model-bar-bg {
  height: 8px;
  background: var(--td-bg-color-component);
  border-radius: 4px;
  overflow: hidden;
}

.model-bar {
  height: 100%;
  background: var(--td-brand-color);
  border-radius: 4px;
  min-width: 2px;
  transition: width 0.3s ease;
}

.model-hint {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.empty-small {
  padding: 20px 0;
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.project-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.project-block:has(.project-left .t-tag) {
  opacity: 0.6;
}

.project-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.project-path {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  font-family: monospace;
}

.project-path.clickable {
  color: var(--td-brand-color);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.2s;
}

.project-path.clickable:hover {
  text-decoration-color: var(--td-brand-color);
}

.project-tokens {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.project-bar-bg {
  height: 8px;
  background: var(--td-bg-color-component);
  border-radius: 4px;
  overflow: hidden;
}

.project-bar {
  height: 100%;
  background: var(--td-brand-color);
  border-radius: 4px;
  min-width: 2px;
  transition: width 0.3s ease;
}

.expand-btn-wrapper {
  display: flex;
  justify-content: center;
  padding-top: 8px;
  border-top: 1px solid var(--td-component-stroke);
  margin-top: 4px;
}
</style>
