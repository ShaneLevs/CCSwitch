<script setup>
import { ref, onMounted } from "vue";
import { Card, Empty, Tag, Button, Tooltip, Table } from "tdesign-vue-next";
import { RefreshIcon } from "tdesign-icons-vue-next";
import "./styles/PiSkillView.css";

const loading = ref(false);
const skills = ref([]);

const loadSkills = () => {
  try {
    skills.value = window.services.getPiSkills();
  } catch (e) {
    console.error("加载 Pi Skills 失败:", e);
    skills.value = [];
  }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadSkills(); loading.value = false; }, 50);
};

const getName = (fm) => {
  if (!fm) return '';
  const m = fm.match(/name:\s*(.+)/);
  return m ? m[1].trim() : '';
};

const getDescription = (fm) => {
  if (!fm) return '';
  const m = fm.match(/description:\s*(.+)/);
  return m ? m[1].trim() : '';
};

onMounted(loadSkills);
</script>

<template>
  <div class="pi-skill-container">
    <div class="pi-skill-header">
      <span class="pi-skill-tip">Pi Agent 扩展包提供的 Skills — 通过 <code>pi config</code> 管理启用/禁用</span>
      <Tooltip content="刷新" placement="top">
        <Button size="small" variant="outline" :loading="loading" @click="refresh">
          <template #icon><RefreshIcon /></template> 刷新
        </Button>
      </Tooltip>
    </div>

    <div v-if="skills.length === 0" class="pi-skill-empty">
      <Empty description="已安装的扩展中未发现 Skills" />
    </div>

    <div v-else class="pi-skill-list">
      <Card v-for="sk in skills" :key="sk.name" :bordered="true" class="pi-skill-card">
        <template #header>
          <div class="pi-skill-card-header">
            <span class="pi-skill-name">{{ sk.name }}</span>
            <Tag size="small" variant="outline">@{{ sk.package }}</Tag>
          </div>
        </template>
        <div class="pi-skill-card-body">
          <p v-if="getDescription(sk.frontmatter)" class="pi-skill-desc">{{ getDescription(sk.frontmatter) }}</p>
          <div v-if="getName(sk.frontmatter)" class="pi-skill-frontmatter-item">
            <span class="pi-skill-fm-label">标题</span>
            <span class="pi-skill-fm-value">{{ getName(sk.frontmatter) }}</span>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
