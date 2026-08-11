<script setup>

import { ref, onMounted } from "vue";
import { Empty, Button, Tag, Tooltip, Dialog, Popconfirm, Space, MessagePlugin } from "tdesign-vue-next";
import { RefreshIcon, FolderOpen1Icon, DownloadIcon, DeleteIcon } from "tdesign-icons-vue-next";
import SkillInstallDialog from "../../components/SkillInstallDialog.vue";
import SkillCard from "../../components/SkillCard.vue";
import "./styles/SkillView.css";

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
          isMultiline = true; multilineType = newValuePart[0]; currentValue = newValuePart.length > 1 ? [newValuePart.slice(1).trim()] : [];
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

// 通用安装弹窗（SkillHub / 魔搭社区）
const installDialogRef = ref(null);
const SKILL_INSTALL_CONFIG = {
  getSkillsPath: 'getOpencodeSkillsPath',
  installSkill: 'installOpencodeSkill',
  installSkillFromModelScope: 'installOpencodeSkillFromModelScope',
  completeSkillInstall: 'completeOpencodeSkillInstall',
  cancelSkillInstall: 'cancelOpencodeSkillInstall',
};
const openInstallWithUrl = (url) => {
  installDialogRef.value?.open(url);
};

defineExpose({ openInstallWithUrl });

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

const openSkillDir = (skill) => {
  try {
    window.utools.shellOpenPath(skill.path);
  } catch {
    MessagePlugin.error("无法打开 Skill 文件夹");
  }
};

const deleteSkill = (skill) => {
  const result = window.services.deleteOpencodeSkill(skill.name);
  if (result.success) {
    MessagePlugin.success(`已删除 "${skill.name}"`);
    loadSkills();
  } else {
    MessagePlugin.error(result.error || "删除失败");
  }
};

onMounted(loadSkills);


</script>

<template>
  <div class="skill-container">
    <div class="section-header">
      <span class="skill-tip">展示 <span class="hint-link" @click="openDir">~/.config/opencode/skills</span> 下的 Skill</span>
      <Space size="small">
        <Button size="small" theme="primary" @click="installDialogRef?.open()">
          <template #icon><DownloadIcon /></template> 安装 Skill
        </Button>
        <Button size="small" variant="outline" :loading="loading" @click="loadSkills">
          <template #icon><RefreshIcon /></template>
        </Button>
      </Space>
    </div>

    <div v-if="skills.length === 0" class="empty-state">
      <Empty description="暂无 Skill 配置">
        <template #action>
          <Button size="small" theme="primary" @click="openDir">
            <template #icon><FolderOpen1Icon /></template> 创建并打开目录
          </Button>
        </template>
      </Empty>
    </div>

    <div v-else class="skill-list">
      <SkillCard
        v-for="skill in skills"
        :key="skill.name"
        :name="skill.name"
        @detail="openDetail(skill)"
      >
        <template #actions>
          <Space size="small">
            <Tooltip content="打开 Skill 文件夹" placement="top">
              <Button size="small" theme="default" variant="text" @click.stop="openSkillDir(skill)"><FolderOpen1Icon /></Button>
            </Tooltip>
            <Popconfirm theme="danger" content="删除后不可恢复，确认删除？" @confirm="deleteSkill(skill)">
              <Tooltip content="删除" placement="top">
                <Button size="small" theme="danger" variant="text"><DeleteIcon /></Button>
              </Tooltip>
            </Popconfirm>
          </Space>
        </template>
        <template #description>{{ parseFrontmatter(skill.frontmatter).description || '暂无描述' }}</template>
        <template #meta>
          <Tag size="small" variant="light" theme="primary">{{ skill.fileCount }} 个文件</Tag>
        </template>
      </SkillCard>
    </div>

    <!-- 详情弹窗 -->
    <Dialog v-model:visible="showDetailDialog" width="600px" :footer="false">
      <template #header>
        <div class="detail-dialog-header">
          <span>{{ selectedSkill?.name || 'Skill 详情' }}</span>
          <Tooltip content="打开 Skill 文件夹" placement="top">
            <Button size="small" variant="outline" @click="openSkillDir(selectedSkill)">
              <template #icon><FolderOpen1Icon style="font-size: 14px" /></template> 文件夹
            </Button>
          </Tooltip>
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

    <!-- 通用安装弹窗（SkillHub / 魔搭社区） -->
    <SkillInstallDialog
      ref="installDialogRef"
      :service-config="SKILL_INSTALL_CONFIG"
      manual-dir-label="~/.config/opencode/skills"
      @installed="loadSkills"
    />
  </div>
</template>
