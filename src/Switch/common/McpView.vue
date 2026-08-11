<script setup>

import { ref, onMounted } from "vue";
import {
  Empty, Button, Tag, Space, Tooltip, MessagePlugin, Popconfirm,
} from "tdesign-vue-next";
import { RefreshIcon, EditIcon, AddIcon, DeleteIcon, ToolsIcon, MoveIcon, SwapIcon } from "tdesign-icons-vue-next";
import McpToolDrawer from "../../components/McpToolDrawer.vue";
import McpServerDialog from "../../components/McpServerDialog.vue";
import "./styles/McpView.css";

// 通用 MCP 库：分「本地」与「云端」两部分
//   - 本地：直接读写 ~/.mcp.json（多数 agent 共同读取）
//   - 云端：存 uTools DB（ccswitch_common_mcp，{ mcpServers: {...} }）
// 两端各自可添加/编辑/删除，支持单个「复制到另一端」与批量同步（并集合并，源覆盖同名）

const loading = ref(false);

// 两个存储端
const localServers = ref([]);
const cloudServers = ref([]);

// MCP 添加/编辑弹窗（通用组件）
const mcpDialogRef = ref(null);
const dialogTarget = ref('local'); // local | cloud（弹窗保存到哪一端）
const openCreateDialog = (target) => {
  dialogTarget.value = target;
  mcpDialogRef.value?.open('create');
};
const openEditDialog = (srv, target) => {
  dialogTarget.value = target;
  mcpDialogRef.value?.open('edit', srv.name, srv.config);
};
const handleSaveMcp = ({ mode, name, config }) => {
  try {
    if (dialogTarget.value === 'local') {
      window.services.upsertLocalMcpServer(name, config);
    } else {
      window.services.upsertCommonMcpServer(name, config);
    }
    MessagePlugin.success(`${dialogTarget.value === 'local' ? '本地' : '云端'}服务器 ${name} ${mode === 'create' ? '已添加' : '已更新'}`);
    mcpDialogRef.value?.close();
    loadServers();
  } catch (e) {
    MessagePlugin.error('保存失败: ' + e.message);
  }
};

// 工具抽屉
const showToolDrawer = ref(false);
const toolServerName = ref('');
const toolServerConfig = ref(null);

const typeLabel = (config) => (config.type === 'http' || config.url) ? 'HTTP' : 'STDIO';
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

const formatArgs = (args) => {
  if (!args || !Array.isArray(args)) return '';
  return args.join(' ');
};

const copyName = (name) => {
  try {
    window.utools.copyText(name);
    MessagePlugin.success("名称已复制");
  } catch { MessagePlugin.error("复制失败"); }
};

const deleteServer = (srv, target) => {
  try {
    if (target === 'local') {
      window.services.deleteLocalMcpServer(srv.name);
    } else {
      window.services.deleteCommonMcpServer(srv.name);
    }
    MessagePlugin.success(`${targetLabel(target)}服务器 ${srv.name} 已删除`);
    loadServers();
  } catch (e) {
    MessagePlugin.error('删除失败: ' + e.message);
  }
};

// 单个复制到另一端（同名覆盖目标端）
const copyToOtherSide = (srv, target) => {
  const dest = target === 'local' ? 'cloud' : 'local';
  try {
    window.services.copyCommonMcpServer(srv.name, dest);
    MessagePlugin.success(`已复制 "${srv.name}" 到${targetLabel(dest)}`);
    loadServers();
  } catch (e) {
    MessagePlugin.error('复制失败: ' + e.message);
  }
};

// 批量同步：direction 'toLocal'（云端→本地）| 'toCloud'（本地→云端）
const syncAll = (direction) => {
  try {
    const result = window.services.syncCommonMcp(direction);
    if (result.written) {
      MessagePlugin.success(`已同步 ${result.total} 个服务器到${targetLabel(direction === 'toLocal' ? 'local' : 'cloud')}`);
    } else {
      MessagePlugin.error('同步失败');
    }
    loadServers();
  } catch (e) {
    MessagePlugin.error('同步失败: ' + e.message);
  }
};

