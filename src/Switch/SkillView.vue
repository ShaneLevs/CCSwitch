<script setup>
import { ref, onMounted, computed } from "vue";
import { Card, Empty, Dialog, Input, Button, MessagePlugin, Loading, Switch, Popconfirm, Space, Tag, Tooltip } from "tdesign-vue-next";
import { DownloadIcon, DeleteIcon, FileExportIcon, FolderOpen1Icon } from "tdesign-icons-vue-next";
import { useSkillInstall } from "../composables/useSkillInstall";
import "./styles/SkillView.css";

const formatLastUsed = (timestamp) => {
  if (!timestamp) return "从未使用";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? "刚刚" : `${diffMinutes} 分钟前`;
    }
    return `${diffHours} 小时前`;
  } else if (diffDays === 1) return "昨天";
  else if (diffDays < 7) return `${diffDays} 天前`;
  else if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  else return date.toLocaleDateString("zh-CN");
};

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

const skills = ref([]);
const showDetailDialog = ref(false);
const selectedSkill = ref(null);

const loadSkills = () => {
  skills.value = window.services.getSkills();
};

const {
  showInstallDialog, installUrl, isFetchingInfo, isInstalling,
  installInfo, installProgress, pendingInstall, showOverwriteDialog,
  openInstallDialog, openInstallWithUrl, openExternal, openSkillsDir,
  confirmInstall, overwriteInstall, cancelInstall,
} = useSkillInstall(loadSkills);

const copySkillName = (skillName) => {
  try {
    window.utools.copyText(skillName);
    MessagePlugin.success("名称已复制");
  } catch { MessagePlugin.error("复制失败"); }
};

const openDetail = (skill) => {
  selectedSkill.value = skill;
  showDetailDialog.value = true;
};

defineExpose({ openInstallWithUrl });

const toggleSkill = (skill, enabled) => {
  let result;
  if (skill.scope === 'project') {
    result = enabled
      ? window.services.enableProjectSkill(skill.name, skill.projectPath)
      : window.services.disableProjectSkill(skill.name, skill.projectPath);
  } else {
    result = enabled
      ? window.services.enableSkill(skill.name)
      : window.services.disableSkill(skill.name);
  }
  if (result.success) {
    MessagePlugin.success(enabled ? `已启用 "${skill.name}"` : `已禁用 "${skill.name}"`);
    loadSkills();
  } else {
    MessagePlugin.error(result.error || (enabled ? "启用失败" : "禁用失败"));
  }
};

const deleteSkill = (skill) => {
  let result;
  if (skill.scope === 'project') {
    result = window.services.deleteProjectSkill(skill.name, skill.projectPath, skill.disabled);
  } else {
    result = window.services.deleteSkill(skill.name, skill.disabled);
  }
  if (result.success) {
    MessagePlugin.success(`已删除 "${skill.name}"`);
    loadSkills();
  } else {
    MessagePlugin.error(result.error || "删除失败");
  }
};

const showMoveDialog = ref(false);
const moveTarget = ref(null);
const moveToGlobal = (skill) => {
  moveTarget.value = skill;
  showMoveDialog.value = true;
};
const confirmMoveToGlobal = () => {
  if (!moveTarget.value) return;
  const result = window.services.moveProjectSkillToGlobal(moveTarget.value.name, moveTarget.value.projectPath);
  if (result.success) {
    MessagePlugin.success(`"${moveTarget.value.name}" 已转移到用户目录`);
    showMoveDialog.value = false;
    loadSkills();
  } else {
    MessagePlugin.error(result.error || "转移失败");
  }
};

const openSkillMd = (skill) => {
  const result = window.services.getSkillMdPath(skill.name, skill.scope, skill.projectPath, skill.disabled);
  if (result.success) {
    window.utools.shellOpenPath(result.path);
  } else {
    MessagePlugin.error(result.error || "无法打开 SKILL.md");
  }
};

const openProjectDir = (projectPath) => {
  window.services.openProjectSkillsDir(projectPath);
};

onMounted(() => loadSkills());
</script>

