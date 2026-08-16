<script setup>

import { ref, computed, onMounted } from "vue";
import {
  Empty, Button, Tag, Space, Tooltip, MessagePlugin, Popconfirm,
  Dropdown, DropdownMenu, DropdownItem, DialogPlugin,
  RadioGroup, RadioButton,
} from "tdesign-vue-next";
import {
  RefreshIcon, AddIcon, MoreIcon, ToolsIcon, EditIcon, DeleteIcon,
} from "tdesign-icons-vue-next";
import McpToolDrawer from "../../components/McpToolDrawer.vue";
import McpServerDialog from "../../components/McpServerDialog.vue";
import McpServerCard from "../../components/McpServerCard.vue";
import "./styles/McpView.css";

// 通用 MCP 库：本地 (~/.mcp.json) 与云端 (uTools DB) 合并为单一列表
//   - 每条卡片用 tag 标注来源（本地 / 云端，可同时存在）
//   - 顶部按钮组可按 全部/本地/云端 快速筛选
//   - 删除 = 两端同时删除；三点菜单按归属差异化：仅本地→「本地到云端」、
//     仅云端→「云端到本地」、双端→「移除本地/移除云端」
//   - 添加/编辑弹窗内可选择保存目标端

const loading = ref(false);

// 来源筛选：all | local | cloud
const filterType = ref('all');

// 筛选后的展示列表
const filteredServers = computed(() => {
  if (filterType.value === 'local') return mergedServers.value.filter((s) => s.hasLocal);
  if (filterType.value === 'cloud') return mergedServers.value.filter((s) => s.hasCloud);
  return mergedServers.value;
});

// 两个存储端
const localServers = ref([]);
const cloudServers = ref([]);

// MCP 添加/编辑弹窗（通用组件）
const mcpDialogRef = ref(null);
const openCreateDialog = () => {
  mcpDialogRef.value?.open('create', '', null, 'local');
};
const openEditDialog = (item) => {
  const target = item.hasLocal ? 'local' : 'cloud';
  mcpDialogRef.value?.open('edit', item.name, item[target].config, target);
};
const handleSaveMcp = ({ mode, name, config, target }) => {
  try {
    if (target === 'local') {
      window.services.upsertLocalMcpServer(name, config);
    } else {
      window.services.upsertCommonMcpServer(name, config);
    }
    MessagePlugin.success(`${target === 'local' ? '本地' : '云端'}服务器 ${name} ${mode === 'create' ? '已添加' : '已更新'}`);
    mcpDialogRef.value?.close();
    loadServers();
  } catch (e) {
    MessagePlugin.error('保存失败: ' + e.message);
  }
};

