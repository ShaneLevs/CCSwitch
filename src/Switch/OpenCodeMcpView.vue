<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import {
  Card,
  Button,
  Input,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Popconfirm,
  Switch,
  Drawer,
  Skeleton,
  Tooltip,
  RadioGroup,
  RadioButton,
  Checkbox,
} from "tdesign-vue-next";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  ToolsIcon,
} from "tdesign-icons-vue-next";
import DynamicKvEditor from "../components/DynamicKvEditor.vue";
import "./styles/OpenCodeMcpView.css";

// Server list
const mcpServerList = ref([]);

// Dialog state
const showDialog = ref(false);
const dialogMode = ref("create"); // 'create' or 'edit'
const editingId = ref("");

// Dialog form fields (single reactive object to avoid stale state)
const serverForm = reactive({
  id: "",
  type: "local",
  command: "",     // full command string for local type
  env: [],         // [{key, value}] for environment
  url: "",         // URL for remote type
  headers: [],     // [{key, value}] for headers
  enabled: true,
});

// Tool discovery drawer
const showToolDrawer = ref(false);
const toolDrawerTitle = ref("");
const toolList = ref([]);
const toolLoading = ref(false);
const toolError = ref("");

// Load MCP servers from opencode.json
const loadMcpServers = () => {
  const mcpSection = window.services.getOpencodeMcpServers();
  if (!mcpSection || typeof mcpSection !== "object") {
    mcpServerList.value = [];
    return;
  }
  mcpServerList.value = Object.entries(mcpSection).map(([id, config]) => ({
    id,
    config,
  }));
};

// Open opencode.json file
const openOpencodeJson = () => {
  const filePath = window.services.getOpencodeConfigPath();
  window.utools.shellOpenPath(filePath);
};

// Get type tag label
const getTypeTag = (type) => {
  if (type === "remote") return "REMOTE";
  return "LOCAL";
};

// Get type tag theme
const getTypeTagTheme = (type) => {
  if (type === "remote") return "primary";
  return "success";
};

// Config summary for card display
const getConfigSummary = (config) => {
  if (config.type === "remote") {
    return `url: ${config.url || "未设置"}`;
  }
  // local type
  const parts = [];
  if (config.command && Array.isArray(config.command) && config.command.length > 0) {
    parts.push(`cmd: ${config.command[0]}`);
    if (config.command.length > 1) {
      parts.push(`args: ${config.command.length - 1} 个`);
    }
  }
  return parts.join(" | ") || "无详细配置";
};

// Toggle enable/disable
const toggleEnabled = (server) => {
  const newConfig = { ...server.config, enabled: !server.config.enabled };
  const result = window.services.setOpencodeMcpServer(server.id, newConfig);
  if (result) {
    MessagePlugin.success(server.config.enabled ? "已禁用" : "已启用");
    loadMcpServers();
  } else {
    MessagePlugin.error("操作失败");
  }
};

// Convert object to kv array for DynamicKvEditor
const objToKvArray = (obj) => {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
};

// Convert kv array back to object
const kvArrayToObj = (arr) => {
  const obj = {};
  if (!arr || !Array.isArray(arr)) return obj;
  arr.forEach(({ key, value }) => {
    if (key) obj[key] = value;
  });
  return obj;
};

// Parse command string into array
const parseCommandString = (str) => {
  if (!str || !str.trim()) return [];
  // Simple shell-like split: respect quoted strings
  const result = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) {
        result.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) result.push(current);
  return result;
};

// Join command array into display string
const joinCommandArray = (arr) => {
  if (!arr || !Array.isArray(arr)) return "";
  return arr.join(" ");
};

// Open create dialog
const openCreateDialog = () => {
  dialogMode.value = "create";
  editingId.value = "";
  Object.assign(serverForm, { id: "", type: "local", command: "", env: [], url: "", headers: [], enabled: true });
  showDialog.value = true;
};

// Open edit dialog
const openEditDialog = (server) => {
  dialogMode.value = "edit";
  editingId.value = server.id;
  const isRemote = server.config.type === "remote";
  Object.assign(serverForm, {
    id: server.id,
    type: server.config.type || "local",
    enabled: server.config.enabled !== false,
    url: isRemote ? (server.config.url || "") : "",
    headers: isRemote ? objToKvArray(server.config.headers) : [],
    command: isRemote ? "" : joinCommandArray(server.config.command),
    env: isRemote ? [] : objToKvArray(server.config.environment),
  });
  showDialog.value = true;
};

