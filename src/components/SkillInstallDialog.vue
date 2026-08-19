<script setup>
import { Dialog, Input, Button, Tag, Loading } from "tdesign-vue-next";
import { useSkillInstall } from "../composables/useSkillInstall";

// 通用 Skill 安装弹窗（SkillHub / 魔搭社区）
// 用法：
//   <SkillInstallDialog
//     ref="d"
//     :service-config="{ getSkillsPath, installSkill, ... }"   // useSkillInstall 的 cfg
//     manual-dir-label="~/.claude/skills"                       // 手动安装目录文案
//     @installed="loadSkills"                                    // 安装/覆盖成功后刷新列表
//   />
//   父组件通过 ref 调用：
//     d.open()        打开空白安装弹窗（点「安装 Skill」按钮）
//     d.open(url)     带 URL 打开（URL 关键词触发）
//     d.openDir()     打开手动安装目录

const props = defineProps({
  serviceConfig: { type: Object, default: () => ({}) },
  manualDirLabel: { type: String, default: "~/.claude/skills" },
});

const emit = defineEmits(["installed"]);

const {
  showInstallDialog, installUrl, isFetchingInfo, isInstalling,
  installInfo, installProgress, pendingInstall, showOverwriteDialog,
  openInstallDialog, openInstallWithUrl, openExternal, openSkillsDir,
  confirmInstall, overwriteInstall, cancelInstall,
} = useSkillInstall(() => emit("installed"), props.serviceConfig);

const open = (url) => {
  if (url) openInstallWithUrl(url);
  else openInstallDialog();
};

const openDir = () => openSkillsDir();

defineExpose({ open, openInstallWithUrl, openDir });
</script>

<template>
  <Dialog
    v-model:visible="showInstallDialog"
    header="安装 Skill"
    width="500px"
    :confirm-btn="{ content: '安装', loading: isInstalling, theme: 'primary', disabled: !installInfo }"
    @confirm="confirmInstall"
  >
    <div class="install-form">
      <div class="skill-install-form-item"><label>Skill 链接</label><Input v-model="installUrl" placeholder="输入 Skill 详情页面链接" :disabled="isFetchingInfo || isInstalling" /></div>
      <div class="install-hint">支持从 <span class="hint-link" @click="openExternal('https://skillhub.cn/skills')">SkillHub</span> 或 <span class="hint-link" @click="openExternal('https://www.modelscope.cn/skills')">魔搭社区</span> 安装 Skill，复制其地址粘贴到上方输入框</div>
      <div class="install-hint">手动安装请将 Skill 文件夹放到 <span class="hint-link" @click="openDir">{{ manualDirLabel }}</span> 目录下</div>
      <div v-if="installInfo" class="install-info-card">
        <div class="install-info-header">
          <span class="install-info-name">{{ installInfo.displayName }}</span>
        </div>
        <div class="install-info-meta">
          <span>作者: {{ installInfo.author }}</span><span>下载: {{ installInfo.downloads }}</span>
          <Tag size="small" :theme="installInfo.source === 'skillhub' ? 'primary' : 'warning'" variant="light" class="install-info-source">{{ installInfo.source === 'skillhub' ? 'SkillHub' : '魔搭社区' }}</Tag>
          <span class="install-info-version">v{{ installInfo.version }}</span>
        </div>
        <div v-if="installInfo.tags?.length" class="install-info-tags">
          <Tag v-for="t in installInfo.tags" :key="t" size="small" variant="light" :theme="t === '需配置 API Key' ? 'warning' : 'default'" class="install-info-tag">{{ t }}</Tag>
        </div>
        <div class="install-info-summary">{{ installInfo.summary }}</div>
        <div v-if="installInfo.evaluation" class="install-eval">
          <div class="install-eval-header">
            <span class="install-eval-score">{{ installInfo.evaluation.total }}</span>
            <span class="install-eval-rating">{{ installInfo.evaluation.rating }}</span>
            <span class="install-eval-label">TRACE 评测</span>
          </div>
          <div class="install-eval-dims">
            <div v-for="d in Object.values(installInfo.evaluation.dimensions)" :key="d.key" class="install-eval-dim">
              <span class="install-eval-dim-label">{{ d.label }}</span>
              <div class="install-eval-dim-bar">
                <div class="install-eval-dim-fill" :style="{ width: (d.score / 5 * 100) + '%' }"></div>
              </div>
              <span class="install-eval-dim-score">{{ d.score.toFixed(1) }}</span>
            </div>
          </div>
          <div v-if="installInfo.evaluation.summary" class="install-eval-summary">{{ installInfo.evaluation.summary }}</div>
        </div>
        <div v-if="installProgress > 0 && installProgress < 100" class="install-progress"><Loading size="small" /><span>下载中... {{ installProgress }}%</span></div>
      </div>
    </div>
  </Dialog>

  <Dialog
    v-model:visible="showOverwriteDialog"
    header="Skill 已存在"
    width="400px"
    :confirm-btn="{ content: '覆盖安装', theme: 'primary' }"
    :cancel-btn="{ content: '取消' }"
    @confirm="overwriteInstall"
    @close="cancelInstall"
  >
    <div class="overwrite-hint">Skill "{{ pendingInstall?.skillName }}" 已存在，是否覆盖安装？</div>
  </Dialog>
</template>

<style scoped>
.install-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-form .skill-install-form-item {
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
  line-height: 20px;
  padding: 0 6px;
  background: var(--td-brand-color);
  color: var(--td-font-white-1);
  border-radius: var(--td-radius-small);
}

.install-info-source {
  margin-left: auto;
}

.install-info-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  margin-bottom: 8px;
}

.install-info-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.install-info-tag {
  margin: 0;
}

.install-info-summary {
  font-size: 13px;
  color: var(--td-text-color-secondary);
  line-height: 1.5;
}

.install-eval {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--td-bg-color-component);
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-component-stroke);
}

.install-eval-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.install-eval-score {
  font-size: 20px;
  font-weight: 700;
  color: var(--td-text-color-primary);
  line-height: 1;
}

.install-eval-rating {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color);
  color: var(--td-font-white-1);
}

.install-eval-label {
  margin-left: auto;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.install-eval-dims {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.install-eval-dim {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.install-eval-dim-label {
  width: 52px;
  flex-shrink: 0;
  color: var(--td-text-color-secondary);
}

.install-eval-dim-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--td-bg-color-container-hover);
  overflow: hidden;
}

.install-eval-dim-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--td-brand-color);
  transition: width 0.3s ease;
}

.install-eval-dim-score {
  width: 32px;
  flex-shrink: 0;
  text-align: right;
  color: var(--td-text-color-primary);
}

.install-eval-summary {
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.install-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--td-brand-color);
}

.overwrite-hint {
  font-size: 14px;
  color: var(--td-text-color-primary);
}
</style>
