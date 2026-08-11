<script setup>

import { ref, onMounted } from "vue";
import {
  Empty, Button, Tag, Tooltip,
} from "tdesign-vue-next";
import { FolderOpenIcon, DownloadIcon } from "tdesign-icons-vue-next";
import SkillInstallDialog from "../../components/SkillInstallDialog.vue";
import SkillCard from "../../components/SkillCard.vue";
import "./styles/SkillView.css";

// 通用 Skill：读取 ~/.agents/skills 目录下的 Skill（SKILL.md 元数据），
// 支持从 SkillHub / 魔搭社区 通过链接安装（功能同 Claude Code，仅安装目录不同）

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

// 通用安装弹窗（SkillHub / 魔搭社区）
const installDialogRef = ref(null);
const SKILL_INSTALL_CONFIG = {
  getSkillsPath: 'getCommonSkillsPath',
  installSkill: 'installCommonSkill',
  installSkillFromModelScope: 'installCommonSkillFromModelScope',
  completeSkillInstall: 'completeCommonSkillInstall',
  cancelSkillInstall: 'cancelCommonSkillInstall',
};
const openInstallWithUrl = (url) => {
  installDialogRef.value?.open(url);
};

defineExpose({ openInstallWithUrl });

onMounted(loadSkills);
</script>

<template>
  <div class="common-skill-container">
    <div class="common-skill-header">
      <span class="common-skill-tip">
        通用 Skill — 读取 ~/.agents/skills 目录下的 Skill（跨 agent 共享）
      </span>
      <div class="common-skill-header-actions">
        <Button size="small" theme="primary" @click="installDialogRef?.open()">
          <template #icon><DownloadIcon /></template> 安装 Skill
        </Button>
        <Tooltip content="打开 Skill 目录" placement="top">
          <Button size="small" variant="outline" @click="installDialogRef?.openDir()">
            <template #icon><FolderOpenIcon /></template> 打开目录
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="loadError" class="common-skill-error">
      <t-alert :message="loadError" theme="error" show-icon />
    </div>

    <div v-if="skills.length === 0" class="common-skill-empty">
      <Empty description="~/.agents/skills 下还没有 Skill，可点击右上角「安装 Skill」或手动放入该目录后刷新" />
    </div>

    <div v-else class="common-skill-list">
      <SkillCard
        v-for="skill in skills"
        :key="skill.dirName"
        :name="skill.name"
        :clickable="false"
      >
        <template #header-extra>
          <Tag size="small" theme="success" variant="light">可用</Tag>
        </template>
        <template #description>{{ skill.description }}</template>
        <template #meta>
          <span class="common-skill-meta-item">目录: {{ skill.dirName }}</span>
        </template>
      </SkillCard>
    </div>

    <!-- 通用安装弹窗（SkillHub / 魔搭社区） -->
    <SkillInstallDialog
      ref="installDialogRef"
      :service-config="SKILL_INSTALL_CONFIG"
      manual-dir-label="~/.agents/skills"
      @installed="loadSkills"
    />
  </div>
</template>
