<script setup>

import { ref, onMounted } from "vue";
import {
  Empty, Button, Tag, Tooltip, Alert as TAlert,
} from "tdesign-vue-next";
import { FolderOpenIcon } from "tdesign-icons-vue-next";
import "./styles/SkillView.css";

// 通用 Skill：只读展示 ~/.agents/skills 目录下的 Skill（SKILL.md 元数据）

const skills = ref([]);
const loadError = ref("");

const loadSkills = () => {
  try {
    skills.value = window.services.readCommonSkills();
    loadError.value = "";
  } catch (e) {
    console.error("加载通用 Skill 失败:", e);
    skills.value = [];
    loadError.value = e.message || "读取失败";
  }
};

const openDir = () => {
  try { window.services.openCommonSkillsDir(); } catch { /* ignore */ }
};

onMounted(loadSkills);
</script>

<template>
  <div class="common-skill-container">
    <div class="common-skill-header">
      <span class="common-skill-tip">
        通用 Skill — 读取 ~/.agents/skills 目录下的 Skill（只读，跨 agent 共享）
      </span>
      <Tooltip content="打开 Skill 目录" placement="top">
        <Button size="small" variant="outline" @click="openDir">
          <template #icon><FolderOpenIcon /></template> 打开目录
        </Button>
      </Tooltip>
    </div>

    <div v-if="loadError" class="common-skill-error">
      <t-alert :message="loadError" theme="error" show-icon />
    </div>

    <div v-if="skills.length === 0" class="common-skill-empty">
      <Empty description="~/.agents/skills 下还没有 Skill，将 Skill 文件夹放入该目录后刷新即可" />
    </div>

    <div v-else class="common-skill-list">
      <div v-for="skill in skills" :key="skill.dirName" class="common-skill-card">
        <div class="common-skill-card-main">
          <div class="common-skill-card-title">
            <span class="common-skill-name">{{ skill.name }}</span>
            <Tag size="small" theme="success" variant="light">可用</Tag>
          </div>
          <div v-if="skill.description" class="common-skill-summary">{{ skill.description }}</div>
          <div class="common-skill-meta">
            <span class="common-skill-meta-item">目录: {{ skill.dirName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
