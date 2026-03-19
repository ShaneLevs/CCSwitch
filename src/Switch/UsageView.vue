<script setup>
import { ref, onMounted } from "vue";
import { Card, Statistic, Empty, Button } from "tdesign-vue-next";
import { RefreshIcon } from "tdesign-icons-vue-next";
import ContributionGrid from "./ContributionGrid.vue";

const usageData = ref({
  summary: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    sessionCount: 0,
  },
  modelStats: [],
  contributions: [],
  avgTokensPerSession: 0,
});

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
};

const loadData = () => {
  try {
    const data = window.services.readClaudeUsage();
    usageData.value = data;
  } catch {
    usageData.value = {
      summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, totalTokens: 0, sessionCount: 0 },
      modelStats: [],
      contributions: [],
      avgTokensPerSession: 0,
    };
  }
};

onMounted(() => loadData());

defineExpose({ loadData });
</script>

<template>
  <div class="usage-view">
    <div class="usage-header">
      <span></span>
      <Button size="small" variant="outline" @click="loadData">
        <template #icon><RefreshIcon /></template>
        刷新数据
      </Button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <Card class="stat-card" size="small">
        <Statistic title="Input Tokens" :value="usageData.summary.inputTokens" :format="formatNumber" />
      </Card>
      <Card class="stat-card" size="small">
        <Statistic title="Output Tokens" :value="usageData.summary.outputTokens" :format="formatNumber" />
      </Card>
      <Card class="stat-card" size="small">
        <Statistic title="Cache Tokens" :value="usageData.summary.cacheReadTokens" :format="formatNumber" />
      </Card>
      <Card class="stat-card" size="small">
        <Statistic title="总会话数" :value="usageData.summary.sessionCount" suffix="次" />
      </Card>
      <Card class="stat-card" size="small">
        <Statistic title="平均每会话" :value="usageData.avgTokensPerSession" :format="formatNumber" />
      </Card>
    </div>

    <!-- 模型使用分布 -->
    <Card title="模型使用分布" class="model-card">
      <div v-if="usageData.modelStats.length === 0" class="empty-small">
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

    <!-- 贡献墙 -->
    <Card title="Contributions">
      <div v-if="usageData.contributions.length === 0" class="empty-small">
        <Empty description="暂无数据" size="small" />
      </div>
      <ContributionGrid v-else :contributions="usageData.contributions" />
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
  display: flex;
  gap: 12px;
}

.stat-card {
  flex: 1;
  text-align: center;
}

.stat-card :deep(.t-statistic-content) {
  font-size: 22px;
  font-weight: 600;
}

.stat-card :deep(.t-statistic-title) {
  font-size: 13px;
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
</style>
