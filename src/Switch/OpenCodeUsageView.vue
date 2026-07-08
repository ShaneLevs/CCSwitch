<script setup>
import { ref, onMounted, computed } from "vue";
import { Card, Statistic, Empty, Button, DateRangePicker, Space, Tooltip } from "tdesign-vue-next";
import {
  RefreshIcon, ArrowDownIcon, ArrowUpIcon, SumIcon,
  ChevronUpIcon, ChevronDownIcon,
} from "tdesign-icons-vue-next";
import ContributionGrid from "./ContributionGrid.vue";
import "./styles/OpenCodeUsageView.css";

const loading = ref(false);
const showAllModels = ref(false);
const dateRange = ref([]);
const usageData = ref({
  summary: { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
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
    summary: { totalTokens, inputTokens, outputTokens },
    modelStats: Array.from(modelMap.values()).sort((a, b) => b.tokens - a.tokens),
    contributions: filteredContributions,
  };
});

const displayedModelStats = computed(() => {
  if (showAllModels.value) return filteredData.value.modelStats;
  return filteredData.value.modelStats.slice(0, displayLimit);
});

const hasMoreModels = computed(() => filteredData.value.modelStats.length > displayLimit);

const totalTokensForBar = computed(() => filteredData.value.summary.totalTokens || 1);

const getStatValue = (key) => {
  const data = filteredData.value.summary;
  switch (key) {
    case "total": return data.totalTokens;
    case "input": return data.inputTokens;
    case "output": return data.outputTokens;
    default: return 0;
  }
};

const loadData = async () => {
  loading.value = true;
  await new Promise(r => setTimeout(r, 50));
  try {
    const result = window.services.readOpencodeUsage();
    usageData.value = {
      summary: result.summary || { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
      modelStats: result.modelStats || [],
      contributions: result.contributions || [],
    };
  } catch (e) {
    console.error("加载 OpenCode 用量失败:", e);
  }
  loading.value = false;
};

const handleRefresh = () => loadData();

onMounted(loadData);
</script>

<template>
  <div class="oc-usage-view">
    <div class="oc-usage-header">
      <span class="oc-usage-tip">统计仅供参考 · 解析 opencode.db 中的 session tokens_* 列</span>
      <div class="oc-usage-actions">
        <DateRangePicker
          v-model="dateRange"
          allow-input
          clearable
          size="small"
          style="width: 240px;"
          placeholder="选择日期区间"
        />
        <Button size="small" variant="outline" :loading="loading" @click="handleRefresh">
          <template #icon><RefreshIcon /></template>
          刷新数据
        </Button>
      </div>
    </div>

    <div v-if="usageData.modelStats.length === 0 && usageData.contributions.length === 0" class="oc-usage-empty">
      <Empty description="暂无 OpenCode 用量数据">
        <template #action>
          <Button size="small" theme="primary" @click="handleRefresh">
            <template #icon><RefreshIcon /></template> 重新加载
          </Button>
        </template>
      </Empty>
      <div style="font-size:12px;color:var(--td-text-color-placeholder);margin-top:8px;">
        请确认 OpenCode 已在本地运行过，且 %LOCALAPPDATA%\opencode\opencode.db 存在
      </div>
    </div>

    <template v-else>
      <!-- 统计卡片 -->
      <div class="stat-cards-row">
        <div v-for="s in stats" :key="s.key" class="stat-card" :class="s.colorClass">
          <Statistic :value="getStatValue(s.key)" :format="formatNumber">
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
      <Card :bordered="true" v-if="usageData.contributions.length > 0">
        <template #header>
          <span class="oc-usage-section-header">每日用量热力图</span>
        </template>
        <ContributionGrid :contributions="filteredData.contributions" />
      </Card>

      <!-- 模型分布 -->
      <Card :bordered="true" v-if="usageData.modelStats.length > 0">
        <template #header>
          <div class="oc-usage-section-header">
            <span>模型分布</span>
            <Button v-if="hasMoreModels" size="small" variant="text" @click="showAllModels = !showAllModels">
              {{ showAllModels ? '收起' : '展开全部' }}
              <template #icon>
                <component :is="showAllModels ? ChevronUpIcon : ChevronDownIcon" />
              </template>
            </Button>
          </div>
        </template>
        <div class="oc-usage-model-bars">
          <div v-for="m in displayedModelStats" :key="m.name" class="oc-usage-model-row">
            <div class="oc-usage-model-info">
              <span class="oc-usage-model-name">{{ m.name }}</span>
              <span class="oc-usage-model-tokens">{{ formatNumber(m.tokens) }}</span>
            </div>
            <div class="oc-usage-model-bar-track">
              <div class="oc-usage-model-bar" :style="{ width: (m.tokens / totalTokensForBar * 100) + '%' }"></div>
            </div>
          </div>
        </div>
      </Card>
    </template>
  </div>
</template>

