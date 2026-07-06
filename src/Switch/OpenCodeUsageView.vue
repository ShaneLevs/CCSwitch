<script setup>
import { Empty } from "tdesign-vue-next";
</script>

<template>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:16px;">
    <Empty description="OpenCode 暂无用量日志" />
    <div style="font-size:12px;color:var(--td-text-color-placeholder);max-width:380px;text-align:center;line-height:1.6;">
      OpenCode 是内存式 LLM launcher，不写入 JSONL/持久化会话文件。
      使用统计功能需要 OpenCode 官方导出用量接口或日志文件。
    </div>
  </div>
</template>
