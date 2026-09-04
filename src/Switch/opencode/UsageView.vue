<script setup>
// OpenCode 统计页：复用通用统计页（shared/UsagePage.vue），仅注入数据源与文案
import UsagePage from "../shared/UsagePage.vue";

const fetcher = () => window.services.readOpencodeUsage();
</script>

<template>
  <UsagePage
    tip="统计仅供参考 · 解析 opencode.db 中的 session tokens_* 列"
    :fetcher="fetcher"
    empty-description="暂无 OpenCode 用量数据"
    empty-hint="请确认 OpenCode 已在本地运行过，且 %LOCALAPPDATA%\opencode\opencode.db 存在"
  />
</template>
