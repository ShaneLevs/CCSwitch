<script setup>
import { ref, onMounted } from "vue";
import {
  Button,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Popconfirm,
  Switch,
  Tooltip,
} from "tdesign-vue-next";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  ToolsIcon,
  RefreshIcon,
  MoveIcon,
} from "tdesign-icons-vue-next";
import McpToolDrawer from "../../components/McpToolDrawer.vue";
import McpServerDialog from "../../components/McpServerDialog.vue";
import McpServerCard from "../../components/McpServerCard.vue";
import { formatLastUsed } from "../../utils/time";
import "./styles/McpView.css";

const mcpServerList = ref([]);
const mcpUsage = ref({});

// MCP 添加/编辑弹窗（通用组件）
const mcpDialogRef = ref(null);
const editingName = ref("");
const openCreateDialog = () => {
  editingName.value = "";
  mcpDialogRef.value?.open('create');
};
const openEditDialog = (server) => {
  if (!server.enabled) {
    return MessagePlugin.warning("请先开启 MCP 后再编辑");
  }
  editingName.value = server.name;
  mcpDialogRef.value?.open('edit', server.name, server.config);
};
// 保存：编辑改名时删除旧配置；支持 JSON-only 视图没有的校验（组件内已完成）
const handleSaveMcp = ({ mode, name, config }) => {
  if (mode === "edit" && editingName.value && editingName.value !== name) {
    window.services.deleteMcpServer(editingName.value);
  }
  if (window.services.upsertMcpServer(name, config)) {
    MessagePlugin.success(mode === "create" ? "MCP 配置已添加" : "MCP 配置已更新");
    mcpDialogRef.value?.close();
    loadMcpServers();
  } else {
    MessagePlugin.error("保存失败");
  }
};

// 工具查看相关
const showToolDrawer = ref(false);
const toolServerName = ref("");
const toolServerConfig = ref(null);

// 加载 MCP 服务器列表
const loadMcpServers = () => {
  mcpServerList.value = window.services.getAllMcpServersWithStatus();
  detectLegacyMcp();
};

// 检测旧来源（~/.claude.json / ~/.claude/.mcp.json）的 MCP，用于显示迁移按钮
const legacySources = ref([]);
const detectLegacyMcp = () => {
  legacySources.value = window.services.getLegacyMcpSources();
};

// 手动迁移旧来源 MCP 到 ~/.mcp.json
const handleMigrate = () => {
  const result = window.services.migrateMcpToUserFile();
  if (result.success) {
    MessagePlugin.success(result.migrated
      ? `已迁移 ${result.migrated} 个 MCP 到 ~/.mcp.json`
      : "旧来源中无待迁移的 MCP");
    loadMcpServers();
  } else {
    MessagePlugin.error(result.error || "迁移失败");
  }
};

// 手动刷新（迁移/外部修改后重新加载）
const mcpLoading = ref(false);
const handleRefresh = () => {
  mcpLoading.value = true;
  setTimeout(() => {
    loadMcpServers();
    mcpLoading.value = false;
  }, 50);
};

// 加载 MCP 使用统计（只在挂载时加载一次，拨动开关不刷新此数据）
const loadMcpUsage = () => {
  mcpUsage.value = window.services.getMcpUsage();
};

// 切换 MCP 状态
const toggleMcpStatus = (server) => {
  if (server.enabled) {
    // 关闭
    const result = window.services.disableMcpServer(server.name);
    if (result.success) {
      MessagePlugin.success("MCP 已关闭");
      loadMcpServers();
    } else {
      MessagePlugin.error(result.error || "关闭失败");
    }
  } else {
    // 开启
    const result = window.services.enableMcpServer(server.name);
    if (result.success) {
      MessagePlugin.success("MCP 已开启");
      loadMcpServers();
    } else {
      MessagePlugin.error(result.error || "开启失败");
    }
  }
};

// 打开 ~/.mcp.json 文件（不存在则自动创建）
const openClaudeMcpFile = () => {
  window.services.openClaudeMcpFile();
};