// 合并列表：以名称为键合并两端，同名的本地/云端并列展示
const mergedServers = computed(() => {
  const map = new Map();
  for (const s of localServers.value) {
    map.set(s.name, { name: s.name, local: s, cloud: null });
  }
  for (const s of cloudServers.value) {
    const ex = map.get(s.name);
    if (ex) ex.cloud = s;
    else map.set(s.name, { name: s.name, local: null, cloud: s });
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      hasLocal: !!item.local,
      hasCloud: !!item.cloud,
      // 生效配置：本地优先（本地是 agent 实际读取的）
      config: (item.local || item.cloud).config,
      diff: !!item.local && !!item.cloud
        && JSON.stringify(item.local.config) !== JSON.stringify(item.cloud.config),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// 工具抽屉
const showToolDrawer = ref(false);
const toolServerName = ref('');
const toolServerConfig = ref(null);

const targetLabel = (t) => (t === 'local' ? '本地' : '云端');

const loadServers = () => {
  try {
    localServers.value = Object.entries(window.services.getLocalMcpServers() || {}).map(([name, config]) => ({ name, config }));
  } catch (e) {
    console.error("加载本地 MCP 服务器失败:", e);
    localServers.value = [];
  }
  try {
    cloudServers.value = Object.entries(window.services.getCommonMcpServers() || {}).map(([name, config]) => ({ name, config }));
  } catch (e) {
    console.error("加载云端 MCP 服务器失败:", e);
    cloudServers.value = [];
  }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadServers(); loading.value = false; }, 50);
};

// 删除 = 两端同时删除
const deleteBoth = (item) => {
  const removed = [];
  try {
    if (item.hasLocal) {
      window.services.deleteLocalMcpServer(item.name);
      removed.push('本地');
    }
    if (item.hasCloud) {
      window.services.deleteCommonMcpServer(item.name);
      removed.push('云端');
    }
    if (removed.length === 0) { MessagePlugin.warning('未找到该服务器'); return; }
    MessagePlugin.success(`已删除 ${item.name}（${removed.join('、')}）`);
    loadServers();
  } catch (e) {
    MessagePlugin.error('删除失败: ' + e.message);
  }
};

// 单端移除（仅删某一端副本）
const removeSide = (item, side) => {
  try {
    if (side === 'local') {
      window.services.deleteLocalMcpServer(item.name);
    } else {
      window.services.deleteCommonMcpServer(item.name);
    }
    MessagePlugin.success(`已移除${targetLabel(side)}副本 ${item.name}`);
    loadServers();
  } catch (e) {
    MessagePlugin.error('移除失败: ' + e.message);
  }
};
const confirmRemoveSide = (item, side) => {
  // TDesign v1.20.3 的 DialogPlugin.confirm 不会在 onConfirm 后自动关闭，
  // 需用返回的实例手动 destroy（否则弹窗会一直挂着）
  const dialog = DialogPlugin.confirm({
    header: '移除确认',
    body: `确定移除「${item.name}」的${targetLabel(side)}副本吗？（${targetLabel(side === 'local' ? 'cloud' : 'local')}端保留）`,
    confirmBtn: '移除',
    cancelBtn: '取消',
    onConfirm: () => {
      removeSide(item, side);
      dialog.destroy();
    },
  });
};

// 单端复制：source 为源端（local → 复制到云端；cloud → 复制到本地），同名覆盖目标端
const copyFrom = (item, source) => {
  const dest = source === 'local' ? 'cloud' : 'local';
  try {
    window.services.copyCommonMcpServer(item.name, dest);
    MessagePlugin.success(`已复制 "${item.name}" ${targetLabel(source)} → ${targetLabel(dest)}`);
    loadServers();
  } catch (e) {
    MessagePlugin.error('复制失败: ' + e.message);
  }
};

// 卡片上的配置摘要（单行，与 Claude MCP 卡片风格一致）
const getConfigSummary = (config) => {
  const parts = [];
  if (config.command) parts.push(`cmd: ${config.command}`);
  if (config.url) parts.push(`url: ${config.url}`);
  if (config.args?.length) parts.push(`args: ${config.args.length} 个`);
  const envCount = Object.keys(config.env || {}).length;
  if (envCount) parts.push(`env: ${envCount} 个`);
  const headerCount = Object.keys(config.headers || {}).length;
  if (headerCount) parts.push(`headers: ${headerCount} 个`);
  return parts.join(" | ") || "无详细配置";
};

// 查看工具：探活与展示逻辑在通用组件 McpToolDrawer 内（用生效配置）
const openToolDrawer = (item) => {
  toolServerName.value = item.name;
  toolServerConfig.value = item.config;
  showToolDrawer.value = true;
};

onMounted(loadServers);
</script>

<template>
  <div class="common-mcp-container">
    <div class="common-mcp-header">
      <div class="common-mcp-tip">
        <RadioGroup v-model="filterType" variant="default-filled" size="small" class="common-mcp-filter">
          <RadioButton value="all">全部</RadioButton>
          <RadioButton value="local">本地</RadioButton>
          <RadioButton value="cloud">云端</RadioButton>
        </RadioGroup>
        <span>通用 MCP 服务器库 — 本地 (~/.mcp.json) 与云端 (DB) 合并展示</span>
        <span class="common-mcp-count">{{ filteredServers.length }} 个</span>
      </div>
      <div class="common-mcp-actions">
        <Button size="small" theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template> 添加
        </Button>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template>
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="filteredServers.length === 0" class="common-mcp-empty">
      <Empty :description="mergedServers.length === 0 ? '还没有 MCP 服务器，点击右上角「添加」创建' : '当前筛选条件下没有 MCP 服务器'" />
    </div>

    <div v-else class="common-mcp-list">
      <McpServerCard
        v-for="item in filteredServers"
        :key="item.name"
        :srv="{ name: item.name, config: item.config }"
        :target="item.hasLocal ? 'local' : 'cloud'"
      >
        <template #tags>
          <Tag v-if="item.hasLocal" size="small" theme="success" variant="light">本地</Tag>
          <Tag v-if="item.hasCloud" size="small" theme="primary" variant="light">云端</Tag>
          <Tag v-if="item.diff" size="small" theme="warning" variant="light">配置不同</Tag>
        </template>

        <template #actions>
          <Space size="small">
            <Tooltip content="查看工具" placement="top">
              <Button size="small" variant="text" @click="openToolDrawer(item)">
                <template #icon><ToolsIcon /></template>
              </Button>
            </Tooltip>
            <Tooltip content="编辑" placement="top">
              <Button size="small" variant="text" @click="openEditDialog(item)">
                <template #icon><EditIcon /></template>
              </Button>
            </Tooltip>
            <Dropdown trigger="click" placement="bottom-right">
              <Button size="small" variant="text" title="更多操作">
                <template #icon><MoreIcon /></template>
              </Button>
              <template #dropdown>
                <DropdownMenu>
                  <!-- 仅本地：本地 → 云端 -->
                  <DropdownItem
                    v-if="item.hasLocal && !item.hasCloud"
                    @click="copyFrom(item, 'local')"
                  >本地到云端</DropdownItem>
                  <!-- 仅云端：云端 → 本地 -->
                  <DropdownItem
                    v-if="item.hasCloud && !item.hasLocal"
                    @click="copyFrom(item, 'cloud')"
                  >云端到本地</DropdownItem>
                  <!-- 同时存在两端：移除单端 -->
                  <template v-if="item.hasLocal && item.hasCloud">
                    <DropdownItem @click="confirmRemoveSide(item, 'local')">移除本地</DropdownItem>
                    <DropdownItem @click="confirmRemoveSide(item, 'cloud')">移除云端</DropdownItem>
                  </template>
                </DropdownMenu>
              </template>
            </Dropdown>
            <Popconfirm
              content="将从本地与云端同时删除该服务器，确定？"
              @confirm="deleteBoth(item)"
            >
              <Button size="small" variant="text" theme="danger">
                <template #icon><DeleteIcon /></template>
              </Button>
            </Popconfirm>
          </Space>
        </template>
        <template #body>
          <div class="common-mcp-info-row">
            <div class="common-mcp-config-summary">
              {{ getConfigSummary(item.config) }}
            </div>
          </div>
        </template>
      </McpServerCard>
    </div>

    <McpServerDialog
      ref="mcpDialogRef"
      :show-target="true"
      :name-disabled-on-edit="true"
      @save="handleSaveMcp"
    />

    <McpToolDrawer
      v-model:visible="showToolDrawer"
      :server-name="toolServerName"
      :config="toolServerConfig"
    />
  </div>
</template>