// Save MCP server
const saveMcpServer = () => {
  const id = serverForm.id.trim();
  if (!id) {
    return MessagePlugin.error("Server ID 不能为空");
  }

  let config;
  if (serverForm.type === "local") {
    const cmdArray = parseCommandString(serverForm.command);
    if (cmdArray.length === 0) {
      return MessagePlugin.error("Command 不能为空");
    }
    config = {
      type: "local",
      command: cmdArray,
      environment: kvArrayToObj(serverForm.env),
      enabled: serverForm.enabled,
    };
  } else {
    if (!serverForm.url.trim()) {
      return MessagePlugin.error("URL 不能为空");
    }
    config = {
      type: "remote",
      url: serverForm.url.trim(),
      headers: kvArrayToObj(serverForm.headers),
      enabled: serverForm.enabled,
    };
  }

  const result = window.services.setOpencodeMcpServer(id, config);
  if (result) {
    MessagePlugin.success(dialogMode.value === "create" ? "MCP 服务器已添加" : "MCP 服务器已更新");
    showDialog.value = false;
    loadMcpServers();
  } else {
    MessagePlugin.error("保存失败");
  }
};

// Delete MCP server
const deleteMcpServer = (server) => {
  const result = window.services.removeOpencodeMcpServer(server.id);
  if (result) {
    MessagePlugin.success("MCP 服务器已删除");
    loadMcpServers();
  } else {
    MessagePlugin.error("删除失败");
  }
};

// Convert OpenCode config to Claude Code SDK format for tool discovery
const toSdkConfig = (server) => {
  const config = server.config;
  if (config.type === "remote") {
    return {
      type: "http",
      url: config.url,
      headers: config.headers || {},
    };
  }
  // local type
  const cmd = Array.isArray(config.command) ? config.command : [];
  return {
    type: "stdio",
    command: cmd[0] || "",
    args: cmd.slice(1),
    env: config.environment || {},
  };
};

