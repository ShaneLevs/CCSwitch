<script setup>
import { ref, onMounted, nextTick } from "vue";
import { Card, Statistic, Empty, Button, Tag } from "tdesign-vue-next";
import {
  RefreshIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  TimeIcon,
  LayersIcon,
  ChartIcon,
  SumIcon,
} from "tdesign-icons-vue-next";
import ContributionGrid from "./ContributionGrid.vue";

const loading = ref(false);
const usageData = ref({
  summary: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    sessionCount: 0,
  },
  modelStats: [],
  projectStats: [],
  contributions: [],
  avgTokensPerSession: 0,
});

const stats = [
  // 第一行：总消耗、会话数、平均每会话
  { key: "total", title: "总消耗 Tokens", icon: SumIcon, bg: "#E8F4E8" },
  { key: "sessions", title: "总会话数", icon: LayersIcon, bg: "#B5DEE5", suffix: "次" },
  { key: "avg", title: "平均每会话", icon: ChartIcon, bg: "#B5DFB8" },
  // 第二行：输入、缓存、输出
  { key: "input", title: "输入 Tokens", icon: ArrowUpIcon, bg: "#FFE8E8" },
  { key: "cache", title: "缓存 Tokens", icon: TimeIcon, bg: "#E0D4FF" },
  { key: "output", title: "输出 Tokens", icon: ArrowDownIcon, bg: "#F8DAF3" },
];

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
};

const getStatValue = (key) => {
  switch (key) {
    case "total": return usageData.value.summary.totalTokens;
    case "input": return usageData.value.summary.inputTokens;
    case "output": return usageData.value.summary.outputTokens;
    case "cache": return usageData.value.summary.cacheReadTokens;
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
</script>

<template>
  <div class="usage-view">
    <div class="usage-header">
      <span></span>
      <Button size="small" variant="outline" :loading="loading" @click="loadData">
        <template #icon><RefreshIcon /></template>
        刷新数据
      </Button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div v-for="s in stats" :key="s.key" class="stat-card" :style="{ background: s.bg }">
        <Statistic :value="getStatValue(s.key)" :format="formatNumber" :suffix="s.suffix">
          <template #title>
            <span class="stat-title-row">
              <span class="stat-icon-wrap">
                <component :is="s.icon" size="14px" />
              </span>
              <span>{{ s.title }}</span>
            </span>
          </template>
        </Statistic>
      </div>
    </div>

    <!-- 贡献墙 -->
    <Card title="Contributions">
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
      <div v-if="loading" class="empty-small">
        <Empty description="加载中..." size="small" />
      </div>
      <div v-else-if="usageData.modelStats.length === 0" class="empty-small">
        <Empty description="暂无数据" size="small" />
      </div>
      <div v-else class="model-list">
        <div v-for="model in usageData.modelStats" :key="model.name" class="model-block">
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
        <div v-for="project in usageData.projectStats" :key="project.name" class="project-block">
          <div class="project-row">
            <div class="project-left">
              <span class="project-name">{{ project.name }}</span>
              <Tag v-if="!project.exists" theme="warning" variant="light" size="small">已删除</Tag>
              <span class="project-path">{{ project.path }}</span>
            </div>
            <span class="project-tokens">{{ formatNumber(project.tokens) }} Tokens · {{ project.sessions }} 次会话</span>
          </div>
          <div class="project-bar-bg">
            <div class="project-bar" :style="{ width: (project.tokens / (usageData.summary.totalTokens || 1) * 100) + '%' }"></div>
          </div>
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

.stat-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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

.stat-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon-wrap {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.45);
}

.stat-card :deep(.t-statistic-title) {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
}

.stat-card :deep(.t-statistic-content) {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
}

.stat-card :deep(.t-statistic-suffix) {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
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
</style>
