<script setup>
import { ref, onMounted, computed } from "vue";
import { Empty, Dialog, Button, MessagePlugin, Switch, Popconfirm, Space, Tag, Tooltip } from "tdesign-vue-next";
import { DownloadIcon, DeleteIcon, FileExportIcon, FolderOpen1Icon } from "tdesign-icons-vue-next";
import SkillInstallDialog from "../../components/SkillInstallDialog.vue";
import SkillCard from "../../components/SkillCard.vue";
import { formatLastUsed } from "../../utils/time";
import "./styles/SkillView.css";

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

// 通用安装弹窗（SkillHub / 魔搭社区），service 方法用 Claude 默认实现
const installDialogRef = ref(null);
const SKILL_INSTALL_CONFIG = {
  getSkillsPath: 'getSkillsPath',
  installSkill: 'installSkill',
  installSkillFromModelScope: 'installSkillFromModelScope',
  completeSkillInstall: 'completeSkillInstall',
  cancelSkillInstall: 'cancelSkillInstall',
};
const openInstallWithUrl = (url) => {
  installDialogRef.value?.open(url);
};

defineExpose({ openInstallWithUrl });

const openDetail = (skill) => {
  selectedSkill.value = skill;
  showDetailDialog.value = true;
};


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
    skill.disabled = !enabled;
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

const enabledSkills = computed(() => skills.value.filter(s => !s.disabled));
const disabledSkills = computed(() => skills.value.filter(s => s.disabled));

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

const openSkillDir = (skill) => {
  const result = window.services.getSkillDirPath(skill.name, skill.scope, skill.projectPath, skill.disabled);
  if (result.success) {
    window.utools.shellOpenPath(result.path);
  } else {
    MessagePlugin.error(result.error || "无法打开 Skill 文件夹");
  }
};

const openProjectDir = (projectPath) => {
  window.services.openProjectSkillsDir(projectPath);
};

onMounted(() => setTimeout(() => loadSkills(), 50));
</script>

<template>
  <div class="skill-container">
    <div class="section-header">
      <span class="skill-tip">展示 <span class="hint-link" @click="installDialogRef?.openDir()">~/.claude/skills</span> 及项目目录下的 SKILL</span>
      <Button size="small" theme="primary" @click="installDialogRef?.open()">
        <template #icon><DownloadIcon /></template> 安装 Skill
      </Button>
    </div>

    <div v-if="!skills.length" class="empty-state">
      <Empty description="暂无 Skill 配置" />
    </div>

    <div v-else class="skill-list">
      <!-- 已启用 -->
      <SkillCard
        v-for="skill in enabledSkills"
        :key="(skill.scope === 'project' ? skill.projectPath + '/' : '') + skill.name"
        :name="skill.name"
        @detail="openDetail(skill)"
      >
        <template #header-extra>
          <Tooltip v-if="skill.scope === 'project'" :content="'项目: ' + skill.projectPath" placement="top">
            <Tag size="small" variant="light" theme="success" class="project-tag" @click.stop="openProjectDir(skill.projectPath)">{{ skill.projectName }}</Tag>
          </Tooltip>
        </template>
        <template #actions>
          <Space size="small">
            <Switch :value="true" @change="(val) => toggleSkill(skill, val)" />
            <Tooltip v-if="skill.scope === 'project'" content="转移到用户目录" placement="top">
              <Button size="small" theme="default" variant="text" @click.stop="moveToGlobal(skill)"><FileExportIcon /></Button>
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
          <Tag size="small" variant="light" theme="primary">使用 {{ skill.usageCount }} 次</Tag>
          <span class="skill-last-used">{{ formatLastUsed(skill.lastUsedAt) }}</span>
        </template>
      </SkillCard>

      <!-- 已禁用分组 -->
      <template v-if="disabledSkills.length > 0">
        <div class="skill-section-divider">
          <span class="skill-section-label">已禁用 ({{ disabledSkills.length }})</span>
        </div>
        <SkillCard
          v-for="skill in disabledSkills"
          :key="(skill.scope === 'project' ? skill.projectPath + '/' : '') + skill.name + '-disabled'"
          :name="skill.name"
          disabled
          @detail="openDetail(skill)"
        >
          <template #header-extra>
            <Tooltip v-if="skill.scope === 'project'" :content="'项目: ' + skill.projectPath" placement="top">
              <Tag size="small" variant="light" theme="success" class="project-tag" @click.stop="openProjectDir(skill.projectPath)">{{ skill.projectName }}</Tag>
            </Tooltip>
          </template>
          <template #actions>
            <Space size="small">
              <Switch :value="false" @change="(val) => toggleSkill(skill, val)" />
              <Tooltip v-if="skill.scope === 'project'" content="转移到用户目录" placement="top">
                <Button size="small" theme="default" variant="text" :disabled="true" @click.stop="moveToGlobal(skill)"><FileExportIcon /></Button>
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
            <Tag size="small" variant="light" theme="primary">使用 {{ skill.usageCount }} 次</Tag>
            <span class="skill-last-used">{{ formatLastUsed(skill.lastUsedAt) }}</span>
          </template>
        </SkillCard>
      </template>
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

    <!-- 通用安装弹窗（SkillHub / 魔搭社区） -->
    <SkillInstallDialog
      ref="installDialogRef"
      :service-config="SKILL_INSTALL_CONFIG"
      manual-dir-label="~/.claude/skills"
      @installed="loadSkills"
    />

    <!-- 转移确认弹窗 -->
    <Dialog v-model:visible="showMoveDialog" header="转移到用户目录" width="400px" :confirm-btn="{ content: '确认转移', theme: 'primary' }" :cancel-btn="{ content: '取消' }" @confirm="confirmMoveToGlobal">
      <div class="move-hint">将 Skill "{{ moveTarget?.name }}" 从项目 <strong>{{ moveTarget?.projectName }}</strong> 转移到 <strong>~/.claude/skills</strong>？<br />转移后该项目下将不再保留此 Skill。</div>
    </Dialog>
  </div>
</template>
