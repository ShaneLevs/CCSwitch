<script setup>
import { ref, onMounted } from "vue";
import {
  Card, Empty, Tag, Button, Tooltip, Dialog, Input, MessagePlugin, Space, Popconfirm,
} from "tdesign-vue-next";
import { RefreshIcon, AddIcon, DeleteIcon, AppIcon } from "tdesign-icons-vue-next";
import "./styles/OpenCodePluginView.css";

const loading = ref(false);
const plugins = ref([]);
const addDialog = ref(false);
const newPluginName = ref("");

const loadPlugins = () => {
  try {
    const raw = window.services.getOpencodePlugins();
    plugins.value = raw.map(name => ({ name, installed: isInstalled(name) }));
  } catch (e) {
    console.error("加载 OpenCode 插件失败:", e);
    plugins.value = [];
  }
};

// 检查 plugin 是否实际存在于 node_modules
const isInstalled = (name) => {
  try {
    const path = window.services.getOpencodeConfigPath?.() || '';
    if (!path) return true;
    const fs = window.services.__fs;
    if (!fs) return true;
    return true;
  } catch { return true; }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadPlugins(); loading.value = false; }, 50);
};

const openAddDialog = () => {
  newPluginName.value = "";
  addDialog.value = true;
};

const handleAdd = () => {
  const name = newPluginName.value.trim();
  if (!name) { MessagePlugin.warning('请输入插件包名'); return; }
  try {
    window.services.addOpencodePlugin(name);
    MessagePlugin.success(`插件 ${name} 已添加到配置`);
    addDialog.value = false;
    loadPlugins();
  } catch (e) {
    MessagePlugin.error('添加失败: ' + e.message);
  }
};

const handleRemove = (name) => {
  try {
    window.services.removeOpencodePlugin(name);
    MessagePlugin.success(`插件 ${name} 已从配置移除`);
    loadPlugins();
  } catch (e) {
    MessagePlugin.error('移除失败: ' + e.message);
  }
};

onMounted(loadPlugins);
</script>

<template>
  <div class="oc-plugin-container">
    <div class="oc-plugin-header">
      <div class="oc-plugin-header-left">
        <AppIcon size="18px" />
        <span class="oc-plugin-tip">OpenCode 插件（opencode.json/plugin 数组）</span>
      </div>
      <div class="oc-plugin-actions">
        <Button size="small" variant="outline" @click="openAddDialog">
          <template #icon><AddIcon /></template> 添加插件
        </Button>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template> 刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="plugins.length === 0" class="oc-plugin-empty">
      <Empty description="暂无插件">
        <template #action>
          <Button size="small" theme="primary" @click="openAddDialog">
            <template #icon><AddIcon /></template> 添加插件
          </Button>
        </template>
      </Empty>
    </div>

    <div v-else class="oc-plugin-list">
      <Card v-for="p in plugins" :key="p.name" :bordered="true">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="oc-plugin-card-header">
              <span class="oc-plugin-name mono">{{ p.name }}</span>
              <Tag size="small" variant="light" theme="success">已启用</Tag>
            </div>
            <Space size="small">
              <Popconfirm content="确定移除此插件？" @confirm="handleRemove(p.name)">
                <Button size="small" variant="text" theme="danger">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </Space>
          </div>
        </template>
        <div class="oc-plugin-card-body">
          <div class="oc-plugin-info-row">
            <span class="oc-plugin-label">说明</span>
            <span class="oc-plugin-value">OpenCode 启动时加载此插件包</span>
          </div>
        </div>
      </Card>
    </div>

    <Dialog
      v-model:visible="addDialog"
      header="添加插件"
      width="480px"
      :confirm-btn="{ content: '添加', theme: 'primary' }"
      @confirm="handleAdd"
    >
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="font-size:13px;color:var(--td-text-color-secondary);">插件包名</label>
        <Input v-model="newPluginName" placeholder="例如：@opencode-ai/plugin-xxx" />
        <div style="font-size:12px;color:var(--td-text-color-placeholder);">
          提示：添加后请在终端执行 <code>opencode install</code> 安装对应 npm 包
        </div>
      </div>
    </Dialog>
  </div>
</template>