// Open tool discovery drawer
const openToolDrawer = async (server) => {
  showToolDrawer.value = true;
  toolDrawerTitle.value = server.id;
  toolList.value = [];
  toolLoading.value = true;
  toolError.value = "";

  try {
    const sdkConfig = toSdkConfig(server);
    const result = await window.services.getMcpServerTools(sdkConfig);
    if (result.success) {
      toolList.value = result.tools;
      if (result.tools.length === 0) {
        MessagePlugin.info("该 MCP 服务器未提供任何工具");
      }
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

// Format JSON Schema parameters
const formatSchema = (schema) => {
  if (!schema || !schema.properties) return null;
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) return null;
  return entries.map(([name, prop]) => ({
    name,
    type: prop.type || "any",
    description: prop.description || "",
    required: schema.required?.includes(name) || false,
  }));
};

onMounted(() => {
  loadMcpServers();
});
</script>

<template>
  <div class="opencode-mcp-container">
    <div class="section-header">
      <span class="mcp-tip">仅展示 <span class="hint-link" @click="openOpencodeJson">opencode.json</span> 内的 MCP 配置</span>
      <Button size="small" theme="primary" @click="openCreateDialog">
        <template #icon><AddIcon /></template> 添加 MCP
      </Button>
    </div>

    <div v-if="!mcpServerList.length" class="empty-state">
      <Empty description="暂无 MCP 服务器配置">
        <template #action>
          <Button theme="primary" @click="openCreateDialog">
            <template #icon><AddIcon /></template> 添加第一个 MCP
          </Button>
        </template>
      </Empty>
    </div>

    <div v-else class="mcp-list">
      <Card
        v-for="server in mcpServerList"
        :key="server.id"
        :bordered="true"
        class="mcp-card"
        :class="{ 'mcp-card-disabled': server.config.enabled === false }"
      >
        <template #title>
          <div class="mcp-title-wrapper">
            <span class="mcp-title-name">{{ server.id }}</span>
            <Tag size="small" :theme="getTypeTagTheme(server.config.type)" variant="light">
              {{ getTypeTag(server.config.type) }}
            </Tag>
          </div>
        </template>
        <template #actions>
          <Space>
            <Switch
              :value="server.config.enabled !== false"
              @change="toggleEnabled(server)"
              size="small"
            />
            <Tooltip content="查看工具" placement="top">
              <Button
                size="small"
                theme="default"
                variant="text"
                @click="openToolDrawer(server)"
              >
                <ToolsIcon />
              </Button>
            </Tooltip>
            <Tooltip content="编辑" placement="top">
              <Button
                size="small"
                theme="default"
                variant="text"
                @click="openEditDialog(server)"
              >
                <EditIcon />
              </Button>
            </Tooltip>
            <Popconfirm
              theme="danger"
              content="确定要删除这个 MCP 配置吗？"
              @confirm="deleteMcpServer(server)"
            >
              <Tooltip content="删除" placement="top">
                <Button size="small" theme="danger" variant="text">
                  <DeleteIcon />
                </Button>
              </Tooltip>
            </Popconfirm>
          </Space>
        </template>

        <div class="mcp-info">
          <div class="info-item config-summary">
            {{ getConfigSummary(server.config) || '无详细配置' }}
          </div>
        </div>
      </Card>
    </div>

    <!-- Create/Edit Dialog -->
    <Dialog
      v-model:visible="showDialog"
      :header="dialogMode === 'create' ? '添加 MCP 服务器' : '编辑 MCP 服务器'"
      width="600px"
      @confirm="saveMcpServer"
    >
      <div class="mcp-editor">
        <!-- Server ID -->
        <div class="form-row">
          <label class="form-label">Server ID <span class="required">*</span></label>
          <Input
            v-model="serverForm.id"
            placeholder="例如: my-mcp-server"
            :disabled="dialogMode === 'edit'"
          />
        </div>

        <!-- Type selector -->
        <div class="form-row">
          <label class="form-label">类型 <span class="required">*</span></label>
          <RadioGroup v-model="serverForm.type" variant="default-filled">
            <RadioButton value="local">LOCAL</RadioButton>
            <RadioButton value="remote">REMOTE</RadioButton>
          </RadioGroup>
        </div>

        <!-- LOCAL type fields -->
        <template v-if="serverForm.type === 'local'">
          <div class="form-row">
            <label class="form-label">Command <span class="required">*</span></label>
            <Input
              v-model="serverForm.command"
              placeholder="例如: npx -y @modelcontextprotocol/server-filesystem /path"
            />
            <span class="form-hint">完整命令，空格分隔参数，支持引号包裹</span>
          </div>
          <div class="form-row">
            <label class="form-label">Environment</label>
            <DynamicKvEditor
              v-model="serverForm.env"
              key-placeholder="变量名"
              value-placeholder="变量值"
            />
          </div>
        </template>

        <!-- REMOTE type fields -->
        <template v-if="serverForm.type === 'remote'">
          <div class="form-row">
            <label class="form-label">URL <span class="required">*</span></label>
            <Input
              v-model="serverForm.url"
              placeholder="例如: http://localhost:3000/mcp"
            />
          </div>
          <div class="form-row">
            <label class="form-label">Headers</label>
            <DynamicKvEditor
              v-model="serverForm.headers"
              key-placeholder="Header 名"
              value-placeholder="Header 值"
            />
          </div>
        </template>

        <!-- Enabled checkbox -->
        <div class="form-row">
          <Checkbox v-model="serverForm.enabled">启用</Checkbox>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <Button variant="outline" @click="showDialog = false">取消</Button>
          <Button theme="primary" @click="saveMcpServer">
            {{ dialogMode === 'create' ? '添加' : '保存' }}
          </Button>
        </div>
      </template>
    </Dialog>

    <!-- Tool Discovery Drawer -->
    <Drawer
      v-model:visible="showToolDrawer"
      :header="false"
      placement="left"
      size="80%"
      :footer="false"
    >
      <div v-if="toolLoading" class="tool-skeleton">
        <div v-for="i in 3" :key="i" class="skeleton-card">
          <Skeleton :row="1" :loading="true" animation="fluent" />
          <div class="skeleton-card-body">
            <Skeleton :row="2" :loading="true" animation="fluent" />
          </div>
        </div>
      </div>
      <div v-else-if="toolError" class="tool-error">
        <Tag theme="danger" variant="light">连接失败</Tag>
        <span class="tool-error-msg">{{ toolError }}</span>
      </div>
      <div v-else-if="!toolList.length && !toolLoading" class="tool-empty">
        <Empty description="暂无工具" />
      </div>
      <div v-else class="tool-list">
        <div v-for="tool in toolList" :key="tool.name" class="tool-item">
          <div class="tool-name">{{ tool.name }}</div>
          <div class="tool-meta">
            <span class="tool-meta-label">Tool name:</span> {{ tool.name }}
          </div>
          <div class="tool-meta">
            <span class="tool-meta-label">Full name:</span> mcp__{{ toolDrawerTitle }}__{{ tool.name }}
          </div>

          <div class="tool-section">
            <div class="tool-section-title">Description:</div>
            <div class="tool-desc">{{ tool.description || '无描述' }}</div>
          </div>

          <div v-if="formatSchema(tool.inputSchema)" class="tool-section">
            <div class="tool-section-title">Parameters:</div>
            <div class="param-list">
              <div v-for="param in formatSchema(tool.inputSchema)" :key="param.name" class="param-item">
                <span class="param-bullet">●</span>
                <span class="param-name">{{ param.name }}</span>
                <span class="param-required" v-if="param.required">(required)</span>
                <span class="param-optional" v-else>(optional)</span>
                <span class="param-type">{{ param.type }}</span>
                <span v-if="param.description" class="param-separator"> - </span>
                <span v-if="param.description" class="param-desc">{{ param.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  </div>
</template>
