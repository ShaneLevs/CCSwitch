<script setup>

import { ref, onMounted } from "vue";
import {
  Empty, Button, Tag, Space, Tooltip, Dialog, Drawer, Input, RadioGroup, RadioButton, Textarea, MessagePlugin, Popconfirm, Skeleton,
} from "tdesign-vue-next";
import { RefreshIcon, EditIcon, AddIcon, DeleteIcon, ToolsIcon } from "tdesign-icons-vue-next";
import DynamicKvEditor from "../../components/DynamicKvEditor.vue";
import "./styles/McpView.css";

// 通用 MCP 库：所有 server 存 uTools DB（ccswitch_common_mcp），格式 { mcpServers: {...} }
// 与 ~/.mcp.json 解耦；查看工具复用 getMcpServerTools(config)（纯函数式，不依赖存储位置）

const loading = ref(false);
const servers = ref([]);
const showDialog = ref(false);
const dialogMode = ref('create'); // create | edit
const mcpName = ref('');
const mcpType = ref('stdio');
const mcpCommand = ref('');
const mcpArgsText = ref('');
const mcpUrl = ref('');
const mcpEnv = ref([]);
const mcpHeaders = ref([]);

// 工具抽屉
const showToolDrawer = ref(false);
const toolDrawerTitle = ref('');
const toolList = ref([]);
const toolLoading = ref(false);
const toolError = ref('');

const typeLabel = (config) => (config.type === 'http' || config.url) ? 'HTTP' : 'STDIO';