// 查看工具：探活与展示逻辑在通用组件 McpToolDrawer 内
const openToolDrawer = (srv) => {
  toolServerName.value = srv.name;
  toolServerConfig.value = srv.config;
  showToolDrawer.value = true;
};

onMounted(loadServers);
</script>

<template>
  <div class="common-mcp-container">
    <div class="common-mcp-header">
      <span class="common-mcp-tip">
        通用 MCP 服务器库 — 分「本地 (~/.mcp.json)」与「云端 (DB)」两部分，各自可增删改，支持互相复制与批量同步
      </span>
      <Tooltip content="刷新" placement="top">
        <Button size="small" variant="outline" :loading="loading" @click="refresh">
          <template #icon><RefreshIcon /></template> 刷新
        </Button>
      </Tooltip>
    </div>

    <!-- 本地区 -->
    <div class="common-mcp-section">
      <div class="common-mcp-section-header">
        <div class="common-mcp-section-title">
          <Tag size="small" theme="success" variant="light">本地</Tag>
          <span class="common-mcp-section-name">~/.mcp.json</span>
          <span class="common-mcp-section-count">{{ localServers.length }} 个</span>
        </div>
        <Space size="small">
          <Popconfirm
            content="将云端全部服务器合并到本地（同名覆盖），确定？"
            @confirm="syncAll('toLocal')"
          >
            <Button size="small" variant="outline">
              <template #icon><SwapIcon /></template> 云端 → 本地
            </Button>
          </Popconfirm>
          <Button size="small" theme="primary" @click="openCreateDialog('local')">
            <template #icon><AddIcon /></template> 添加
          </Button>
        </Space>
      </div>

      <div v-if="localServers.length === 0" class="common-mcp-section-empty">
        <Empty description="本地还没有 MCP 服务器" />
      </div>

      <div v-else class="common-mcp-list">
        <div v-for="srv in localServers" :key="'local-' + srv.name" class="common-mcp-card">
          <div class="common-mcp-card-header">
            <div class="common-mcp-srv-name-wrap">
              <Tooltip content="点击复制名称" placement="top">
                <span class="common-mcp-srv-name" @click="copyName(srv.name)">{{ srv.name }}</span>
              </Tooltip>
              <Tag size="small" :theme="typeLabel(srv.config) === 'HTTP' ? 'primary' : 'success'" variant="light">
                {{ typeLabel(srv.config) }}
              </Tag>
            </div>
            <Space size="small">
              <Tooltip content="查看工具" placement="top">
                <Button size="small" variant="text" @click="openToolDrawer(srv)">
                  <template #icon><ToolsIcon /></template>
                </Button>
              </Tooltip>
              <Tooltip content="复制到云端" placement="top">
                <Button size="small" variant="text" @click="copyToOtherSide(srv, 'local')">
                  <template #icon><MoveIcon /></template>
                </Button>
              </Tooltip>
              <Tooltip content="编辑" placement="top">
                <Button size="small" variant="text" @click="openEditDialog(srv, 'local')">
                  <template #icon><EditIcon /></template>
                </Button>
              </Tooltip>
              <Popconfirm content="确定删除此 MCP 服务器？" @confirm="deleteServer(srv, 'local')">
                <Button size="small" variant="text" theme="danger">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </Space>
          </div>

          <div class="common-mcp-card-body">
            <div v-if="typeLabel(srv.config) === 'STDIO'" class="common-mcp-info-row">
              <span class="common-mcp-label">命令</span>
              <span class="common-mcp-value mono">{{ srv.config.command }}</span>
            </div>
            <div v-if="srv.config.args?.length" class="common-mcp-info-row">
              <span class="common-mcp-label">参数</span>
              <span class="common-mcp-value mono">{{ formatArgs(srv.config.args) }}</span>
            </div>
            <div v-if="srv.config.url" class="common-mcp-info-row">
              <span class="common-mcp-label">URL</span>
              <span class="common-mcp-value mono">{{ srv.config.url }}</span>
            </div>
            <div v-if="Object.keys(srv.config.env || {}).length" class="common-mcp-info-row">
              <span class="common-mcp-label">环境变量</span>
              <span class="common-mcp-value mono">{{ Object.keys(srv.config.env).join(', ') }}</span>
            </div>
            <div v-if="Object.keys(srv.config.headers || {}).length" class="common-mcp-info-row">
              <span class="common-mcp-label">请求头</span>
              <span class="common-mcp-value mono">{{ Object.keys(srv.config.headers).join(', ') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 云端区 -->
    <div class="common-mcp-section">
      <div class="common-mcp-section-header">
        <div class="common-mcp-section-title">
          <Tag size="small" theme="primary" variant="light">云端</Tag>
          <span class="common-mcp-section-name">uTools DB</span>
          <span class="common-mcp-section-count">{{ cloudServers.length }} 个</span>
        </div>
        <Space size="small">
          <Popconfirm
            content="将本地全部服务器合并到云端（同名覆盖），确定？"
            @confirm="syncAll('toCloud')"
          >
            <Button size="small" variant="outline">
              <template #icon><SwapIcon /></template> 本地 → 云端
            </Button>
          </Popconfirm>
          <Button size="small" theme="primary" @click="openCreateDialog('cloud')">
            <template #icon><AddIcon /></template> 添加
          </Button>
        </Space>
      </div>

      <div v-if="cloudServers.length === 0" class="common-mcp-section-empty">
        <Empty description="云端还没有 MCP 服务器" />
      </div>

      <div v-else class="common-mcp-list">
        <div v-for="srv in cloudServers" :key="'cloud-' + srv.name" class="common-mcp-card">
          <div class="common-mcp-card-header">
            <div class="common-mcp-srv-name-wrap">
              <Tooltip content="点击复制名称" placement="top">
                <span class="common-mcp-srv-name" @click="copyName(srv.name)">{{ srv.name }}</span>
              </Tooltip>
              <Tag size="small" :theme="typeLabel(srv.config) === 'HTTP' ? 'primary' : 'success'" variant="light">
                {{ typeLabel(srv.config) }}
              </Tag>
            </div>
            <Space size="small">
              <Tooltip content="查看工具" placement="top">
                <Button size="small" variant="text" @click="openToolDrawer(srv)">
                  <template #icon><ToolsIcon /></template>
                </Button>
              </Tooltip>
              <Tooltip content="复制到本地" placement="top">
                <Button size="small" variant="text" @click="copyToOtherSide(srv, 'cloud')">
                  <template #icon><MoveIcon /></template>
                </Button>
              </Tooltip>
              <Tooltip content="编辑" placement="top">
                <Button size="small" variant="text" @click="openEditDialog(srv, 'cloud')">
                  <template #icon><EditIcon /></template>
                </Button>
              </Tooltip>
              <Popconfirm content="确定删除此 MCP 服务器？" @confirm="deleteServer(srv, 'cloud')">
                <Button size="small" variant="text" theme="danger">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </Space>
          </div>

          <div class="common-mcp-card-body">
            <div v-if="typeLabel(srv.config) === 'STDIO'" class="common-mcp-info-row">
              <span class="common-mcp-label">命令</span>
              <span class="common-mcp-value mono">{{ srv.config.command }}</span>
            </div>
            <div v-if="srv.config.args?.length" class="common-mcp-info-row">
              <span class="common-mcp-label">参数</span>
              <span class="common-mcp-value mono">{{ formatArgs(srv.config.args) }}</span>
            </div>
            <div v-if="srv.config.url" class="common-mcp-info-row">
              <span class="common-mcp-label">URL</span>
              <span class="common-mcp-value mono">{{ srv.config.url }}</span>
            </div>
            <div v-if="Object.keys(srv.config.env || {}).length" class="common-mcp-info-row">
              <span class="common-mcp-label">环境变量</span>
              <span class="common-mcp-value mono">{{ Object.keys(srv.config.env).join(', ') }}</span>
            </div>
            <div v-if="Object.keys(srv.config.headers || {}).length" class="common-mcp-info-row">
              <span class="common-mcp-label">请求头</span>
              <span class="common-mcp-value mono">{{ Object.keys(srv.config.headers).join(', ') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <McpServerDialog
      ref="mcpDialogRef"
      :header-prefix="targetLabel(dialogTarget) + ' · '"
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