// 获取类型标签
const getTypeTag = (type) => {
  if (type === "http") return "HTTP";
  if (type === "sse") return "SSE";
  return "STDIO";
};

// 获取类型标签颜色
const getTypeTagTheme = (type) => {
  if (type === "http") return "primary";
  if (type === "sse") return "warning";
  return "success";
};

// 格式化参数显示
const formatArgs = (args) => {
  if (!args || !Array.isArray(args)) return "";
  return args.join(" ");
};

// 删除 MCP 配置
const deleteMcpServer = (server) => {
  let result;
  if (server.enabled) {
    result = window.services.deleteMcpServer(server.name);
  } else {
    result = window.services.deleteDisabledMcpServer(server.name);
  }
  if (result.success) {
    MessagePlugin.success("MCP 配置已删除");
    loadMcpServers();
  } else {
    MessagePlugin.error(result.error || "删除失败");
  }
};

// 在卡片上显示的配置摘要
const getConfigSummary = (config) => {
  const parts = [];
  if (config.command) {
    parts.push(`cmd: ${config.command}`);
  }
  if (config.url) {
    parts.push(`url: ${config.url}`);
  }
  if (config.args?.length) {
    parts.push(`args: ${config.args.length} 个`);
  }
  return parts.join(" | ");
};

// 打开工具查看抽屉（探活与展示逻辑在通用组件 McpToolDrawer 内）
const openToolDrawer = (server) => {
  if (!server.enabled) {
    return MessagePlugin.warning("请先开启 MCP 后再查看工具");
  }
  toolServerName.value = server.name;
  toolServerConfig.value = server.config;
  showToolDrawer.value = true;
};

onMounted(() => {
  loadMcpServers();
  setTimeout(() => loadMcpUsage(), 50);
});
</script>

<template>
  <div class="mcp-container">
    <div class="section-header">
      <span class="mcp-tip">仅展示 <span class="hint-link" @click="openClaudeMcpFile">~/.mcp.json</span> 内自定义的 MCP</span>
      <Space size="8px">
        <Tooltip
          v-if="legacySources.length"
          :content="`将 ${legacySources.join('、')} 中的 MCP 合并到 ~/.mcp.json，可被多数 agent 共同读取`"
          placement="top"
        >
          <Button size="small" variant="outline" @click="handleMigrate">
            <template #icon><MoveIcon /></template> 移至 ~/.mcp.json
          </Button>
        </Tooltip>
        <Button size="small" theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template> 添加 MCP
        </Button>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="mcpLoading" @click="handleRefresh">
            <template #icon><RefreshIcon /></template>
          </Button>
        </Tooltip>
      </Space>
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
      <McpServerCard
        v-for="server in mcpServerList"
        :key="server.name + '-' + (server.enabled ? 'on' : 'off')"
        :srv="server"
        :disabled="!server.enabled"
        :type-text="getTypeTag(server.config.type)"
        :type-theme="getTypeTagTheme(server.config.type)"
      >
        <template #actions>
          <Space>
            <Switch
              :value="server.enabled"
              @change="toggleMcpStatus(server)"
              size="small"
            />
            <Tooltip content="查看工具" placement="top">
              <Button
                size="small"
                theme="default"
                variant="text"
                :disabled="!server.enabled"
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
                :disabled="!server.enabled"
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

        <template #body>
          <div class="mcp-info-row">
            <div class="info-item config-summary">
              {{ getConfigSummary(server.config) || '无详细配置' }}
            </div>
            <div v-if="mcpUsage[server.name]" class="mcp-stats">
              <Tag size="small" variant="light" theme="primary">使用 {{ mcpUsage[server.name].usageCount }} 次</Tag>
              <span class="mcp-last-used">{{ formatLastUsed(mcpUsage[server.name].lastUsedAt) }}</span>
            </div>
          </div>
        </template>
      </McpServerCard>
    </div>

    <McpServerDialog
      ref="mcpDialogRef"
      @save="handleSaveMcp"
    />

    <McpToolDrawer
      v-model:visible="showToolDrawer"
      :server-name="toolServerName"
      :config="toolServerConfig"
    />
  </div>
</template>
