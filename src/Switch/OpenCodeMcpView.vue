<script setup>

import { ref, onMounted } from "vue";
import {
  Card, Empty, Tag, Button, Tooltip, Dialog, Input, MessagePlugin, Space, Popconfirm,
} from "tdesign-vue-next";
import { RefreshIcon, AddIcon, DeleteIcon } from "tdesign-icons-vue-next";
import "./styles/OpenCodeMcpView.css";

const loading = ref(false);
const servers = ref([]);
const addDialog = ref(false);
const editingServer = ref(null);
const form = ref({ name: '', command: '', args: [], enabled: true });

const loadServers = () => {
  try {
    const raw = window.services.getOpencodeMcpServers();
    servers.value = Object.entries(raw).map(([name, cfg]) => ({
      name,
      type: cfg.type || 'local',
      command: Array.isArray(cfg.command) ? cfg.command.join(' ') : (String(cfg.command || '')),
      enabled: cfg.enabled !== false,
      raw: cfg,
    }));
  } catch (e) {
    console.error("加载 OpenCode MCP 失败:", e);
    servers.value = [];
  }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadServers(); loading.value = false; }, 50);
};

// 点击复制 MCP 名称
const copyMcpName = (name) => {
  try {
    window.utools.copyText(name);
    MessagePlugin.success("名称已复制");
  } catch { MessagePlugin.error("复制失败"); }
};

const openAddDialog = () => {
  editingServer.value = null;
  form.value = { name: '', command: '', args: [], enabled: true };
  addDialog.value = true;
};

const openEditDialog = (srv) => {
  editingServer.value = srv.name;
  const cmd = srv.raw.command || [];
  const cmdStr = Array.isArray(cmd) ? cmd : [cmd];
  form.value = {
    name: srv.name,
    command: cmdStr[0] || '',
    args: cmdStr.slice(1).map(String),
    enabled: srv.enabled,
  };
  addDialog.value = true;
};

const handleSave = () => {
  const name = form.value.name.trim();
  if (!name) { MessagePlugin.warning('请输入 MCP 名称'); return; }
  if (!form.value.command.trim()) { MessagePlugin.warning('请输入启动命令'); return; }
  try {
    const fullCmd = [form.value.command.trim(), ...form.value.args.map(a => a.trim()).filter(Boolean)];
    window.services.setOpencodeMcpServer(name, {
      type: 'local',
      command: fullCmd,
      enabled: form.value.enabled,
    });
    MessagePlugin.success(editingServer.value ? '已更新' : '已添加');
    addDialog.value = false;
    loadServers();
  } catch (e) {
    MessagePlugin.error('保存失败: ' + e.message);
  }
};

const handleRemove = (name) => {
  try {
    window.services.removeOpencodeMcpServer(name);
    MessagePlugin.success('已删除');
    loadServers();
  } catch (e) {
    MessagePlugin.error('删除失败: ' + e.message);
  }
};

const addArg = () => { form.value.args.push(''); };
const removeArg = (idx) => { form.value.args.splice(idx, 1); };

onMounted(loadServers);

</script>

<template>
  <div class="oc-mcp-container">
    <div class="oc-mcp-header">
      <div class="oc-mcp-header-left">
        <span class="oc-mcp-tip">OpenCode MCP 服务器配置（直接编辑 opencode.json/mcp）</span>
      </div>
      <div class="oc-mcp-actions">
        <Button size="small" variant="outline" @click="openAddDialog">
          <template #icon><AddIcon /></template> 添加 MCP
        </Button>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template> 刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="servers.length === 0" class="oc-mcp-empty">
      <Empty description="暂无 MCP 配置">
        <template #action>
          <Button size="small" theme="primary" @click="openAddDialog">
            <template #icon><AddIcon /></template> 添加 MCP
          </Button>
        </template>
      </Empty>
    </div>

    <div v-else class="oc-mcp-list">
      <Card v-for="srv in servers" :key="srv.name" :bordered="true">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="oc-mcp-card-header">
              <Tooltip content="点击复制名称" placement="top">
                <span class="oc-mcp-srv-name" @click.stop="copyMcpName(srv.name)">{{ srv.name }}</span>
              </Tooltip>
              <Tag size="small" variant="light" :theme="srv.enabled ? 'success' : 'default'">
                {{ srv.enabled ? '已启用' : '已禁用' }}
              </Tag>
              <Tag size="small" variant="outline">{{ srv.type }}</Tag>
            </div>
            <Space size="small">
              <Tooltip content="编辑" placement="top">
                <Button size="small" variant="text" @click="openEditDialog(srv)">编辑</Button>
              </Tooltip>
              <Popconfirm content="确定删除此 MCP 配置？" @confirm="handleRemove(srv.name)">
                <Button size="small" variant="text" theme="danger">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </Space>
          </div>
        </template>
        <div class="oc-mcp-card-body">
          <div class="oc-mcp-info-row">
            <span class="oc-mcp-label">启动命令</span>
            <span class="oc-mcp-value mono">{{ srv.command || '未设置' }}</span>
          </div>
        </div>
      </Card>
    </div>

    <Dialog
      v-model:visible="addDialog"
      :header="editingServer ? '编辑 MCP' : '添加 MCP'"
      width="560px"
      :confirm-btn="{ content: '保存', theme: 'primary' }"
      @confirm="handleSave"
    >
      <div class="oc-mcp-form">
        <div class="oc-mcp-form-item">
          <label>MCP 名称</label>
          <Input v-model="form.name" :disabled="!!editingServer" placeholder="例如：filesystem、fetch" />
        </div>
        <div class="oc-mcp-form-item">
          <label>可执行文件（命令首段）</label>
          <Input v-model="form.command" placeholder="例如：npx、uvx、node" />
        </div>
        <div class="oc-mcp-form-item">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <label>参数列表</label>
            <Button size="small" variant="text" @click="addArg">
              <template #icon><AddIcon /></template> 添加
            </Button>
          </div>
          <div v-if="form.args.length === 0" class="oc-empty-hint">无参数</div>
          <div v-for="(arg, i) in form.args" :key="i" class="oc-mcp-arg-row">
            <Input v-model="form.args[i]" placeholder="参数" />
            <Button size="small" variant="text" theme="danger" @click="removeArg(i)">
              <template #icon><DeleteIcon /></template>
            </Button>
          </div>
        </div>
        <div class="oc-mcp-form-item">
          <label>
            <input type="checkbox" v-model="form.enabled" /> 启用
          </label>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.oc-mcp-form { display: flex; flex-direction: column; gap: 12px; }
.oc-mcp-form-item { display: flex; flex-direction: column; gap: 4px; }
.oc-mcp-form-item label { font-size: 13px; color: var(--td-text-color-secondary); }
.oc-mcp-arg-row { display: flex; gap: 4px; margin-bottom: 4px; align-items: center; }
.oc-empty-hint { font-size: 12px; color: var(--td-text-color-placeholder); padding: 8px 0; }
</style>
