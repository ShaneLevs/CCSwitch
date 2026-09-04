<script setup>
// Claude Code 统计页：复用通用统计页（shared/UsagePage.vue），仅注入数据源与文案
import UsagePage from "../shared/UsagePage.vue";

// DB 缓存优先；JSONL 读取失败时回退到历史持久化数据
const fetcher = (force) => {
  try {
    return window.services.readClaudeUsage(force);
  } catch (e) {
    return window.services.readPersistedUsage();
  }
};
</script>

<template>
  <UsagePage
    tip="统计仅供参考"
    :fetcher="fetcher"
    model-hint="同一会话可能使用多个模型，故各模型会话数之和可能大于总会话数"
    empty-description="暂无 Claude Code 使用数据"
  />
</template>