const loadServers = () => {
  try {
    const data = window.services.getCommonMcpServers();
    servers.value = Object.entries(data || {}).map(([name, config]) => ({ name, config }));
  } catch (e) {
    console.error("加载通用 MCP 服务器失败:", e);
    servers.value = [];
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

const openCreateDialog = () => {
  dialogMode.value = 'create';
  mcpName.value = '';
  mcpType.value = 'stdio';
  mcpCommand.value = '';
  mcpArgsText.value = '';
  mcpUrl.value = '';
  mcpEnv.value = [];
  mcpHeaders.value = [];
  showDialog.value = true;
};

const openEditDialog = (srv) => {
  dialogMode.value = 'edit';
  const cfg = srv.config || {};
  mcpName.value = srv.name;
  mcpType.value = cfg.type === 'http' || cfg.url ? 'http' : 'stdio';
  mcpCommand.value = cfg.command || '';
  mcpArgsText.value = (cfg.args && cfg.args.join(' ')) || '';
  mcpUrl.value = cfg.url || '';
  mcpEnv.value = cfg.env ? Object.entries(cfg.env).map(([k, v]) => ({ key: k, value: v })) : [];
  mcpHeaders.value = cfg.headers ? Object.entries(cfg.headers).map(([k, v]) => ({ key: k, value: v })) : [];
  showDialog.value = true;
};

const useStdioTemplate = () => {
  mcpType.value = 'stdio';
  mcpCommand.value = 'npx';
  mcpArgsText.value = '-y @modelcontextprotocol/server-filesystem /path/to/files';
};

const useHttpTemplate = () => {
  mcpType.value = 'http';
  mcpUrl.value = 'http://localhost:3000/mcp';
};

const saveServer = () => {
  const name = mcpName.value.trim();
  if (!name) { MessagePlugin.warning('请输入服务器名称'); return; }
  const config = {};
  if (mcpType.value === 'http') {
    if (!mcpUrl.value.trim()) { MessagePlugin.warning('请输入 HTTP URL'); return; }
    config.type = 'http';
    config.url = mcpUrl.value.trim();
    const headersObj = {};
    (mcpHeaders.value || []).forEach(({ key, value }) => {
      if (key && key.trim()) headersObj[key.trim()] = value;
    });
    if (Object.keys(headersObj).length) config.headers = headersObj;
  } else {
    if (!mcpCommand.value.trim()) { MessagePlugin.warning('请输入启动命令'); return; }
    config.type = 'stdio';
    config.command = mcpCommand.value.trim();
    const args = mcpArgsText.value.trim().split(/\s+/).filter(Boolean);
    if (args.length) config.args = args;
    const envObj = {};
    (mcpEnv.value || []).forEach(({ key, value }) => {
      if (key && key.trim()) envObj[key.trim()] = value;
    });
    if (Object.keys(envObj).length) config.env = envObj;
  }
  try {
    window.services.upsertCommonMcpServer(name, config);
    MessagePlugin.success(dialogMode.value === 'create' ? `服务器 ${name} 已添加` : `服务器 ${name} 已更新`);
    showDialog.value = false;
    loadServers();
  } catch (e) {
    MessagePlugin.error('保存失败: ' + e.message);
  }
};

const deleteServer = (name) => {
  try {
    window.services.deleteCommonMcpServer(name);
    MessagePlugin.success(`服务器 ${name} 已删除`);
    loadServers();
  } catch (e) {
    MessagePlugin.error('删除失败: ' + e.message);
  }
};

// 查看工具：复用 Claude 的 getMcpServerTools(config)，从 DB 读 config 喂进去即可
const openToolDrawer = async (srv) => {
  showToolDrawer.value = true;
  toolDrawerTitle.value = srv.name;
  toolList.value = [];
  toolLoading.value = true;
  toolError.value = '';
  try {
    const result = await window.services.getMcpServerTools(srv.config);
    if (result.success) {
      toolList.value = result.tools;
      if (result.tools.length === 0) MessagePlugin.info("该 MCP 服务器未提供任何工具");
    } else {
      toolError.value = result.error;
      MessagePlugin.error("获取工具列表失败: " + result.error);
    }
  } catch (e) {
    toolError.value = e.message;
    MessagePlugin.error("获取工具列表失败: " + e.message);
  } finally {
    toolLoading.value = false;
  }
};

// 格式化 JSON Schema 参数为可读文本
const formatSchema = (schema) => {
  if (!schema || !schema.properties) return null;
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) return null;
  return entries.map(([name, prop]) => ({
    name,
    type: prop.type || 'any',
    description: prop.description || '',
    required: schema.required?.includes(name) || false,
  }));
};

onMounted(loadServers);
</script>

<template>
  <div class="common-mcp-container">
    <div class="common-mcp-header">
      <span class="common-mcp-tip">
        通用 MCP 服务器库 — 所有 server 存 uTools DB，与各 agent 配置解耦；点击「查看工具」可直接连接探活
      </span>
      <div class="common-mcp-actions">
        <Tooltip content="添加服务器" placement="top">
          <Button size="small" variant="outline" @click="openCreateDialog">
            <template #icon><AddIcon /></template> 添加服务器
          </Button>
        </Tooltip>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template> 刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="servers.length === 0" class="common-mcp-empty">
      <Empty description="还没有 MCP 服务器，点击右上角「添加服务器」开始配置" />
    </div>

    <div v-else class="common-mcp-list">
      <div
        v-for="srv in servers"
        :key="srv.name"
        class="common-mcp-card"
      >
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
            <Tooltip content="编辑" placement="top">
              <Button size="small" variant="text" @click="openEditDialog(srv)">
                <template #icon><EditIcon /></template>
              </Button>
            </Tooltip>
            <Popconfirm content="确定删除此 MCP 服务器？" @confirm="deleteServer(srv.name)">
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

    <Dialog
      v-model:visible="showDialog"
      :header="dialogMode === 'create' ? '添加 MCP 服务器' : '编辑 MCP 服务器'"
      width="600px"
      :footer="false"
    >
      <div class="common-mcp-form">
        <div class="common-mcp-form-item">
          <label>名称 <span class="required">*</span></label>
          <Input
            v-model="mcpName"
            placeholder="例如: my-mcp-server"
            :disabled="dialogMode === 'edit'"
          />
        </div>

        <div class="common-mcp-form-item">
          <label>类型</label>
          <RadioGroup v-model="mcpType" variant="default-filled">
            <RadioButton value="stdio">STDIO</RadioButton>
            <RadioButton value="http">HTTP</RadioButton>
          </RadioGroup>
        </div>

        <div v-if="dialogMode === 'create'" class="common-mcp-template-buttons">
          <Button size="small" variant="outline" @click="useStdioTemplate">STDIO 模板</Button>
          <Button size="small" variant="outline" @click="useHttpTemplate">HTTP 模板</Button>
        </div>

        <template v-if="mcpType === 'stdio'">
          <div class="common-mcp-form-item">
            <label>启动命令 <span class="required">*</span></label>
            <Input v-model="mcpCommand" placeholder="例如: npx" />
          </div>
          <div class="common-mcp-form-item">
            <label>参数 (args，空格分隔)</label>
            <Textarea
              v-model="mcpArgsText"
              :autosize="{ minRows: 2, maxRows: 4 }"
              placeholder="例如: -y @modelcontextprotocol/server-filesystem /path/to/files"
            />
          </div>
          <div class="common-mcp-form-item">
            <label>环境变量 (env)</label>
            <DynamicKvEditor
              v-model="mcpEnv"
              key-placeholder="变量名"
              value-placeholder="变量值"
            />
          </div>
        </template>

        <template v-else>
          <div class="common-mcp-form-item">
            <label>HTTP URL <span class="required">*</span></label>
            <Input v-model="mcpUrl" placeholder="例如: http://localhost:3000/mcp" />
          </div>
          <div class="common-mcp-form-item">
            <label>请求头 (headers)</label>
            <DynamicKvEditor
              v-model="mcpHeaders"
              key-placeholder="Header 名"
              value-placeholder="Header 值"
            />
          </div>
        </template>
      </div>

      <template #footer>
        <div class="common-mcp-dialog-footer">
          <Button variant="outline" @click="showDialog = false">取消</Button>
          <Button theme="primary" @click="saveServer">
            {{ dialogMode === 'create' ? '添加' : '保存' }}
          </Button>
        </div>
      </template>
    </Dialog>

    <Drawer
      v-model:visible="showToolDrawer"
      :header="`${toolDrawerTitle} — 工具列表`"
      placement="right"
      size="60%"
      :footer="false"
    >
      <div v-if="toolLoading" class="common-tool-skeleton">
        <div v-for="i in 3" :key="i" class="common-skeleton-card">
          <Skeleton :row="1" :loading="true" animation="fluent" />
          <div class="common-skeleton-card-body">
            <Skeleton :row="2" :loading="true" animation="fluent" />
          </div>
        </div>
      </div>
      <div v-else-if="toolError" class="common-tool-error">
        <Tag theme="danger" variant="light">连接失败</Tag>
        <span class="common-tool-error-msg">{{ toolError }}</span>
      </div>
      <div v-else-if="!toolList.length && !toolLoading" class="common-tool-empty">
        <Empty description="暂无工具" />
      </div>
      <div v-else class="common-tool-list">
        <div v-for="tool in toolList" :key="tool.name" class="common-tool-item">
          <div class="common-tool-name">{{ tool.name }}</div>
          <div class="common-tool-meta">
            <span class="common-tool-meta-label">Full name:</span> mcp__{{ toolDrawerTitle }}__{{ tool.name }}
          </div>
          <div class="common-tool-section">
            <div class="common-tool-section-title">Description:</div>
            <div class="common-tool-desc">{{ tool.description || '无描述' }}</div>
          </div>
          <div v-if="formatSchema(tool.inputSchema)" class="common-tool-section">
            <div class="common-tool-section-title">Parameters:</div>
            <div class="common-param-list">
              <div v-for="param in formatSchema(tool.inputSchema)" :key="param.name" class="common-param-item">
                <span class="common-param-bullet">●</span>
                <span class="common-param-name">{{ param.name }}</span>
                <span class="common-param-required" v-if="param.required">(required)</span>
                <span class="common-param-optional" v-else>(optional)</span>
                <span class="common-param-type">{{ param.type }}</span>
                <span v-if="param.description" class="common-param-separator"> - </span>
                <span v-if="param.description" class="common-param-desc">{{ param.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  </div>
</template>
