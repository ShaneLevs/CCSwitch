<script setup>
import { ref, onMounted } from "vue";
import { Card, Empty, Button, Tag, Tooltip, Dialog, MessagePlugin } from "tdesign-vue-next";
import { RefreshIcon, FolderOpen1Icon } from "tdesign-icons-vue-next";
import "./styles/OpenCodeSkillView.css";

const skills = ref([]);
const loading = ref(false);
const showDetailDialog = ref(false);
const selectedSkill = ref(null);

const parseFrontmatter = (yamlStr) => {
  if (!yamlStr) return {};
  const result = {};
  const lines = yamlStr.split('\n');
  let currentKey = null;
  let currentValue = [];
  let isMultiline = false;
  let multilineType = null;
  for (const line of lines) {
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch && !isMultiline) {
      if (currentKey) result[currentKey] = currentValue.join('\n').trim();
      currentKey = keyMatch[1];
      const valuePart = keyMatch[2];
      if (valuePart === '>' || valuePart === '|') {
        isMultiline = true; multilineType = valuePart; currentValue = [];
      } else if (valuePart.startsWith('>') || valuePart.startsWith('|')) {
        isMultiline = true; multilineType = valuePart[0]; currentValue = [valuePart.slice(1).trim()];
      } else {
        currentValue = [valuePart];
      }
    } else if (isMultiline && currentKey) {
      if (line.match(/^\w+:\s/) && !line.startsWith(' ') && !line.startsWith('\t')) {
        result[currentKey] = multilineType === '>' ? currentValue.join(' ').trim() : currentValue.join('\n').trim();
        const newKeyMatch = line.match(/^(\w+):\s*(.*)$/);
        currentKey = newKeyMatch[1];
        const newValuePart = newKeyMatch[2];
        if (newValuePart === '>' || newValuePart === '|') {
          isMultiline = true; multilineType = newValuePart; currentValue = [];
        } else if (newValuePart.startsWith('>') || newValuePart.startsWith('|')) {
          isMultiline = true; multilineType = newValuePart[0]; currentValue = [newValuePart.slice(1).trim()];
        } else {
          isMultiline = false; currentValue = [newValuePart];
        }
      } else {
        currentValue.push(line.trim());
      }
    }
  }
  if (currentKey) {
    if (isMultiline && multilineType === '>') result[currentKey] = currentValue.join(' ').trim();
    else result[currentKey] = currentValue.join('\n').trim();
  }
  return result;
};

const loadSkills = () => {
  loading.value = true;
  try {
    skills.value = window.services.getOpencodeSkills();
  } catch (e) {
    console.error("加载 OpenCode skills 失败:", e);
    skills.value = [];
  }
  setTimeout(() => { loading.value = false; }, 50);
};

const openDir = () => {
  try {
    window.services.openOpencodeSkillsDir();
  } catch (e) {
    MessagePlugin.error('无法打开 skills 目录');
  }
};

const openDetail = (skill) => {
  selectedSkill.value = skill;
  showDetailDialog.value = true;
};

const openSkillMd = (skill) => {
  try {
    window.utools.shellOpenPath(skill.skillMdPath);
  } catch {
    MessagePlugin.error("无法打开 SKILL.md");
  }
};

onMounted(loadSkills);
</script>

<template>
  <div class="opencode-skill-container">
    <div class="section-header">
      <span class="opencode-skill-tip">
        展示 <span class="hint-link" @click="openDir">~/.config/opencode/skills</span> 下的 Skill
      </span>
      <Button size="small" variant="outline" :loading="loading" @click="loadSkills">
        <template #icon><RefreshIcon /></template> 刷新
      </Button>
    </div>

    <div v-if="skills.length === 0" class="empty-state">
      <Empty>
        <template #description>
          <span>目录 <span class="hint-link" @click="openDir">~/.config/opencode/skills</span> 不存在或为空</span>
        </template>
        <template #action>
          <Button size="small" theme="primary" @click="openDir">
            <template #icon><FolderOpen1Icon /></template> 创建并打开目录
          </Button>
        </template>
      </Empty>
    </div>

    <div v-else class="plugin-list">
      <Card
        v-for="skill in skills"
        :key="skill.name"
        :bordered="true"
        class="plugin-card"
        hover
      >
        <template #header>
          <div class="plugin-header-wrapper">
            <div class="plugin-header-left">
              <Tooltip content="点击查看详情" placement="top">
                <span class="plugin-name" @click="openDetail(skill)">{{ skill.name }}</span>
              </Tooltip>
            </div>
            <div>
              <Tooltip content="打开 SKILL.md" placement="top">
                <Button size="small" variant="text" @click.stop="openSkillMd(skill)">
                  <template #icon><FolderOpen1Icon /></template>
                </Button>
              </Tooltip>
            </div>
          </div>
        </template>
        <div @click="openDetail(skill)">
          {{ parseFrontmatter(skill.frontmatter).description || '暂无描述' }}
        </div>
        <div style="margin-top: 8px;">
          <Tag size="small" variant="light" theme="primary">{{ skill.fileCount }} 个文件</Tag>
        </div>
      </Card>
    </div>

    <Dialog v-model:visible="showDetailDialog" width="600px" :footer="false">
      <template #header>
        <div class="detail-dialog-header">
          <span>{{ selectedSkill?.name || 'Skill 详情' }}</span>
          <Button size="small" variant="outline" @click="openSkillMd(selectedSkill)">
            <template #icon><FolderOpen1Icon style="font-size: 14px" /></template> SKILL.md
          </Button>
        </div>
      </template>
      <div v-if="selectedSkill" class="skill-detail">
        <div class="detail-info-grid">
          <div class="detail-info-item"><span class="detail-info-label">名称</span><span class="detail-info-value">{{ selectedSkill.name }}</span></div>
          <div class="detail-info-item"><span class="detail-info-label">文件数</span><span class="detail-info-value">{{ selectedSkill.fileCount }}</span></div>
          <div class="detail-info-item"><span class="detail-info-label">路径</span><span class="detail-info-value mono" style="font-size:12px;word-break:break-all;">{{ selectedSkill.path }}</span></div>
        </div>
        <div v-if="parseFrontmatter(selectedSkill.frontmatter).description" class="detail-section">
          <div class="detail-section-title">描述</div>
          <div class="detail-desc">{{ parseFrontmatter(selectedSkill.frontmatter).description }}</div>
        </div>
      </div>
    </Dialog>
  </div>
</template>
