<script setup>
import { ref, onMounted } from "vue";
import {
  Card, Empty, Tag, Button, Tooltip, Drawer, Skeleton, MessagePlugin,
} from "tdesign-vue-next";
import { RefreshIcon, ToolsIcon } from "tdesign-icons-vue-next";
import "./styles/PiMcpView.css";

const loading = ref(false);
const servers = ref([]);

const showToolDrawer = ref(false);
const toolDrawerTitle = ref("");
const toolList = ref([]);
const toolLoading = ref(false);
const toolError = ref("");

const loadServers = () => {
  try {
    servers.value = window.services.getPiMcpServers();
  } catch (e) {
    console.error("加载 Pi MCP 服务器失败:", e);
    servers.value = [];
  }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadServers(); loading.value = false; }, 50);
};

const openToolDrawer = async (srv) => {
  showToolDrawer.value = true;
  toolDrawerTitle.value = `${srv.serverName} (@${srv.package})`;
  toolList.value = [];
  toolLoading.value = true;
  toolError.value = "";

  try {
    const result = await window.services.getPiMcpTools(srv);
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

const openPiConfig = () => {
  try {
    window.utools.shellOpenPath(window.services.resolvePiPath());
  } catch (e) {
    window.services.openPiDir();
  }
};

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

onMounted(loadServers);
</script>

<template>
  <div class="pi-mcp-container">
    <div class="pi-mcp-header">
      <span class="pi-mcp-tip">
        Pi Agent 扩展包提供的 MCP 服务器 — 通过
        <code class="hint-link" @click="openPiConfig">pi config</code> 管理
      </span>
      <Tooltip content="刷新" placement="top">
        <Button size="small" variant="outline" :loading="loading" @click="refresh">
          <template #icon><RefreshIcon /></template> 刷新
        </Button>
      </Tooltip>
    </div>

    <div v-if="servers.length === 0" class="pi-mcp-empty">
      <Empty description="已安装的扩展中未发现 MCP 服务器" />
    </div>

    <div v-else class="pi-mcp-list">
      <Card
        v-for="srv in servers"
        :key="srv.serverName + '@' + srv.package"
        :bordered="true"
        class="pi-mcp-card"
      >
        <template #title>
          <div class="pi-mcp-card-header">
            <span class="pi-mcp-srv-name">{{ srv.serverName }}</span>
            <Tag size="small" variant="light" theme="success">可用</Tag>
          </div>
        </template>
        <template #actions>
          <Tooltip content="查看工具" placement="top">
            <Button size="small" theme="default" variant="text" @click="openToolDrawer(srv)">
              <ToolsIcon />
            </Button>
          </Tooltip>
        </template>
        <div class="pi-mcp-card-body">
          <div class="pi-mcp-info-row">
            <span class="pi-mcp-label">来源扩展</span>
            <span class="pi-mcp-value">{{ srv.package }}</span>
          </div>
          <div class="pi-mcp-info-row">
            <span class="pi-mcp-label">命令</span>
            <span class="pi-mcp-value mono">{{ srv.command }} {{ srv.args.join(' ') }}</span>
          </div>
        </div>
      </Card>
    </div>

    <Drawer
      v-model:visible="showToolDrawer"
      :header="false"
      placement="left"
      size="80%"
      :footer="false"
    >
      <div v-if="toolLoading" class="pi-tool-skeleton">
        <div v-for="i in 3" :key="i" class="skeleton-card">
          <Skeleton :row="1" :loading="true" animation="fluent" />
          <div class="skeleton-card-body"><Skeleton :row="2" :loading="true" animation="fluent" /></div>
        </div>
      </div>
      <div v-else-if="toolError" class="pi-tool-error">
        <Tag theme="danger" variant="light">连接失败</Tag>
        <span class="pi-tool-error-msg">{{ toolError }}</span>
      </div>
      <div v-else-if="!toolList.length && !toolLoading" class="pi-tool-empty">
        <Empty description="暂无工具" />
      </div>
      <div v-else class="pi-tool-list">
        <div class="pi-tool-drawer-header">{{ toolDrawerTitle }}</div>
        <div v-for="tool in toolList" :key="tool.name" class="pi-tool-item">
          <div class="pi-tool-name">{{ tool.name }}</div>
          <div class="pi-tool-section">
            <div class="pi-tool-section-title">描述</div>
            <div class="pi-tool-desc">{{ tool.description || '无描述' }}</div>
          </div>
          <div v-if="formatSchema(tool.inputSchema)" class="pi-tool-section">
            <div class="pi-tool-section-title">参数</div>
            <div class="pi-param-list">
              <div v-for="param in formatSchema(tool.inputSchema)" :key="param.name" class="pi-param-item">
                <span class="pi-param-bullet">●</span>
                <span class="pi-param-name">{{ param.name }}</span>
                <span class="pi-param-required" v-if="param.required">(必填)</span>
                <span class="pi-param-optional" v-else>(可选)</span>
                <span class="pi-param-type">{{ param.type }}</span>
                <span v-if="param.description" class="pi-param-separator"> - </span>
                <span v-if="param.description" class="pi-param-desc">{{ param.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  </div>
</template>