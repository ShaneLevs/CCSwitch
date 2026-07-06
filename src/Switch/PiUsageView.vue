<script setup>
import { ref, onMounted, computed } from "vue";
import { Card, Statistic, Empty, Button, DateRangePicker, Space, Tooltip } from "tdesign-vue-next";
import {
  RefreshIcon, ArrowDownIcon, ArrowUpIcon, SumIcon,
} from "tdesign-icons-vue-next";
import ContributionGrid from "./ContributionGrid.vue";
import "./styles/PiUsageView.css";

const loading = ref(false);
const showAllModels = ref(false);
const dateRange = ref([]);
const usageData = ref({
  summary: { totalTokens: 0, inputTokens: 0, outputTokens: 0, totalCost: 0 },
  modelStats: [],
  contributions: [],
});

const stats = [
  { key: "total", title: "总 Tokens", icon: SumIcon, colorClass: "stat-green", iconColor: "#52c41a" },
  { key: "input", title: "输入 Tokens（含缓存）", icon: ArrowUpIcon, colorClass: "stat-red", iconColor: "#f5222d" },
  { key: "output", title: "输出 Tokens", icon: ArrowDownIcon, colorClass: "stat-pink", iconColor: "#eb2f96" },
];

const displayLimit = 5;

const formatNumber = (num) => {
  if (!num || num === 0) return '0';
  const units = ["", "K", "M", "B"];
  let tier = 0;
  while (num >= 1000 && tier < units.length - 1) {
    num /= 1000; tier++;
  }
  return tier === 0 ? num.toString() : num.toFixed(2) + units[tier];
};

const hasDateFilter = computed(() => dateRange.value.length === 2);

const filteredData = computed(() => {
  const raw = usageData.value;
  if (!hasDateFilter.value) return raw;
  const [from, to] = dateRange.value;
  const filteredContributions = raw.contributions.filter(c => c.date >= from && c.date <= to);

  let totalTokens = 0, inputTokens = 0, outputTokens = 0;
  const modelMap = new Map();

  for (const day of filteredContributions) {
    totalTokens += day.tokens || 0;
    inputTokens += day.inputTokens || 0;
    outputTokens += day.outputTokens || 0;
    if (day.models) {
      for (const [modelName, modelData] of Object.entries(day.models)) {
        if (!modelMap.has(modelName)) {
          modelMap.set(modelName, { name: modelName, tokens: 0, inputTokens: 0, outputTokens: 0 });
        }
        const m = modelMap.get(modelName);
        m.tokens += (modelData.inputTokens || 0) + (modelData.outputTokens || 0);
        m.inputTokens += modelData.inputTokens || 0;
        m.outputTokens += modelData.outputTokens || 0;
      }
    }
  }

  return {
    summary: { totalTokens, inputTokens, outputTokens, totalCost: raw.summary.totalCost },
    modelStats: Array.from(modelMap.values()).sort((a, b) => b.tokens - a.tokens),
    contributions: filteredContributions,
  };
});

const loadUsage = () => {
  try {
    usageData.value = window.services.readPiUsage();
  } catch (e) {
    console.error("加载 Pi 用量失败:", e);
  }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadUsage(); loading.value = false; }, 100);
};

onMounted(loadUsage);
</script>

<template>
  <div class="pi-usage-container">
    <div class="pi-usage-header">
      <span class="pi-usage-tip">Pi Agent 使用统计（从会话 JSONL 解析）</span>
      <div class="pi-usage-actions">
        <DateRangePicker
          v-model="dateRange"
          mode="date"
          :enable-time-picker="false"
          :presets="[
            { label: '近 7 天', value: [new Date(Date.now() - 6*864e5), new Date()] },
            { label: '近 30 天', value: [new Date(Date.now() - 29*864e5), new Date()] },
          ]"
          class="pi-date-picker"
          placeholder="选择日期范围"
        />
        <Tooltip content="刷新数据" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template> 刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <div class="pi-stats-row">
      <Card v-for="stat in stats" :key="stat.key" :bordered="true" hover class="pi-stat-card">
        <Statistic
          :title="stat.title"
          :value="formatNumber(filteredData.summary[stat.key === 'total' ? 'totalTokens' : stat.key === 'input' ? 'inputTokens' : 'outputTokens'])"
        >
          <template #prefix>
            <component :is="stat.icon" :style="{ color: stat.iconColor }" />
          </template>
        </Statistic>
      </Card>
    </div>

    <ContributionGrid :contributions="filteredData.contributions" />

    <div v-if="filteredData.modelStats.length === 0" class="pi-usage-empty">
      <Empty description="暂无使用数据，使用 Pi Agent 后会在此处显示" />
    </div>

    <Card v-else :bordered="true" class="pi-model-card">
      <template #header>
        <div class="pi-model-header">
          <span>模型使用分布</span>
          <Button size="small" variant="text" @click="showAllModels = !showAllModels">
            {{ showAllModels ? '收起' : '展开全部 (' + filteredData.modelStats.length + ')' }}
          </Button>
        </div>
      </template>
      <div
        v-for="(model, i) in (showAllModels ? filteredData.modelStats : filteredData.modelStats.slice(0, displayLimit))"
        :key="model.name"
        class="pi-model-row"
      >
        <div class="pi-model-bar-track">
          <div class="pi-model-bar" :style="{ width: (model.tokens / filteredData.modelStats[0].tokens * 100) + '%' }"></div>
        </div>
        <div class="pi-model-row-content">
          <span class="pi-model-row-name">{{ model.name }}</span>
          <Space size="small" class="pi-model-row-stats">
            <span class="pi-model-stat">{{ formatNumber(model.tokens) }} tokens</span>
            <span class="pi-model-stat-divider">|</span>
            <span class="pi-model-stat">in {{ formatNumber(model.inputTokens) }}</span>
            <span class="pi-model-stat-divider">|</span>
            <span class="pi-model-stat">out {{ formatNumber(model.outputTokens) }}</span>
          </Space>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
/* Pi scoped overrides — 仅覆盖 TDesign CSS 变量难以表达的细节 */
.pi-date-picker :deep(.t-input) {
  background: var(--td-bg-color-container);
}
</style>
