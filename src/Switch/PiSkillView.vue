<script setup>
import { ref, onMounted } from "vue";
import { Card, Empty, Tag, Button, Tooltip } from "tdesign-vue-next";
import { RefreshIcon, FolderOpen1Icon } from "tdesign-icons-vue-next";
import "./styles/PiSkillView.css";

const loading = ref(false);
const skills = ref([]);

const loadSkills = () => {
  loading.value = true;
  try {
    skills.value = window.services.getPiSkills();
  } catch (e) {
    console.error("加载 Pi Skills 失败:", e);
    skills.value = [];
  }
  setTimeout(() => { loading.value = false; }, 50);
};

const openPiSkillsDir = () => {
  try {
    window.services.openPiDir();
  } catch (e) {
    console.error("打开 Pi 目录失败:", e);
  }
};

const getDescription = (fm) => {
  if (!fm) return '';
  const m = fm.match(/description:\s*(.+)/);
  return m ? m[1].trim() : '';
};

const copySkillName = (name) => {
  try {
    navigator.clipboard.writeText(name);
  } catch {}
};

onMounted(loadSkills);
</script>

<template>
  <div class="pi-skill-container">
    <div class="pi-section-header">
      <span class="pi-skill-tip">Pi Agent 扩展包提供的 Skills — 通过 <code class="pi-hint-link" @click="openPiSkillsDir">pi config</code> 管理</span>
      <Button size="small" variant="outline" :loading="loading" @click="loadSkills">
        <template #icon><RefreshIcon /></template>
      </Button>
    </div>

    <div v-if="skills.length === 0" class="pi-empty-state">
      <Empty description="已安装的扩展中未发现 Skills" />
    </div>

    <div v-else class="pi-skill-list">
      <Card
        v-for="sk in skills"
        :key="sk.name + '@' + sk.package"
        :bordered="true"
        class="pi-skill-card"
        hover
      >
        <template #header>
          <div class="pi-skill-header-wrapper">
            <div class="pi-skill-header-left">
              <Tooltip content="点击复制名称" placement="top">
                <span class="pi-skill-name-link" @click.stop="copySkillName(sk.name)">{{ sk.name }}</span>
              </Tooltip>
              <Tag size="small" variant="outline">@{{ sk.package }}</Tag>
            </div>
          </div>
        </template>
        <div class="pi-skill-description">
          {{ getDescription(sk.frontmatter) || '暂无描述' }}
        </div>
        <div class="pi-skill-stats">
          <Tag size="small" variant="light" theme="success">可用</Tag>
        </div>
      </Card>
    </div>
  </div>
</template>
