<script setup>
import { ref, onMounted, watch, computed } from "vue";
import { Card, Empty, Dialog, Input, Button, MessagePlugin, Loading, Switch, Popconfirm, Space, Tag, Tooltip } from "tdesign-vue-next";
import { DownloadIcon, DeleteIcon, FileExportIcon, FolderOpen1Icon } from "tdesign-icons-vue-next";

// 格式化最近使用时间
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
  } else if (diffDays === 1) {
    return "昨天";
  } else if (diffDays < 7) {
    return `${diffDays} 天前`;
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} 周前`;
  } else {
    return date.toLocaleDateString("zh-CN");
  }
};

const skills = ref([]);
const showDetailDialog = ref(false);
const selectedSkill = ref(null);

// 安装相关状态
const showInstallDialog = ref(false);
const installUrl = ref("");
const isFetchingInfo = ref(false);
const isInstalling = ref(false);
const installInfo = ref(null);
const installProgress = ref(0);
const pendingInstall = ref(null);
const showOverwriteDialog = ref(false);

// 防抖定时器
let fetchTimer = null;

// 监听链接输入，自动查询
watch(installUrl, (newVal) => {
  // 清除之前的定时器
  if (fetchTimer) {
    clearTimeout(fetchTimer);
    fetchTimer = null;
  }

  // 链接变化时清空已有信息
  if (installInfo.value) {
    installInfo.value = null;
  }

  const result = extractSlug(newVal.trim());
  if (!result) return;

  // 如果是完整有效的 URL（指令触发），立即查询
  const isCompleteUrl = newVal.includes('skillhub.') || newVal.includes('modelscope.cn');
  if (isCompleteUrl) {
    doFetchSkillInfo(result);
  } else {
    // 用户手动输入时防抖 500ms
    fetchTimer = setTimeout(() => {
      doFetchSkillInfo(result);
    }, 500);
  }
});

// 解析 YAML frontmatter 提取字段（支持多行字符串）
const parseFrontmatter = (yamlStr) => {
  if (!yamlStr) return {};
  const result = {};
  const lines = yamlStr.split('\n');

  let currentKey = null;
  let currentValue = [];
  let isMultiline = false;
  let multilineType = null; // '>' 或 '|'

  for (const line of lines) {
    // 检测新键开始
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);

    if (keyMatch && !isMultiline) {
      // 保存上一个键值
      if (currentKey) {
        result[currentKey] = currentValue.join('\n').trim();
      }

      currentKey = keyMatch[1];
      const valuePart = keyMatch[2];

      // 检测多行字符串开始
      if (valuePart === '>' || valuePart === '|') {
        isMultiline = true;
        multilineType = valuePart;
        currentValue = [];
      } else if (valuePart.startsWith('>') || valuePart.startsWith('|')) {
        // 处理 >text 或 |text 的情况（同一行有内容）
        isMultiline = true;
        multilineType = valuePart[0];
        currentValue = [valuePart.slice(1).trim()];
      } else {
        // 单行值
        currentValue = [valuePart];
      }
    } else if (isMultiline && currentKey) {
      // 多行内容
      // 检测是否遇到新键（缩进为0且包含 :）
      if (line.match(/^\w+:\s/) && !line.startsWith(' ') && !line.startsWith('\t')) {
        // 保存当前多行值
        if (multilineType === '>') {
          // > 会把换行替换为空格
          result[currentKey] = currentValue.join(' ').trim();
        } else {
          // | 保留换行
          result[currentKey] = currentValue.join('\n').trim();
        }
        // 开始新键
        const newKeyMatch = line.match(/^(\w+):\s*(.*)$/);
        currentKey = newKeyMatch[1];
        const newValuePart = newKeyMatch[2];
        if (newValuePart === '>' || newValuePart === '|') {
          isMultiline = true;
          multilineType = newValuePart;
          currentValue = [];
        } else if (newValuePart.startsWith('>') || newValuePart.startsWith('|')) {
          isMultiline = true;
          multilineType = newValuePart[0];
          currentValue = [newValuePart.slice(1).trim()];
        } else {
          isMultiline = false;
          currentValue = [newValuePart];
        }
      } else {
        // 续行内容
        currentValue.push(line.trim());
      }
    }
  }

  // 保存最后一个键值
  if (currentKey) {
    if (isMultiline && multilineType === '>') {
      result[currentKey] = currentValue.join(' ').trim();
    } else if (isMultiline && multilineType === '|') {
      result[currentKey] = currentValue.join('\n').trim();
    } else {
      result[currentKey] = currentValue.join('\n').trim();
    }
  }

  return result;
};

const loadSkills = () => {
  skills.value = window.services.getSkills();
};

// 复制 skill 名称
const copySkillName = (skillName) => {
  try {
    window.utools.copyText(skillName);
    MessagePlugin.success("名称已复制");
  } catch (e) {
    MessagePlugin.error("复制失败");
  }
};

const openDetail = (skill) => {
  selectedSkill.value = skill;
  showDetailDialog.value = true;
};

const openInstallDialog = () => {
  installUrl.value = "";
  installInfo.value = null;
  pendingInstall.value = null;
  isFetchingInfo.value = false;
  isInstalling.value = false;
  showInstallDialog.value = true;
};

// 供父组件调用的方法，通过匹配指令打开安装
const openInstallWithUrl = (url) => {
  installUrl.value = url;
  installInfo.value = null;
  pendingInstall.value = null;
  isFetchingInfo.value = false;
  isInstalling.value = false;
  showInstallDialog.value = true;
  // 不需要手动调用查询，watch 会自动触发
};

defineExpose({
  openInstallWithUrl
});

const extractSlug = (url) => {
  // SkillHub: https://skillhub.tencent.com/skills/baidu-search 或 https://skillhub.cn/skills/baidu-search
  const skillhubMatch = url.match(/skillhub\.(tencent\.com|cn)\/skills\/([^/]+)/);
  if (skillhubMatch) {
    return { source: 'skillhub', slug: skillhubMatch[2] };
  }

  // 魔搭社区: https://www.modelscope.cn/skills/@MiniMax-AI/minimax-xlsx -> @MiniMax-AI/minimax-xlsx
  const modelscopeMatch = url.match(/modelscope\.cn\/skills\/(@?[^/]+\/[^/]+)/);
  if (modelscopeMatch) {
    return { source: 'modelscope', slug: modelscopeMatch[1] };
  }

  return null;
};

const openExternal = (url) => {
  window.utools.shellOpenExternal(url);
};

const openSkillsDir = () => {
  window.utools.shellOpenPath(window.services.getSkillsPath());
};

const openProjectDir = (projectPath) => {
  window.services.openProjectSkillsDir(projectPath);
};

const doFetchSkillInfo = async ({ source, slug }) => {
  isFetchingInfo.value = true;
  installInfo.value = null;
  try {
    if (source === 'skillhub') {
      const result = await window.services.fetchSkillInfo(slug);
      const info = result.data;
      installInfo.value = {
        source: 'skillhub',
        slug,
        displayName: info.skill?.displayName || slug,
        summary: info.skill?.summary_zh || info.skill?.summary || "暂无描述",
        version: info.latestVersion?.version || "unknown",
        downloads: info.skill?.stats?.downloads || 0,
        author: info.owner?.displayName || info.owner?.handle || "未知"
      };
    } else if (source === 'modelscope') {
      const result = await window.services.fetchModelScopeSkillInfo(slug);
      const info = result.data;
      installInfo.value = {
        source: 'modelscope',
        slug,
        displayName: info.DisplayName || info.Name || slug.split('/').pop(),
        summary: info.Description || "暂无描述",
        version: "master",
        downloads: info.DownloadCount || 0,
        author: info.Owner || info.SourceDeveloper || "未知"
      };
    }
  } catch (e) {
    MessagePlugin.error("获取 Skill 信息失败: " + e.message);
  } finally {
    isFetchingInfo.value = false;
  }
};

const fetchSkillInfo = async () => {
  const result = extractSlug(installUrl.value.trim());
  if (!result) {
    return MessagePlugin.error("请输入有效的 SkillHub 或魔搭社区链接");
  }
  await doFetchSkillInfo(result);
};

const confirmInstall = async () => {
  if (!installInfo.value) return;

  isInstalling.value = true;
  installProgress.value = 0;

  try {
    let result;
    if (installInfo.value.source === 'skillhub') {
      result = await window.services.installSkill(
        installInfo.value.slug,
        installInfo.value.version,
        (progress) => {
          installProgress.value = progress;
        }
      );
    } else if (installInfo.value.source === 'modelscope') {
      result = await window.services.installSkillFromModelScope(
        installInfo.value.slug,
        (progress) => {
          installProgress.value = progress;
        }
      );
    }

    pendingInstall.value = result;

    // 如果已存在，需要用户确认
    if (result.exists) {
      showInstallDialog.value = false;
      showOverwriteDialog.value = true;
    } else {
      // 直接完成安装
      window.services.completeSkillInstall(result.skillName, result.extractDir);
      MessagePlugin.success(`Skill "${result.skillName}" 安装成功`);
      showInstallDialog.value = false;
      loadSkills();
    }
  } catch (e) {
    MessagePlugin.error("安装失败: " + e.message);
    window.services.cancelSkillInstall();
  } finally {
    isInstalling.value = false;
  }
};

const overwriteInstall = () => {
  if (!pendingInstall.value) return;
  window.services.completeSkillInstall(
    pendingInstall.value.skillName,
    pendingInstall.value.extractDir
  );
  MessagePlugin.success(`Skill "${pendingInstall.value.skillName}" 已覆盖安装`);
  pendingInstall.value = null;
  showOverwriteDialog.value = false;
  loadSkills();
};

const cancelInstall = () => {
  if (pendingInstall.value) {
    window.services.cancelSkillInstall(pendingInstall.value.extractDir);
  }
  pendingInstall.value = null;
  showOverwriteDialog.value = false;
};

// 切换 Skill 状态
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

// 删除 Skill
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

// 转移项目级 Skill 到用户目录
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

// 打开 SKILL.md 文件
const openSkillMd = (skill) => {
  const result = window.services.getSkillMdPath(skill.name, skill.scope, skill.projectPath, skill.disabled);
  if (result.success) {
    window.utools.shellOpenPath(result.path);
  } else {
    MessagePlugin.error(result.error || "无法打开 SKILL.md");
  }
};

onMounted(() => {
  loadSkills();
});
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
                <span
                  class="skill-name-link"
                  @click.stop="copySkillName(skill.name)"
                >
                  {{ skill.name }}
                </span>
              </Tooltip>
              <Tooltip v-if="skill.scope === 'project'" :content="'项目: ' + skill.projectPath" placement="top">
                <Tag
                  size="small"
                  variant="light"
                  theme="success"
                  class="project-tag"
                  @click.stop="openProjectDir(skill.projectPath)"
                >
                  {{ skill.projectName }}
                </Tag>
              </Tooltip>
            </div>
            <Space size="small">
              <Switch
                :value="!skill.disabled"
                @change="(val) => toggleSkill(skill, val)"
              />
              <Tooltip v-if="skill.scope === 'project'" content="转移到用户目录" placement="top">
                <Button
                  size="small"
                  theme="default"
                  variant="text"
                  :disabled="skill.disabled"
                  @click.stop="moveToGlobal(skill)"
                >
                  <FileExportIcon />
                </Button>
              </Tooltip>
              <Popconfirm
                theme="danger"
                content="删除后不可恢复，确认删除？"
                @confirm="deleteSkill(skill)"
              >
                <Tooltip content="删除" placement="top">
                  <Button
                    size="small"
                    theme="danger"
                    variant="text"
                  >
                    <DeleteIcon />
                  </Button>
                </Tooltip>
              </Popconfirm>
            </Space>
          </div>
        </template>
        <div class="skill-description" @click="openDetail(skill)">
          {{ parseFrontmatter(skill.frontmatter).description || '暂无描述' }}
        </div>
        <div class="skill-stats">
          <Tag size="small" variant="light" theme="primary">
            使用 {{ skill.usageCount }} 次
          </Tag>
          <span class="skill-last-used">{{ formatLastUsed(skill.lastUsedAt) }}</span>
        </div>
      </Card>
    </div>

    <!-- 详情弹窗 -->
    <Dialog
      v-model:visible="showDetailDialog"
      width="600px"
      :footer="false"
    >
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
          <div class="detail-info-item">
            <span class="detail-info-label">名称</span>
            <span class="detail-info-value">{{ selectedSkill.name }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">作用域</span>
            <Tag size="small" :theme="selectedSkill.scope === 'project' ? 'success' : 'primary'" variant="light">
              {{ selectedSkill.scope === 'project' ? '项目' : '全局' }}
            </Tag>
          </div>
          <div v-if="selectedSkill.scope === 'project'" class="detail-info-item">
            <span class="detail-info-label">所属项目</span>
            <span class="detail-info-value">{{ selectedSkill.projectName }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">状态</span>
            <Tag size="small" :theme="selectedSkill.disabled ? 'default' : 'success'" variant="light">
              {{ selectedSkill.disabled ? '已禁用' : '已启用' }}
            </Tag>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">文件数</span>
            <span class="detail-info-value">{{ selectedSkill.fileCount || '-' }}</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">使用次数</span>
            <span class="detail-info-value">{{ selectedSkill.usageCount || 0 }} 次</span>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">最近使用</span>
            <span class="detail-info-value">{{ formatLastUsed(selectedSkill.lastUsedAt) }}</span>
          </div>
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
        <div class="form-item">
          <label>Skill 链接</label>
          <Input
            v-model="installUrl"
            placeholder="输入 Skill 详情页面链接"
            :disabled="isFetchingInfo || isInstalling"
          />
        </div>
        <div class="install-hint">
          支持从 <span class="hint-link" @click="openExternal('https://skillhub.tencent.com/skills')">SkillHub</span> 或 <span class="hint-link" @click="openExternal('https://www.modelscope.cn/skills')">魔搭社区</span> 安装 Skill，复制其地址粘贴到上方输入框
        </div>
        <div class="install-hint">
          手动安装请将 Skill 文件夹放到 <span class="hint-link" @click="openSkillsDir">~/.claude/skills</span> 目录下
        </div>

        <div v-if="installInfo" class="install-info-card">
          <div class="install-info-header">
            <span class="install-info-name">{{ installInfo.displayName }}</span>
            <Tag size="small" :theme="installInfo.source === 'skillhub' ? 'primary' : 'warning'" variant="light">
              {{ installInfo.source === 'skillhub' ? 'SkillHub' : '魔搭社区' }}
            </Tag>
            <span class="install-info-version">v{{ installInfo.version }}</span>
          </div>
          <div class="install-info-meta">
            <span>作者: {{ installInfo.author }}</span>
            <span>下载: {{ installInfo.downloads }}</span>
          </div>
          <div class="install-info-summary">{{ installInfo.summary }}</div>
          <div v-if="installProgress > 0 && installProgress < 100" class="install-progress">
            <Loading size="small" />
            <span>下载中... {{ installProgress }}%</span>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- 覆盖确认弹窗 -->
    <Dialog
      v-model:visible="showOverwriteDialog"
      header="Skill 已存在"
      width="400px"
      :confirm-btn="{ content: '覆盖安装', theme: 'primary' }"
      :cancel-btn="{ content: '取消' }"
      @confirm="overwriteInstall"
      @close="cancelInstall"
    >
      <div class="overwrite-hint">
        Skill "{{ pendingInstall?.skillName }}" 已存在，是否覆盖安装？
      </div>
    </Dialog>

    <!-- 转移确认弹窗 -->
    <Dialog
      v-model:visible="showMoveDialog"
      header="转移到用户目录"
      width="400px"
      :confirm-btn="{ content: '确认转移', theme: 'primary' }"
      :cancel-btn="{ content: '取消' }"
      @confirm="confirmMoveToGlobal"
    >
      <div class="move-hint">
        将 Skill "{{ moveTarget?.name }}" 从项目 <strong>{{ moveTarget?.projectName }}</strong> 转移到 <strong>~/.claude/skills</strong>？
        <br />转移后该项目下将不再保留此 Skill。
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.skill-container {
  padding: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  margin-top: -4px;
}

.skill-tip {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.empty-state {
  padding: 60px 0;
}

.skill-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.skill-card {
  margin-bottom: 0;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.skill-card:hover {
  box-shadow: var(--td-shadow-1);
}

.skill-card-disabled {
  opacity: 0.6;
}

.skill-card :deep(.t-card__header) {
  padding: 10px 16px 6px;
  border-bottom: none;
}

.skill-header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.skill-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.project-tag {
  cursor: pointer;
  flex-shrink: 0;
}

.skill-name-link {
  color: var(--td-brand-color);
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
}

.skill-name-link:hover {
  text-decoration: underline;
}

.skill-card :deep(.t-card__body) {
  padding: 0 16px 10px;
}

.skill-description {
  font-size: 13px;
  color: var(--td-text-color-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.skill-last-used {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

/* 安装弹窗样式 */
.install-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-form .form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-form label {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.install-hint {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  margin-top: 4px;
}

.hint-link {
  color: var(--td-brand-color);
  cursor: pointer;
  text-decoration: underline;
}

.install-info-card {
  margin-top: 12px;
  padding: 12px;
  background: var(--td-bg-color-container-hover);
  border-radius: var(--td-radius-medium);
}

.install-info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.install-info-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.install-info-version {
  font-size: 12px;
  padding: 2px 6px;
  background: var(--td-brand-color);
  color: #fff;
  border-radius: var(--td-radius-small);
}

.install-info-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  margin-bottom: 8px;
}

.install-info-summary {
  font-size: 13px;
  color: var(--td-text-color-secondary);
  line-height: 1.5;
}

.install-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--td-brand-color);
}

/* 覆盖确认弹窗 */
.overwrite-hint {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

/* 转移确认弹窗 */
.move-hint {
  font-size: 14px;
  color: var(--td-text-color-primary);
  line-height: 1.8;
}

/* 详情弹窗 */
.detail-dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.skill-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.detail-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-info-label {
  font-size: 13px;
  color: var(--td-text-color-placeholder);
  white-space: nowrap;
  min-width: 64px;
}

.detail-info-value {
  font-size: 13px;
  color: var(--td-text-color-primary);
  word-break: break-all;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
}

.detail-desc {
  font-size: 13px;
  color: var(--td-text-color-primary);
  line-height: 1.6;
}
</style>