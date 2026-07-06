<script setup>
import { ref, onMounted } from "vue";
import { Card, Empty, Tag, Button, Tooltip } from "tdesign-vue-next";
import { RefreshIcon } from "tdesign-icons-vue-next";
import "./styles/PiMcpView.css";

const loading = ref(false);
const servers = ref([]);

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

onMounted(loadServers);
</script>

<template>
  <div class="pi-mcp-container">
    <div class="pi-mcp-header">
      <span class="pi-mcp-tip">Pi Agent 扩展包提供的 MCP 服务器</span>
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
      <Card v-for="srv in servers" :key="srv.serverName" :bordered="true" class="pi-mcp-card">
        <template #header>
          <div class="pi-mcp-card-header">
            <span class="pi-mcp-srv-name">{{ srv.serverName }}</span>
            <Tag size="small" variant="light" theme="success">已启用</Tag>
          </div>
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
  </div>
</template>
