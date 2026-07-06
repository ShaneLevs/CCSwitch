<script setup>
import { Empty } from "tdesign-vue-next";
</script>

<template>
  <div style="padding:40px 0;">
    <Empty description="OpenCode 无 Skill 概念">
      <template #action>
        <div style="font-size:12px;color:var(--td-text-color-placeholder);max-width:360px;text-align:center;line-height:1.6;margin-top:8px;">
          Skill 是 Claude Code 专属的扩展机制；OpenCode 的等价机制是「扩展」（Plugins）。
        </div>
      </template>
    </Empty>
  </div>
</template>
