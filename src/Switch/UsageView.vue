<script setup>
import { ref, onMounted, nextTick, computed } from "vue";
import { Card, Statistic, Empty, Button } from "tdesign-vue-next";
import "./styles/UsageView.css";
import {
  RefreshIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  SumIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "tdesign-icons-vue-next";
import ContributionGrid from "./ContributionGrid.vue";

const loading = ref(false);
const showAllModels = ref(false);

const usageData = ref({
  summary: { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
  modelStats: [],
  contributions: [],
});

const stats = [
  { key: "total", title: "总 Tokens", icon: SumIcon, colorClass: "stat-green", iconColor: "#52c41a" },
  { key: "input", title: "输入 Tokens（包含缓存）", icon: ArrowUpIcon, colorClass: "stat-red", iconColor: "#f5222d" },
  { key: "output", title: "输出 Tokens", icon: ArrowDownIcon, colorClass: "stat-pink", iconColor: "#eb2f96" },
];

const displayLimit = 5;

const formatNumber = (num) => {
  const units = ["", "K", "M", "B", "T", "Q"];
  let tier = 0;
  while (num >= 1000 && tier < units.length - 1) {
    num /= 1000;
    tier++;
  }
  return tier === 0 ? num.toString() : num.toFixed(2) + units[tier];
};

const displayedModelStats = computed(() => {
  if (showAllModels.value) return usageData.value.modelStats;
  return usageData.value.modelStats.slice(0, displayLimit);
});

const hasMoreModels = computed(() => usageData.value.modelStats.length > displayLimit);

const getStatValue = (key) => {
  const data = usageData.value.summary;
  switch (key) {
    case "total": return data.totalTokens;
    case "input": return data.inputTokens;
    case "output": return data.outputTokens;
    default: return 0;
  }
};

// 初始加载：仅从持久化数据读取，不扫描 JSONL
const loadData = async () => {
  loading.value = true;
  await nextTick();
  setTimeout(() => {
    try {
      usageData.value = window.services.readPersistedUsage();
    } catch {
      // keep defaults
    }
    loading.value = false;
  }, 50);
};

// 刷新：全量扫描 JSONL 并更新持久化数据
const handleRefresh = async () => {
  loading.value = true;
  await nextTick();

  setTimeout(() => {
    try {
      const data = window.services.readClaudeUsage();
      usageData.value = {
        summary: {
          totalTokens: data.summary.totalTokens,
          inputTokens: data.summary.inputTokens,
          outputTokens: data.summary.outputTokens,
        },
        modelStats: data.modelStats,
        contributions: data.contributions,
      };
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
      <span class="usage-tip">统计仅供参考</span>
      <div class="usage-actions">
        <Button size="small" variant="outline" :loading="loading" @click="handleRefresh">
          <template #icon><RefreshIcon /></template>
          刷新数据
        </Button>
      </div>
    </div>

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
    <Card title="热力图">
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
              <span v-if="model.sessions" class="model-sessions">{{ model.sessions }} 次会话</span>
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
  </div>
</template>
