<script setup>

import { ref, onMounted } from "vue";
import {
  Card, Empty, Tag, Button, Tooltip, MessagePlugin,
} from "tdesign-vue-next";
import { RefreshIcon } from "tdesign-icons-vue-next";
import "./styles/McpView.css";

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

const openPiConfig = () => {
  try {
    window.utools.shellOpenPath(window.services.resolvePiPath());
  } catch (e) {
    window.services.openPiDir();
  }
};

// 点击复制 MCP 名称
const copyMcpName = (name) => {
  try {
    window.utools.copyText(name);
    MessagePlugin.success("名称已复制");
  } catch { MessagePlugin.error("复制失败"); }
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
            <Tooltip content="点击复制名称" placement="top">
              <span class="pi-mcp-srv-name" @click.stop="copyMcpName(srv.serverName)">{{ srv.serverName }}</span>
            </Tooltip>
            <Tag size="small" variant="light" theme="success">可用</Tag>
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