<template>
  <div class="skill-container">
    <div class="section-header">
      <span class="skill-tip">展示 <span class="hint-link" @click="openSkillsDir">~/.claude/skills</span> 及项目目录下的 SKILL</span>
      <Button size="small" theme="primary" @click="openInstallDialog">
        <template #icon><DownloadIcon /></template> 安装 Skill
      </Button>
    </div>

    <div v-if="!skills.length" class="empty-state">
      <Empty description="暂无 Skill 配置" />
    </div>

    <div v-else class="skill-list">
      <Card
        v-for="skill in skills"
        :key="(skill.scope === 'project' ? skill.projectPath + '/' : '') + skill.name + (skill.disabled ? '-disabled' : '')"
        :bordered="true"
        class="skill-card"
        :class="{ 'skill-card-disabled': skill.disabled }"
        hover
      >
        <template #header>
          <div class="skill-header-wrapper">
            <div class="skill-header-left">
              <Tooltip content="点击复制名称" placement="top">
                <span class="skill-name-link" @click.stop="copySkillName(skill.name)">{{ skill.name }}</span>
              </Tooltip>
              <Tooltip v-if="skill.scope === 'project'" :content="'项目: ' + skill.projectPath" placement="top">
                <Tag size="small" variant="light" theme="success" class="project-tag" @click.stop="openProjectDir(skill.projectPath)">{{ skill.projectName }}</Tag>
              </Tooltip>
            </div>
            <Space size="small">
              <Switch :value="!skill.disabled" @change="(val) => toggleSkill(skill, val)" />
              <Tooltip v-if="skill.scope === 'project'" content="转移到用户目录" placement="top">
                <Button size="small" theme="default" variant="text" :disabled="skill.disabled" @click.stop="moveToGlobal(skill)"><FileExportIcon /></Button>
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
          <Tag size="small" variant="light" theme="primary">使用 {{ skill.usageCount }} 次</Tag>
          <span class="skill-last-used">{{ formatLastUsed(skill.lastUsedAt) }}</span>
        </div>
      </Card>
    </div>

    <!-- 详情弹窗 -->
    <Dialog v-model:visible="showDetailDialog" width="600px" :footer="false">
      <template #header>
        <div class="detail-dialog-header">
          <span>{{ selectedSkill?.name || 'Skill 详情' }}</span>
          <Tooltip content="用编辑器打开 SKILL.md" placement="top">
            <Button size="small" variant="outline" @click="openSkillMd(selectedSkill)">
              <template #icon><FolderOpen1Icon style="font-size: 14px" /></template> SKILL.md
            </Button>
          </Tooltip>
        </div>
      </template>
      <div v-if="selectedSkill" class="skill-detail">
        <div class="detail-info-grid">
          <div class="detail-info-item"><span class="detail-info-label">名称</span><span class="detail-info-value">{{ selectedSkill.name }}</span></div>
          <div class="detail-info-item"><span class="detail-info-label">作用域</span><Tag size="small" :theme="selectedSkill.scope === 'project' ? 'success' : 'primary'" variant="light">{{ selectedSkill.scope === 'project' ? '项目' : '全局' }}</Tag></div>
          <div v-if="selectedSkill.scope === 'project'" class="detail-info-item"><span class="detail-info-label">所属项目</span><span class="detail-info-value">{{ selectedSkill.projectName }}</span></div>
          <div class="detail-info-item"><span class="detail-info-label">状态</span><Tag size="small" :theme="selectedSkill.disabled ? 'default' : 'success'" variant="light">{{ selectedSkill.disabled ? '已禁用' : '已启用' }}</Tag></div>
          <div class="detail-info-item"><span class="detail-info-label">文件数</span><span class="detail-info-value">{{ selectedSkill.fileCount || '-' }}</span></div>
          <div class="detail-info-item"><span class="detail-info-label">使用次数</span><span class="detail-info-value">{{ selectedSkill.usageCount || 0 }} 次</span></div>
          <div class="detail-info-item"><span class="detail-info-label">最近使用</span><span class="detail-info-value">{{ formatLastUsed(selectedSkill.lastUsedAt) }}</span></div>
        </div>
        <div v-if="parseFrontmatter(selectedSkill.frontmatter).description" class="detail-section">
          <div class="detail-section-title">描述</div>
          <div class="detail-desc">{{ parseFrontmatter(selectedSkill.frontmatter).description }}</div>
        </div>
        <div v-if="parseFrontmatter(selectedSkill.frontmatter).instructions" class="detail-section">
          <div class="detail-section-title">指令</div>
          <div class="detail-desc">{{ parseFrontmatter(selectedSkill.frontmatter).instructions }}</div>
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
        <div class="install-hint">手动安装请将 Skill 文件夹放到 <span class="hint-link" @click="openSkillsDir">~/.claude/skills</span> 目录下</div>
        <div v-if="installInfo" class="install-info-card">
          <div class="install-info-header">
            <span class="install-info-name">{{ installInfo.displayName }}</span>
            <Tag size="small" :theme="installInfo.source === 'skillhub' ? 'primary' : 'warning'" variant="light">{{ installInfo.source === 'skillhub' ? 'SkillHub' : '魔搭社区' }}</Tag>
            <span class="install-info-version">v{{ installInfo.version }}</span>
          </div>
          <div class="install-info-meta"><span>作者: {{ installInfo.author }}</span><span>下载: {{ installInfo.downloads }}</span></div>
          <div class="install-info-summary">{{ installInfo.summary }}</div>
          <div v-if="installProgress > 0 && installProgress < 100" class="install-progress"><Loading size="small" /><span>下载中... {{ installProgress }}%</span></div>
        </div>
      </div>
    </Dialog>

    <!-- 覆盖确认弹窗 -->
    <Dialog v-model:visible="showOverwriteDialog" header="Skill 已存在" width="400px" :confirm-btn="{ content: '覆盖安装', theme: 'primary' }" :cancel-btn="{ content: '取消' }" @confirm="overwriteInstall" @close="cancelInstall">
      <div class="overwrite-hint">Skill "{{ pendingInstall?.skillName }}" 已存在，是否覆盖安装？</div>
    </Dialog>

    <!-- 转移确认弹窗 -->
    <Dialog v-model:visible="showMoveDialog" header="转移到用户目录" width="400px" :confirm-btn="{ content: '确认转移', theme: 'primary' }" :cancel-btn="{ content: '取消' }" @confirm="confirmMoveToGlobal">
      <div class="move-hint">将 Skill "{{ moveTarget?.name }}" 从项目 <strong>{{ moveTarget?.projectName }}</strong> 转移到 <strong>~/.claude/skills</strong>？<br />转移后该项目下将不再保留此 Skill。</div>
    </Dialog>
  </div>
</template>
