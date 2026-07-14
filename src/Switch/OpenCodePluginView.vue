<script setup>

import { ref, onMounted } from "vue";
import {
  Card, Empty, Tag, Button, Tooltip, Dialog, Input, MessagePlugin, Space, Popconfirm, Loading,
} from "tdesign-vue-next";
import { RefreshIcon, AddIcon, DeleteIcon, SearchIcon } from "tdesign-icons-vue-next";
import "./styles/OpenCodePluginView.css";

const loading = ref(false);
const plugins = ref([]);
const addDialog = ref(false);
const newPluginName = ref("");

const searchResults = ref([]);
const searching = ref(false);
const searchKey = ref("opencode-plugin");
const showSearch = ref(false);

const loadPlugins = () => {
  try {
    const raw = window.services.getOpencodePlugins();
    plugins.value = raw.map(name => ({ name }));
  } catch (e) {
    console.error("加载 OpenCode 插件失败:", e);
    plugins.value = [];
  }
};

const installedNames = new Set()

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadPlugins(); loading.value = false; }, 50);
};

const openAddDialog = () => {
  newPluginName.value = "";
  showSearch.value = false;
  searchResults.value = [];
  addDialog.value = true;
};

const installing = ref(false);

const handleAdd = async () => {
  const name = newPluginName.value.trim();
  if (!name) { MessagePlugin.warning('请输入插件包名'); return; }
  installing.value = true;
  try {
    await window.services.installOpencodePlugin(name);
    MessagePlugin.success(`插件 ${name} 安装成功`);
    addDialog.value = false;
    loadPlugins();
  } catch (e) {
    MessagePlugin.error('安装失败: ' + (e.stderr || e.message));
  } finally {
    installing.value = false;
  }
};

const handleRemove = async (name) => {
  try {
    await window.services.uninstallOpencodePlugin(name);
    MessagePlugin.success(`插件 ${name} 已卸载并移除`);
    loadPlugins();
  } catch (e) {
    MessagePlugin.error('卸载失败: ' + (e.stderr || e.message));
  }
};

const doSearch = async () => {
  if (!searchKey.value.trim()) return
  searching.value = true
  try {
    searchResults.value = await window.services.searchOpencodePlugins(searchKey.value.trim())
  } catch (e) {
    MessagePlugin.error('搜索失败: ' + e.message)
  } finally {
    searching.value = false
  }
}

const pickPlugin = (name) => {
  newPluginName.value = name
  searchResults.value = []
  showSearch.value = false
}

onMounted(loadPlugins);

</script>

<template>
  <div class="oc-plugin-container">
    <div class="oc-plugin-header">
      <div class="oc-plugin-header-left">
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
              <Tag size="small" variant="light" theme="success">已安装</Tag>
            </div>
            <Space size="small">
              <Popconfirm content="确定卸载此插件？" @confirm="handleRemove(p.name)">
                <Button size="small" variant="text" theme="danger">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </Space>
          </div>
        </template>
        <div class="oc-plugin-card-body">
          <div class="oc-plugin-info-row">
            <span class="oc-plugin-label">来源</span>
            <span class="oc-plugin-value">npm 包</span>
          </div>
        </div>
      </Card>
    </div>

    <Dialog
      v-model:visible="addDialog"
      header="安装插件"
      width="520px"
      dialogClassName="oc-install-dialog"
      :confirm-btn="{ content: installing ? '安装中...' : '安装', theme: 'primary', loading: installing }"
      :on-confirm="handleAdd"
    >
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="font-size:13px;color:var(--td-text-color-secondary);">npm 包名</label>
        <Input v-model="newPluginName" placeholder='例如：@tarquinen/opencode-dcp' :disabled="installing" />

        <div v-if="!showSearch" style="margin-top: 4px;">
          <Button size="small" variant="text" theme="primary" @click="showSearch = true; doSearch()">
            <template #icon><SearchIcon /></template> 搜索可用插件
          </Button>
        </div>

        <template v-if="showSearch">
          <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
            <Input v-model="searchKey" size="small" placeholder="搜索关键词" @keyup.enter="doSearch" />
            <Button size="small" variant="outline" :loading="searching" @click="doSearch">搜索</Button>
          </div>
          <div v-if="searching" style="text-align:center;padding:16px;"><Loading /></div>
          <div v-else-if="searchResults.length > 0" class="oc-search-list">
            <div
              v-for="pkg in searchResults"
              :key="pkg.name"
              class="oc-search-item"
              @click="pickPlugin(pkg.name)"
            >
              <div class="oc-search-item-name">{{ pkg.name }}
                <Tag size="small" variant="light" theme="primary" style="margin-left:6px;">{{ pkg.version }}</Tag>
              </div>
              <div class="oc-search-item-desc">{{ pkg.description || '暂无描述' }}</div>
            </div>
          </div>
          <div v-else-if="!searching" style="text-align:center;padding:16px;color:var(--td-text-color-placeholder);font-size:13px;">
            未找到匹配的插件
          </div>
        </template>

        <div style="font-size:12px;color:var(--td-text-color-placeholder);margin-top:4px;">
          自动执行 <code>npm install</code> 并写入 opencode.json/plugin
        </div>
      </div>
    </Dialog>
  </div>
</template>
