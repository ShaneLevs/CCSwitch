<script setup>
import { Empty } from "tdesign-vue-next";
import { BarChartIcon } from "tdesign-icons-vue-next";
</script>

<template>
  <div style="padding:40px 0;">
    <Empty
      icon="<BarChartIcon />"
      description="OpenCode v1 暂无会话用量日志，不支持使用统计"
    >
      <template #action>
        <div style="font-size:12px;color:var(--td-text-color-placeholder);max-width:360px;text-align:center;line-height:1.6;margin-top:8px;">
          OpenCode 是内存式 LLM launcher，不写入 JSONL/持久化会话文件。
          使用统计功能需要 OpenCode 官方导出用量接口或日志文件。
        </div>
      </template>
    </Empty>
  </div>
</template>
