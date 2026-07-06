<script setup>
import { ref, onMounted } from "vue";
import {
  Card, Empty, Button, Dialog, Input, MessagePlugin, Space, Tag, Popconfirm, Tooltip, Switch,
} from "tdesign-vue-next";
import { AddIcon, DeleteIcon, RefreshIcon, DownloadIcon, FolderOpen1Icon } from "tdesign-icons-vue-next";
import "./styles/PiPluginView.css";

const loading = ref(false);
const operationLoading = ref(null);
const installedExtensions = ref([]);
const showInstallDialog = ref(false);
const installSource = ref("");

const loadExtensions = () => {
  try {
    installedExtensions.value = window.services.getPiExtensions();
  } catch (e) {
    console.error("加载 Pi 扩展失败:", e);
    installedExtensions.value = [];
  }
};

const handleInstall = async () => {
  const src = installSource.value.trim();
  if (!src) return;
  operationLoading.value = "__install";
  try {
    const result = window.services.installPiExtension(src);
    if (result.success) {
      MessagePlugin.success(`扩展 "${src}" 安装成功`);
      installSource.value = "";
      showInstallDialog.value = false;
      loadExtensions();
    } else {
      MessagePlugin.error(result.message || "安装失败");
    }
  } catch (e) {
    MessagePlugin.error("安装扩展失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const handleUninstall = async (source) => {
  operationLoading.value = `__uninstall_${source}`;
  try {
    const result = window.services.uninstallPiExtension(source);
    if (result.success) {
      MessagePlugin.success("扩展已卸载");
      loadExtensions();
    } else {
      MessagePlugin.error(result.message || "卸载失败");
    }
  } catch (e) {
    MessagePlugin.error("卸载失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const resourceBadges = [
  { key: "extensions", label: "扩展", color: "#1890ff" },
  { key: "skills", label: "Skills", color: "#f5222d" },
  { key: "mcpServers", label: "MCP", color: "#13c2c2" },
];

const formatSource = (src) => src ? src.replace(/^npm:/, '') : '';

const openPiDir = () => {
  try { window.services.openPiDir(); } catch { MessagePlugin.error("打开目录失败"); }
};

const refreshAll = () => {
  loading.value = true;
  setTimeout(() => { loadExtensions(); loading.value = false; }, 50);
};

onMounted(refreshAll);
</script>

<template>
  <div class="pi-plugin-container">
    <div class="pi-plugin-header">
      <span class="pi-plugin-tip">
        管理 Pi Agent 扩展 —
        <span class="hint-link" @click="openPiDir">~/.pi/agent</span>
      </span>
      <div class="pi-plugin-actions">
        <Tooltip content="打开 pi 配置目录" placement="top">
          <Button size="small" variant="outline" @click="openPiDir">
            <template #icon><FolderOpen1Icon /></template> 配置目录
          </Button>
        </Tooltip>
        <Tooltip content="安装扩展" placement="top">
          <Button size="small" theme="primary" @click="showInstallDialog = true">
            <template #icon><AddIcon /></template> 安装扩展
          </Button>
        </Tooltip>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refreshAll">
            <template #icon><RefreshIcon /></template> 刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="installedExtensions.length === 0" class="pi-plugin-empty">
      <Empty description="暂无已安装的 Pi 扩展" />
    </div>

    <div v-else class="pi-plugin-list">
      <Card
        v-for="ext in installedExtensions"
        :key="ext.source"
        :bordered="true"
        class="pi-plugin-card"
      >
        <template #header>
          <div class="pi-plugin-card-header">
            <div class="pi-plugin-card-left">
              <span class="pi-plugin-name">{{ ext.name }}</span>
              <span v-if="ext.version" class="pi-plugin-version">v{{ ext.version }}</span>
              <Tag v-for="badge in resourceBadges" :key="badge.key"
                v-show="ext.resources[badge.key] && ext.resources[badge.key].length"
                size="small"
                :style="{
                  background: badge.color + '18', color: badge.color,
                  borderColor: badge.color + '40',
                }"
              >{{ badge.label }} {{ ext.resources[badge.key].length }}</Tag>
            </div>
            <Space size="small">
              <Popconfirm theme="danger" :content="'确认卸载扩展 ' + ext.name + '？'" @confirm="handleUninstall(ext.source)">
                <Tooltip content="卸载此扩展" placement="top">
                  <Button size="small" theme="danger" variant="text"
                    :loading="operationLoading === `__uninstall_${ext.source}`" @click.stop>
                    <template #icon><DeleteIcon /></template>
                  </Button>
                </Tooltip>
              </Popconfirm>
            </Space>
          </div>
        </template>
        <div class="pi-plugin-card-body">
          <p v-if="ext.description" class="pi-plugin-desc">{{ ext.description }}</p>
          <div class="pi-plugin-source">来源: {{ formatSource(ext.source) }}</div>
        </div>
      </Card>
    </div>

    <Dialog
      v-model:visible="showInstallDialog"
      header="安装 Pi 扩展"
      width="480px"
      :confirm-btn="{
        content: '安装',
        loading: operationLoading === '__install',
        theme: 'primary',
        disabled: !installSource.trim(),
      }"
      @confirm="handleInstall"
    >
      <div class="pi-install-form">
        <label>扩展来源</label>
        <Input v-model="installSource" placeholder="npm:package-name 或 git:github.com/user/repo" />
        <div class="pi-install-hint">
          支持格式：<br/>
          • <code>npm:package-name</code><br/>
          • <code>git:github.com/user/repo</code><br/>
          • <code>https://github.com/user/repo.git</code>
        </div>
      </div>
    </Dialog>
  </div>
</template>
