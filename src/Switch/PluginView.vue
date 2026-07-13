<script setup>
import { ref, onMounted, computed } from "vue";
import {
  Card,
  Empty,
  Button,
  Dialog,
  Input,
  MessagePlugin,
  Space,
  Tag,
  Popconfirm,
  Loading,
  RadioGroup,
  RadioButton,
  Tooltip,
  Switch,
} from "tdesign-vue-next";
import {
  AddIcon,
  DeleteIcon,
  RefreshIcon,
  DownloadIcon,
  FolderOpen1Icon,
  SearchIcon,
  BrowseIcon,
  StoreIcon,
} from "tdesign-icons-vue-next";
import "./styles/PluginView.css";

const activeTab = ref("installed"); // installed | browse | marketplace
const loading = ref(false);
const operationLoading = ref(null);

// ==================== Marketplace ====================
const marketplaces = ref([]);
const newMarketplaceSource = ref("");
const showAddDialog = ref(false);

const loadMarketplaces = () => {
  try {
    marketplaces.value = window.services.listMarketplaces();
  } catch (e) {
    console.error("加载 marketplace 失败:", e);
  }
};

const handleAddMarketplace = async () => {
  const source = newMarketplaceSource.value.trim();
  if (!source) return;
  operationLoading.value = "__marketplace_add";
  try {
    const result = window.services.addMarketplace(source);
    if (result.success) {
      MessagePlugin.success("仓库添加成功");
      newMarketplaceSource.value = "";
      showAddDialog.value = false;
      loadMarketplaces();
      loadMarketplacePlugins();
    } else {
      MessagePlugin.error(result.message || "添加失败");
    }
  } catch (e) {
    MessagePlugin.error("添加仓库失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const handleRemoveMarketplace = (name) => {
  operationLoading.value = `__mp_${name}`;
  try {
    const result = window.services.removeMarketplace(name);
    if (result.success) {
      MessagePlugin.success(`已移除仓库 "${name}"`);
      loadMarketplaces();
      loadMarketplacePlugins();
    } else {
      MessagePlugin.error(result.message || "移除失败");
    }
  } catch (e) {
    MessagePlugin.error("移除仓库失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const handleUpdateMarketplace = (name) => {
  operationLoading.value = `__mp_update_${name}`;
  try {
    const result = window.services.updateMarketplace(name);
    if (result.success) {
      MessagePlugin.success(`仓库 "${name}" 更新成功`);
      loadMarketplaces();
      loadMarketplacePlugins();
    } else {
      MessagePlugin.error(result.message || "更新失败");
    }
  } catch (e) {
    MessagePlugin.error("更新仓库失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

// ==================== Browse Marketplace Plugins ====================
const marketplacePlugins = ref([]);
const searchQuery = ref("");
const categoryFilter = ref("all");
const selectedPlugin = ref(null);
const showDetailDialog = ref(false);
const detailComponents = ref(null);

const openDetailDialog = (plugin) => {
  selectedPlugin.value = plugin;
  detailComponents.value = null;
  if (plugin?.pluginId) {
    try {
      detailComponents.value = window.services.getInstalledPluginComponents(
        plugin.installPath,
        plugin.name
      );
      console.log('[PluginView] installPath:', plugin.installPath, 'name:', plugin.name);
      console.log('[PluginView] detailComponents:', JSON.stringify(detailComponents.value));
    } catch (e) {
      console.error('[PluginView] getInstalledPluginComponents error:', e);
      detailComponents.value = null;
    }
  }
  showDetailDialog.value = true;
};
const componentBadges = [
  { key: "skills", label: "Skills", color: "#f5222d" },
  { key: "commands", label: "Commands", color: "#1890ff" },
  { key: "agents", label: "Agents", color: "#722ed1" },
  { key: "hooks", label: "Hooks", color: "#fa8c16" },
  { key: "mcpServers", label: "MCP", color: "#13c2c2" },
  { key: "lspServers", label: "LSP", color: "#52c41a" },
];

const hasComponent = (components, key) => {
  if (!components) return false;
  const arr = components[key];
  return Array.isArray(arr) && arr.length > 0;
};

const hasAnyComponent = (components) => {
  if (!components) return false;
  return componentBadges.some(b => hasComponent(components, b.key));
};

const loadMarketplacePlugins = () => {
  try {
    marketplacePlugins.value = window.services.listMarketplacePlugins();
  } catch (e) {
    console.error("加载 marketplace 插件失败:", e);
  }
};

const availableCategories = computed(() => {
  const cats = new Set();
  marketplacePlugins.value.forEach((p) => {
    if (p.category) cats.add(p.category);
  });
  return [...cats].sort();
});

const filteredPlugins = computed(() => {
  let plugins = marketplacePlugins.value;
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    plugins = plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(q))),
    );
  }
  if (categoryFilter.value !== "all") {
    plugins = plugins.filter((p) => p.category === categoryFilter.value);
  }
  return plugins;
});

// ==================== Installed Plugins ====================
const installedPlugins = ref([]);

// 将已安装插件与 marketplace 数据合并，补充描述/组件/标签
const enrichedInstalledPlugins = computed(() => {
  const marketMap = new Map();
  for (const p of marketplacePlugins.value) {
    marketMap.set(p.name, p);
  }

  return installedPlugins.value.map((p) => {
    const market = marketMap.get(p.name) || null;
    return {
      ...p,
      description: p.description || market?.description || "",
      author: market?.author || null,
      category: market?.category || null,
      tags: market?.tags || [],
      components: market?.components || {
        skills: [],
        commands: [],
        agents: [],
        hooks: [],
        mcpServers: [],
        lspServers: [],
      },
      homepage: market?.homepage || null,
    };
  });
});

const loadInstalledPlugins = () => {
  try {
    installedPlugins.value = window.services.listInstalledPlugins();
  } catch (e) {
    console.error("加载已安装插件失败:", e);
    installedPlugins.value = [];
  }
};

const getScopeLabel = (scope) => {
  const map = { user: "用户", project: "项目", local: "本地", managed: "托管" };
  return map[scope] || scope || "用户";
};

const getScopeTheme = (scope) => {
  const map = {
    user: "primary",
    project: "success",
    local: "warning",
    managed: "default",
  };
  return map[scope] || "primary";
};

const handleInstall = async (pluginName) => {
  operationLoading.value = pluginName;
  try {
    const result = window.services.installPlugin(pluginName, "user");
    if (result.success) {
      MessagePlugin.success(`插件 "${pluginName}" 安装成功`);
      await refreshAll();
    } else {
      MessagePlugin.error(result.message || "安装失败");
    }
  } catch (e) {
    MessagePlugin.error("安装插件失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const handleUninstall = async (plugin) => {
  const scope = plugin.scope || "user";
  const pluginId = plugin.pluginId || plugin.name;
  operationLoading.value = `__uninstall_${plugin.name}`;
  try {
    const result = window.services.uninstallPlugin(pluginId, scope);
    if (result.success) {
      MessagePlugin.success(`插件 "${plugin.name}" 已卸载`);
      loadInstalledPlugins();
    } else {
      MessagePlugin.error(result.message || "卸载失败");
    }
  } catch (e) {
    MessagePlugin.error("卸载插件失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const handleToggleEnabled = async (plugin) => {
  const scope = plugin.scope || "user";
  const pluginId = plugin.pluginId || plugin.name;
  const fn =
    plugin.enabled !== false
      ? window.services.disablePlugin
      : window.services.enablePlugin;

  operationLoading.value = `__toggle_${plugin.name}`;
  try {
    const result = fn(pluginId, scope);
    if (result.success) {
      MessagePlugin.success(
        plugin.enabled !== false
          ? `已禁用 "${plugin.name}"`
          : `已启用 "${plugin.name}"`,
      );
      plugin.enabled = plugin.enabled === false;
    } else {
      MessagePlugin.error(result.message || "操作失败");
    }
  } catch (e) {
    MessagePlugin.error("操作失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const handleUpdateInstalled = async (plugin) => {
  const scope = plugin.scope || "user";
  const pluginId = plugin.pluginId || plugin.name;
  operationLoading.value = `__update_${plugin.name}`;
  try {
    const result = window.services.updatePlugin(pluginId, scope);
    if (result.success) {
      MessagePlugin.success(`插件 "${plugin.name}" 更新成功`);
      loadInstalledPlugins();
    } else {
      MessagePlugin.error(result.message || "更新失败");
    }
  } catch (e) {
    MessagePlugin.error("更新插件失败: " + e.message);
  } finally {
    operationLoading.value = null;
  }
};

const formatRelativeTime = (ts) => {
  if (!ts) return "";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return ts;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString();
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    MessagePlugin.success(`已复制: ${text}`);
  } catch {
    MessagePlugin.error('复制失败');
  }
};

const formatSource = (source) => {
  if (!source) return "";
  if (typeof source === "string") return source;
  if (source.repo && source.source) return `${source.source}:${source.repo}`;
  if (source.repo) return source.repo;
  return JSON.stringify(source);
};

const handleOpenPluginsDir = () => {
  try {
    window.services.openPluginsDir();
  } catch (e) {
    MessagePlugin.error("打开目录失败");
  }
};

const refreshAll = async () => {
  loadMarketplaces();
  loadMarketplacePlugins();
  loadInstalledPlugins();
};

const handleRefresh = async () => {
  loading.value = true;
  await new Promise((r) => setTimeout(r, 50));
  try {
    refreshAll();
  } catch {
    /* ignore */
  }
  loading.value = false;
};

onMounted(() => {
  setTimeout(() => refreshAll(), 50);
});
</script>

<template>
  <div class="plugin-container">
    <div class="plugin-header">
      <span class="plugin-tip">
        管理 Claude Code 插件 —
        <span class="hint-link" @click="handleOpenPluginsDir"
          >~/.claude/plugins</span
        >
      </span>
      <div class="plugin-actions">
        <Tooltip content="刷新所有数据" placement="top">
          <Button
            size="small"
            variant="outline"
            :loading="loading"
            @click="handleRefresh"
          >
            <template #icon><RefreshIcon /></template>
            刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <!-- 子标签栏 -->
    <div class="plugin-tabs">
      <RadioGroup v-model="activeTab" size="small" variant="default-filled">
        <RadioButton value="installed">已安装</RadioButton>
        <RadioButton value="browse">浏览插件</RadioButton>
        <RadioButton value="marketplace">Marketplace</RadioButton>
      </RadioGroup>
      <span v-if="activeTab === 'installed'" class="section-count"
        >共 {{ installedPlugins.length }} 个插件</span
      >
      <span v-if="activeTab === 'marketplace'" class="section-count"
        >共 {{ marketplaces.length }} 个仓库</span
      >
    </div>

    <!-- ==================== Marketplace 管理 ==================== -->
    <template v-if="activeTab === 'marketplace'">
      <div class="section-header">
        <Tooltip content="添加新的 Marketplace 仓库" placement="top">
          <Button size="small" theme="primary" @click="showAddDialog = true">
            <template #icon><AddIcon /></template> 添加仓库
          </Button>
        </Tooltip>
      </div>

      <div v-if="marketplaces.length === 0" class="empty-state">
        <Empty description="暂无已注册的 Marketplace 仓库" />
      </div>

      <div v-else class="marketplace-list">
        <Card
          v-for="mp in marketplaces"
          :key="mp.name"
          :bordered="true"
          class="mp-card"
          hover
        >
          <template #header>
            <div class="mp-header">
              <span class="mp-name">{{ mp.name }}</span>
              <Space size="small">
                <Tag size="small" variant="light"
                  >{{ mp.pluginCount }} 个插件</Tag
                >
              </Space>
            </div>
          </template>
          <div class="mp-body">
            <div class="mp-info">
              <span class="mp-label">来源</span>
              <span class="mp-value">{{ formatSource(mp.source) }}</span>
            </div>
            <div class="mp-info">
              <span class="mp-label">本地路径</span>
              <span class="mp-value mono">{{ mp.installLocation }}</span>
            </div>
            <div v-if="mp.lastUpdated" class="mp-info">
              <span class="mp-label">最后更新</span>
              <span class="mp-value">{{
                new Date(mp.lastUpdated).toLocaleString()
              }}</span>
            </div>
          </div>
          <template #actions>
            <Space size="small">
              <Tooltip content="更新仓库元数据" placement="top">
                <Button
                  size="small"
                  variant="outline"
                  :loading="operationLoading === `__mp_update_${mp.name}`"
                  @click="handleUpdateMarketplace(mp.name)"
                >
                  <template #icon><RefreshIcon /></template> 更新
                </Button>
              </Tooltip>
              <Popconfirm
                theme="danger"
                :content="
                  '确认移除仓库 ' + mp.name + '？已安装的插件不受影响。'
                "
                @confirm="handleRemoveMarketplace(mp.name)"
              >
                <Tooltip
                  content="移除此仓库（已安装插件不受影响）"
                  placement="top"
                >
                  <Button
                    size="small"
                    theme="danger"
                    variant="outline"
                    :loading="operationLoading === `__mp_${mp.name}`"
                  >
                    <template #icon><DeleteIcon /></template> 移除
                  </Button>
                </Tooltip>
              </Popconfirm>
            </Space>
          </template>
        </Card>
      </div>
    </template>

    <!-- ==================== 浏览 Marketplace 插件 ==================== -->
    <template v-if="activeTab === 'browse'">
      <div class="browse-toolbar">
        <div class="search-row">
          <Input
            v-model="searchQuery"
            placeholder="搜索插件名称、描述或标签..."
            clearable
            class="search-input"
          >
            <template #prefix-icon><SearchIcon /></template>
          </Input>
        </div>
        <div class="filter-row">
          <div class="category-filters">
            <Button
              size="small"
              :theme="categoryFilter === 'all' ? 'primary' : 'default'"
              :variant="categoryFilter === 'all' ? 'base' : 'outline'"
              @click="categoryFilter = 'all'"
              >全部</Button
            >
            <Button
              v-for="cat in availableCategories"
              :key="cat"
              size="small"
              :theme="categoryFilter === cat ? 'primary' : 'default'"
              :variant="categoryFilter === cat ? 'base' : 'outline'"
              @click="categoryFilter = cat"
              >{{ cat }}</Button
            >
          </div>
        </div>
      </div>

      <div v-if="filteredPlugins.length === 0" class="empty-state">
        <Empty description="暂无插件" />
      </div>

      <div v-else class="plugin-grid">
        <div
          v-for="plugin in filteredPlugins"
          :key="`${plugin.marketplaceName}/${plugin.name}`"
          class="plugin-card-item"
          @click="openDetailDialog(plugin)"
        >
          <div class="plugin-card-header">
            <div class="plugin-card-title-row">
              <span class="plugin-card-name">{{ plugin.name }}</span>
              <span v-if="plugin.version" class="plugin-card-version">v{{ plugin.version }}</span>
              <span
                v-for="badge in componentBadges"
                :key="badge.key"
                v-show="hasComponent(plugin.components, badge.key)"
                class="component-badge"
                :style="{ background: badge.color + '18', color: badge.color, borderColor: badge.color + '40' }"
              >{{ badge.label }}</span>
            </div>
            <span v-if="plugin.author" class="plugin-card-author">{{ plugin.author.name || plugin.author }}</span>
          </div>
          <p class="plugin-card-desc">{{ plugin.description }}</p>
          <div class="plugin-card-tags">
            <Tag
              v-for="tag in (plugin.tags || []).slice(0, 5)"
              :key="tag"
              size="small"
              variant="light"
              >{{ tag }}</Tag
            >
          </div>
          <div class="plugin-card-footer">
            <span v-if="plugin.installCount" class="plugin-installs">{{ plugin.installCount }} 次安装</span>
            <span class="plugin-marketplace-tag">@{{ plugin.marketplaceName }}</span>
            <Tooltip content="安装此插件" placement="top">
              <Button
                size="small"
                theme="primary"
                variant="outline"
                :loading="operationLoading === plugin.name"
                @click.stop="handleInstall(plugin.name)"
              >
                <template #icon><DownloadIcon /></template>
                安装
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </template>

    <!-- ==================== 已安装插件 ==================== -->
    <template v-if="activeTab === 'installed'">
      <div v-if="installedPlugins.length === 0" class="empty-state">
        <Empty description="暂无已安装的插件" />
      </div>

      <div v-else class="installed-list">
        <Card
          v-for="plugin in enrichedInstalledPlugins"
          :key="plugin.pluginId || plugin.name"
          :bordered="true"
          class="installed-card"
          :class="{ 'plugin-disabled': plugin.enabled === false }"
          hover
          @click="openDetailDialog(plugin)"
        >
          <template #header>
            <div class="installed-header">
              <div class="installed-header-left">
                <span class="installed-name">{{ plugin.name }}</span>
                <span v-if="plugin.version" class="installed-version"
                  >v{{ plugin.version }}</span
                >
                <Tag
                  size="small"
                  :theme="getScopeTheme(plugin.scope)"
                  variant="light"
                >
                  {{ getScopeLabel(plugin.scope) }}
                </Tag>
                <Tag v-if="plugin.marketplace" size="small" variant="outline">{{
                  plugin.marketplace
                }}</Tag>
                <span
                  v-for="badge in componentBadges"
                  :key="badge.key"
                  v-show="hasComponent(plugin.components, badge.key)"
                  class="component-badge installed-badge"
                  :style="{
                    background: badge.color + '18',
                    color: badge.color,
                    borderColor: badge.color + '40',
                  }"
                  >{{ badge.label }}</span
                >
              </div>
              <Space size="small">
                <Tooltip
                  :content="
                    plugin.enabled !== false
                      ? '点击禁用此插件'
                      : '点击启用此插件'
                  "
                  placement="top"
                >
                  <Switch
                    :value="plugin.enabled !== false"
                    size="small"
                    @change="() => handleToggleEnabled(plugin)"
                    @click.stop
                  />
                </Tooltip>
                <Tooltip content="更新插件到最新版本" placement="top">
                  <Button
                    size="small"
                    variant="text"
                    :loading="operationLoading === `__update_${plugin.name}`"
                    @click.stop="handleUpdateInstalled(plugin)"
                  >
                    <template #icon><RefreshIcon /></template>
                  </Button>
                </Tooltip>
                <Popconfirm
                  theme="danger"
                  :content="'确认卸载插件 ' + plugin.name + '？'"
                  @confirm="handleUninstall(plugin)"
                >
                  <Tooltip content="卸载此插件" placement="top">
                    <Button
                      size="small"
                      theme="danger"
                      variant="text"
                      :loading="
                        operationLoading === `__uninstall_${plugin.name}`
                      "
                      @click.stop
                    >
                      <template #icon><DeleteIcon /></template>
                    </Button>
                  </Tooltip>
                </Popconfirm>
              </Space>
            </div>
          </template>
          <div class="installed-body">
            <p v-if="plugin.description" class="installed-desc">
              {{ plugin.description }}
            </p>
            <div class="installed-meta">
              <span
                v-if="plugin.installedAt"
                class="installed-meta-item"
                :title="new Date(plugin.installedAt).toLocaleString()"
              >
                安装于 {{ formatRelativeTime(plugin.installedAt) }}
              </span>
              <span
                v-if="
                  plugin.lastUpdated &&
                  plugin.lastUpdated !== plugin.installedAt
                "
                class="installed-meta-item"
                :title="new Date(plugin.lastUpdated).toLocaleString()"
              >
                更新于 {{ formatRelativeTime(plugin.lastUpdated) }}
              </span>
            </div>
            <div
              v-if="plugin.tags && plugin.tags.length"
              class="installed-tags"
            >
              <Tag
                v-for="tag in plugin.tags.slice(0, 4)"
                :key="tag"
                size="small"
                variant="light"
                >{{ tag }}</Tag
              >
            </div>
          </div>
        </Card>
      </div>
    </template>

    <!-- ==================== 添加仓库弹窗 ==================== -->
    <Dialog
      v-model:visible="showAddDialog"
      header="添加 Marketplace 仓库"
      width="480px"
      :confirm-btn="{
        content: '添加',
        loading: operationLoading === '__marketplace_add',
        theme: 'primary',
        disabled: !newMarketplaceSource.trim(),
      }"
      @confirm="handleAddMarketplace"
    >
      <div class="plugin-add-form">
        <div class="plugin-form-item">
          <label>仓库来源</label>
          <Input
            v-model="newMarketplaceSource"
            placeholder="GitHub URL 或 owner/repo 或 本地路径"
          />
        </div>
        <div class="plugin-form-hint">
          支持格式：<br />
          • <code>https://github.com/user/repo.git</code><br />
          • <code>owner/repo</code>（GitHub 简写）<br />
          • <code>/path/to/local/marketplace</code>（本地路径）
        </div>
      </div>
    </Dialog>

    <!-- ==================== 插件详情弹窗 ==================== -->
    <Dialog
      v-model:visible="showDetailDialog"
      header="插件详情"
      width="520px"
      :footer="false"
    >
      <div v-if="selectedPlugin" class="plugin-detail">
        <div class="plugin-detail-header">
          <div class="plugin-detail-title-row">
            <span class="plugin-detail-name">{{ selectedPlugin.name }}</span>
            <span v-if="selectedPlugin.version" class="plugin-detail-version">v{{ selectedPlugin.version }}</span>
            <span
              v-for="badge in componentBadges"
              :key="badge.key"
              v-show="hasComponent(selectedPlugin.components, badge.key)"
              class="component-badge"
              :style="{ background: badge.color + '18', color: badge.color, borderColor: badge.color + '40' }"
            >{{ badge.label }}</span>
          </div>
          <span v-if="selectedPlugin.author" class="plugin-detail-author">{{ selectedPlugin.author.name || selectedPlugin.author }}</span>
        </div>
        <p class="plugin-detail-desc">{{ selectedPlugin.description || '暂无描述' }}</p>
        <div v-if="selectedPlugin.tags && selectedPlugin.tags.length" class="plugin-detail-tags">
          <Tag v-for="tag in selectedPlugin.tags" :key="tag" size="small" variant="light">{{ tag }}</Tag>
        </div>
        <div v-if="hasAnyComponent(detailComponents || selectedPlugin.components)" class="plugin-detail-components">
          <template v-for="badge in componentBadges" :key="badge.key">
            <div v-if="hasComponent(detailComponents || selectedPlugin.components, badge.key)" class="plugin-detail-comp-row">
              <span class="plugin-detail-comp-label">{{ badge.label }}</span>
              <span class="plugin-detail-comp-items">
                <Tag v-for="name in (detailComponents || selectedPlugin.components)[badge.key]" :key="name" size="small" variant="outline" style="cursor: pointer;" @click="copyToClipboard(name)">{{ name }}</Tag>
              </span>
            </div>
          </template>
        </div>
        <div class="plugin-detail-meta">
          <div v-if="selectedPlugin.scope" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">范围</span>
            <Tag size="small" :theme="getScopeTheme(selectedPlugin.scope)" variant="light">{{ getScopeLabel(selectedPlugin.scope) }}</Tag>
          </div>
          <div v-if="selectedPlugin.pluginId" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">状态</span>
            <Tag size="small" :theme="selectedPlugin.enabled !== false ? 'success' : 'default'" variant="light">{{ selectedPlugin.enabled !== false ? '已启用' : '已禁用' }}</Tag>
          </div>
          <div v-if="selectedPlugin.installedAt" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">安装时间</span>
            <span class="plugin-detail-value">{{ new Date(selectedPlugin.installedAt).toLocaleString() }}</span>
          </div>
          <div v-if="selectedPlugin.lastUpdated && selectedPlugin.lastUpdated !== selectedPlugin.installedAt" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">更新时间</span>
            <span class="plugin-detail-value">{{ new Date(selectedPlugin.lastUpdated).toLocaleString() }}</span>
          </div>
          <div v-if="selectedPlugin.homepage" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">主页</span>
            <a :href="selectedPlugin.homepage" target="_blank" class="plugin-detail-link">{{ selectedPlugin.homepage }}</a>
          </div>
          <div v-if="selectedPlugin.marketplaceName" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">来源</span>
            <span class="plugin-detail-value">@{{ selectedPlugin.marketplaceName }}</span>
          </div>
          <div v-if="selectedPlugin.installCount" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">安装次数</span>
            <span class="plugin-detail-value">{{ selectedPlugin.installCount }}</span>
          </div>
          <div v-if="selectedPlugin.category" class="plugin-detail-meta-item">
            <span class="plugin-detail-label">分类</span>
            <span class="plugin-detail-value">{{ selectedPlugin.category }}</span>
          </div>
          <div v-if="selectedPlugin.strict" class="plugin-detail-meta-item">
            <Tag size="small" theme="warning" variant="light">严格模式</Tag>
          </div>
        </div>
        <div v-if="!selectedPlugin.pluginId" class="plugin-detail-actions">
          <Button
            theme="primary"
            :loading="operationLoading === selectedPlugin.name"
            @click="handleInstall(selectedPlugin.name); showDetailDialog = false"
          >
            <template #icon><DownloadIcon /></template>
            安装
          </Button>
        </div>
      </div>
    </Dialog>
  </div>
</template>
