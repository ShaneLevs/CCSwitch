<script setup>

import { ref, onMounted } from "vue";
import { Card, Empty, Button, Tag, Tooltip, Dialog, Input, Popconfirm, Space, Loading, MessagePlugin } from "tdesign-vue-next";
import { RefreshIcon, FolderOpen1Icon, DownloadIcon, DeleteIcon } from "tdesign-icons-vue-next";
import { useSkillInstall } from "../composables/useSkillInstall";
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

const {
  showInstallDialog, installUrl, isFetchingInfo, isInstalling,
  installInfo, installProgress, pendingInstall, showOverwriteDialog,
  openInstallDialog, openInstallWithUrl, openExternal, openSkillsDir,
  confirmInstall, overwriteInstall, cancelInstall,
} = useSkillInstall(loadSkills, {
  getSkillsPath: 'getOpencodeSkillsPath',
  installSkill: 'installOpencodeSkill',
  installSkillFromModelScope: 'installOpencodeSkillFromModelScope',
  completeSkillInstall: 'completeOpencodeSkillInstall',
  cancelSkillInstall: 'cancelOpencodeSkillInstall',
});

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

const copySkillName = (name) => {
  try {
    navigator.clipboard.writeText(name);
    MessagePlugin.success('已复制 Skill 名称');
  } catch {
    MessagePlugin.error('复制失败');
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

defineExpose({ openInstallWithUrl });

</script>

<template>
  <div class="skill-container">
    <div class="section-header">
      <span class="skill-tip">展示 <span class="hint-link" @click="openDir">~/.config/opencode/skills</span> 下的 Skill</span>
      <Space size="small">
        <Button size="small" theme="primary" @click="openInstallDialog">
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
      <Card
        v-for="skill in skills"
        :key="skill.name"
        :bordered="true"
        class="skill-card"
        hover
      >
        <template #header>
          <div class="skill-header-wrapper">
            <div class="skill-header-left">
              <Tooltip content="点击复制名称" placement="top">
                <span class="skill-name-link" @click.stop="copySkillName(skill.name)">{{ skill.name }}</span>
              </Tooltip>
            </div>
            <Space size="small">
              <Tooltip content="打开 SKILL.md" placement="top">
                <Button size="small" theme="default" variant="text" @click.stop="openSkillMd(skill)"><FolderOpen1Icon /></Button>
              </Tooltip>
              <Popconfirm theme="danger" content="删除后不可恢复，确认删除？" @confirm="deleteSkill(skill)">
                <Tooltip content="删除" placement="top">
                  <Button size="small" theme="danger" variant="text"><DeleteIcon /></Button>
                </Tooltip>
              </Popconfirm>
            </Space>
          </div>
        </template>
        <div class="skill-description" @click="openDetail(skill)">
          {{ parseFrontmatter(skill.frontmatter).description || '暂无描述' }}
        </div>
        <div class="skill-stats">
          <Tag size="small" variant="light" theme="primary">{{ skill.fileCount }} 个文件</Tag>
        </div>
      </Card>
    </div>

    <!-- 详情弹窗 -->
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

    <!-- 安装弹窗 -->
    <Dialog
      v-model:visible="showInstallDialog"
      header="安装 Skill"
      width="500px"
      :confirm-btn="{ content: '安装', loading: isInstalling, theme: 'primary', disabled: !installInfo }"
      @confirm="confirmInstall"
    >
      <div class="install-form">
        <div class="form-item"><label>Skill 链接</label><Input v-model="installUrl" placeholder="输入 Skill 详情页面链接" :disabled="isFetchingInfo || isInstalling" /></div>
        <div class="install-hint">支持从 <span class="hint-link" @click="openExternal('https://skillhub.tencent.com/skills')">SkillHub</span> 或 <span class="hint-link" @click="openExternal('https://www.modelscope.cn/skills')">魔搭社区</span> 安装 Skill，复制其地址粘贴到上方输入框</div>
        <div class="install-hint">手动安装请将 Skill 文件夹放到 <span class="hint-link" @click="openSkillsDir">~/.config/opencode/skills</span> 目录下</div>
        <div v-if="installInfo" class="install-info-card">
          <div class="install-info-header">
            <span class="install-info-name">{{ installInfo.displayName }}</span>
          </div>
          <div class="install-info-meta">
            <span>作者: {{ installInfo.author }}</span><span>下载: {{ installInfo.downloads }}</span>
            <Tag size="small" :theme="installInfo.source === 'skillhub' ? 'primary' : 'warning'" variant="light" class="install-info-source">{{ installInfo.source === 'skillhub' ? 'SkillHub' : '魔搭社区' }}</Tag>
            <span class="install-info-version">v{{ installInfo.version }}</span>
          </div>
          <div class="install-info-summary">{{ installInfo.summary }}</div>
          <div v-if="installProgress > 0 && installProgress < 100" class="install-progress"><Loading size="small" /><span>下载中... {{ installProgress }}%</span></div>
        </div>
      </div>
    </Dialog>

    <!-- 覆盖确认弹窗 -->
    <Dialog v-model:visible="showOverwriteDialog" header="Skill 已存在" width="400px" :confirm-btn="{ content: '覆盖安装', theme: 'primary' }" :cancel-btn="{ content: '取消' }" @confirm="overwriteInstall" @close="cancelInstall">
      <div class="overwrite-hint">Skill "{{ pendingInstall?.skillName }}" 已存在，是否覆盖安装？</div>
    </Dialog>
  </div>
</template>
