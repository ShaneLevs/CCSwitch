<script setup>
import { Empty } from "tdesign-vue-next";
</script>

<template>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:16px;">
    <Empty description="OpenCode 无 Skill 概念" />
    <div style="font-size:12px;color:var(--td-text-color-placeholder);max-width:360px;text-align:center;line-height:1.6;">
      Skill 是 Claude Code 专属的扩展机制；OpenCode 的等价机制是「扩展」（Plugins）。
    </div>
  </div>
</template>
