<script setup>
import { ref, onMounted } from "vue";
import {
  Card,
  Button,
  Input,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Textarea,
  Popconfirm,
  Switch,
} from "tdesign-vue-next";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
} from "tdesign-icons-vue-next";

const mcpServerList = ref([]);
const showDialog = ref(false);
const editingName = ref("");
const dialogMode = ref("create"); // 'create' or 'edit'

// JSON 编辑内容
const jsonContent = ref("");
const jsonError = ref("");
const mcpName = ref("");

// 示例模板
const EXAMPLE_STDIO = `{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"],
  "env": {}
}`;

const EXAMPLE_HTTP = `{
  "type": "http",
  "url": "http://localhost:3000/mcp",
  "env": {}
}`;

// 加载 MCP 配置（带状态）
const loadMcpServers = () => {
  mcpServerList.value = window.services.getAllMcpServersWithStatus();
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

// 打开 claude.json 文件
const openClaudeJsonFile = () => {
  const filePath = window.services.getClaudeJsonPath();
  window.utools.shellOpenPath(filePath);
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

// 打开创建对话框
const openCreateDialog = () => {
  dialogMode.value = "create";
  editingName.value = "";
  mcpName.value = "";
  jsonContent.value = EXAMPLE_STDIO;
  jsonError.value = "";
  showDialog.value = true;
};

// 打开编辑对话框
const openEditDialog = (server) => {
  if (!server.enabled) {
    return MessagePlugin.warning("请先开启 MCP 后再编辑");
  }
  dialogMode.value = "edit";
  editingName.value = server.name;
  mcpName.value = server.name;
  const config = { ...server.config };
  jsonContent.value = JSON.stringify(config, null, 2);
  jsonError.value = "";
  showDialog.value = true;
};

// 验证 JSON
const validateJson = () => {
  try {
    const parsed = JSON.parse(jsonContent.value);
    jsonError.value = "";
    return parsed;
  } catch (e) {
    jsonError.value = e.message;
    return null;
  }
};

// 使用 STDIO 模板
const useStdioTemplate = () => {
  jsonContent.value = EXAMPLE_STDIO;
  jsonError.value = "";
};

// 使用 HTTP 模板
const useHttpTemplate = () => {
  jsonContent.value = EXAMPLE_HTTP;
  jsonError.value = "";
};

// 保存 MCP 配置
const saveMcpServer = () => {
  const config = validateJson();
  if (!config) {
    return MessagePlugin.error("JSON 格式错误: " + jsonError.value);
  }

  // 验证必需字段
  if (!config.type) {
    return MessagePlugin.error("配置缺少 type 字段");
  }

  const name = mcpName.value.trim();
  if (!name) {
    return MessagePlugin.error("MCP 名称不能为空");
  }

  // 如果是编辑且名称改变，删除旧配置
  if (dialogMode.value === "edit" && editingName.value && editingName.value !== name) {
    window.services.deleteMcpServer(editingName.value);
  }

  if (window.services.upsertMcpServer(name, config)) {
    MessagePlugin.success(dialogMode.value === "create" ? "MCP 配置已添加" : "MCP 配置已更新");
    showDialog.value = false;
    loadMcpServers();
  } else {
    MessagePlugin.error("保存失败");
  }
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

onMounted(() => {
  loadMcpServers();
});
</script>

<template>
  <div class="mcp-container">
    <div class="section-header">
      <span class="mcp-tip">仅展示 <span class="hint-link" @click="openClaudeJsonFile">.claude.json</span> 内自定义的 MCP</span>
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
        :key="server.name + '-' + (server.enabled ? 'on' : 'off')"
        :title="server.name"
        :bordered="true"
        class="mcp-card"
      >
        <template #actions>
          <Space>
            <Switch
              :value="server.enabled"
              @change="toggleMcpStatus(server)"
              size="small"
            />
            <Tag :theme="getTypeTagTheme(server.config.type)" variant="light">
              {{ getTypeTag(server.config.type) }}
            </Tag>
            <Tag v-if="!server.enabled" theme="default" variant="light" size="small">
              已关闭
            </Tag>
            <Button
              size="small"
              theme="default"
              variant="text"
              :disabled="!server.enabled"
              @click="openEditDialog(server)"
              title="编辑"
            >
              <EditIcon />
            </Button>
            <Popconfirm
              theme="danger"
              content="确定要删除这个 MCP 配置吗？"
              @confirm="deleteMcpServer(server)"
            >
              <Button size="small" theme="danger" variant="text" title="删除">
                <DeleteIcon />
              </Button>
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

    <Dialog
      v-model:visible="showDialog"
      :header="dialogMode === 'create' ? '添加 MCP 服务器' : '编辑 MCP 服务器'"
      width="600px"
      @confirm="saveMcpServer"
    >
      <div class="json-editor">
        <!-- 名称输入 -->
        <div class="form-row">
          <label class="form-label">名称 <span class="required">*</span></label>
          <Input
            v-model="mcpName"
            placeholder="例如: my-mcp-server"
            :disabled="dialogMode === 'edit'"
          />
        </div>

        <div v-if="dialogMode === 'create'" class="template-buttons">
          <Button size="small" variant="outline" @click="useStdioTemplate">STDIO 模板</Button>
          <Button size="small" variant="outline" @click="useHttpTemplate">HTTP 模板</Button>
        </div>

        <div class="editor-label">
          <span>配置内容 (JSON)</span>
          <span v-if="jsonError" class="error-text">{{ jsonError }}</span>
        </div>

        <Textarea
          v-if="showDialog"
          v-model="jsonContent"
          :autosize="{ minRows: 12, maxRows: 20 }"
          :status="jsonError ? 'error' : 'default'"
          placeholder="{ ... }"
          class="json-textarea"
        />

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
  </div>
</template>

<style scoped>
.mcp-container {
  padding: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  margin-top: -4px;
}

.mcp-tip {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.hint-link {
  color: var(--td-brand-color);
  cursor: pointer;
  text-decoration: underline;
}

.section-header :deep(.t-typography-title) {
  margin: 0;
}

.empty-state {
  padding: 60px 0;
}

.mcp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mcp-card {
  margin-bottom: 0;
}

.mcp-card :deep(.t-card__header) {
  padding: 10px 16px;
}

.mcp-card :deep(.t-card__body) {
  padding: 8px 16px;
}

.mcp-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-summary {
  color: var(--td-text-color-secondary);
  font-size: 13px;
  font-family: monospace;
  word-break: break-all;
}

/* JSON 编辑器样式 */
.json-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.form-label .required {
  color: var(--td-error-color);
}

.template-buttons {
  display: flex;
  gap: 8px;
}

.editor-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.error-text {
  color: var(--td-error-color);
  font-size: 12px;
}

.json-textarea {
  font-family: 'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.json-textarea :deep(textarea) {
  font-family: inherit;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
