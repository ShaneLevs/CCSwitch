<script setup>
import { ref, onMounted } from "vue";
import {
  Card, Empty, Button, Dialog, Input, MessagePlugin, Space, Tag, Popconfirm, Tooltip,
} from "tdesign-vue-next";
import { AddIcon, DeleteIcon, RefreshIcon, AppIcon, LinkIcon } from "tdesign-icons-vue-next";
import "./styles/PiPluginView.css";

const loading = ref(false);
const plugins = ref([]);
const addDialog = ref(false);
const newPluginName = ref("");

const loadPlugins = () => {
  try {
    const raw = window.services.getPiExtensions();
    plugins.value = raw.map(ext => ({ name: ext.name, source: ext.source, version: ext.version, description: ext.description, resources: ext.resources }));
  } catch (e) {
    console.error("加载 Pi 扩展失败:", e);
    plugins.value = [];
  }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadPlugins(); loading.value = false; }, 50);
};

const openAddDialog = () => {
  newPluginName.value = "";
  addDialog.value = true;
};

const installing = ref(false);

const handleAdd = async () => {
  const name = newPluginName.value.trim();
  if (!name) {
    MessagePlugin.warning("请输入扩展包名");
    return;
  }
  installing.value = true;
  try {
    let raw = name.replace(/^pi\s+(install\s+)?/i, '').trim()
    const source = raw.startsWith('npm:') || raw.startsWith('git:') || raw.startsWith('http') || raw.startsWith('ssh') || raw.startsWith('./')
      ? raw
      : `npm:${raw}`;
    const result = await window.services.installPiExtension(source);
    if (result.success) {
      MessagePlugin.success((result.message || '').trim() || '安装完成');
      addDialog.value = false;
      loadPlugins();
    } else {
      MessagePlugin.error("安装失败: " + (result.message || "未知错误"));
    }
  } catch (e) {
    MessagePlugin.error("安装失败: " + (e.stderr || e.message || "未知错误"));
  } finally {
    installing.value = false;
  }
};

const handleRemove = async (source) => {
  try {
    const result = await window.services.uninstallPiExtension(source);
    if (result.success) {
      MessagePlugin.success(result.message || "扩展已卸载");
      loadPlugins();
    } else {
      MessagePlugin.error("卸载失败: " + (result.message || "未知错误"));
    }
  } catch (e) {
    MessagePlugin.error("卸载失败: " + (e.stderr || e.message || "未知错误"));
  }
};

const openPiDevPackages = () => {
  try { window.utools.shellOpenExternal("https://pi.dev/packages"); } catch { }
};

const resourceBadges = [
  { key: "extensions", label: "扩展", color: "#1890ff" },
  { key: "skills", label: "Skills", color: "#f5222d" },
  { key: "mcpServers", label: "MCP", color: "#13c2c2" },
];

const formatSource = (src) => src ? src.replace(/^npm:/, '') : '';

onMounted(() => {
  setTimeout(() => { loadPlugins(); loading.value = false; }, 50);
});
</script>

<template>
  <div class="pi-plugin-container">
    <div class="pi-plugin-header">
      <div class="pi-plugin-header-left">
        <AppIcon size="18px" />
        <span class="pi-plugin-tip">Pi Agent 扩展（pi install npm:package）</span>
      </div>
      <div class="pi-plugin-actions">
        <Button size="small" variant="outline" @click="openAddDialog">
          <template #icon><AddIcon /></template> 添加扩展
        </Button>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template> 刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="plugins.length === 0" class="pi-plugin-empty">
      <Empty description="暂无已安装的 Pi 扩展">
        <template #action>
          <Button size="small" theme="primary" @click="openAddDialog">
            <template #icon><AddIcon /></template> 添加扩展
          </Button>
        </template>
      </Empty>
    </div>

    <div v-else class="pi-plugin-list">
      <Card v-for="p in plugins" :key="p.source" :bordered="true">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="pi-plugin-card-header">
              <span class="pi-plugin-name mono">{{ p.name }}</span>
              <Tag v-if="p.version" size="small" variant="light">{{ p.version }}</Tag>
              <Tag v-for="badge in resourceBadges" :key="badge.key"
                v-show="p.resources && p.resources[badge.key] && p.resources[badge.key].length"
                size="small"
                :style="{ background: badge.color + '18', color: badge.color, borderColor: badge.color + '40' }"
              >{{ badge.label }} {{ p.resources[badge.key].length }}</Tag>
            </div>
            <Space size="small">
              <Popconfirm content="确定卸载此扩展？" @confirm="handleRemove(p.source)">
                <Button size="small" variant="text" theme="danger">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </Space>
          </div>
        </template>
        <div class="pi-plugin-card-body">
          <p v-if="p.description" class="pi-plugin-desc">{{ p.description }}</p>
          <div class="pi-plugin-info-row">
            <span class="pi-plugin-label">来源</span>
            <span class="pi-plugin-value mono">{{ formatSource(p.source) }}</span>
          </div>
        </div>
      </Card>
    </div>

    <Dialog
      v-model:visible="addDialog"
      header="安装 Pi 扩展"
      width="520px"
      :confirm-btn="null"
      :cancel-btn="null"
      :close-on-overlay-click="false"
    >
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <label style="font-size:13px;color:var(--td-text-color-secondary);">扩展包名或来源</label>
          <Button size="small" variant="text" theme="primary" @click="openPiDevPackages">
            <template #icon><LinkIcon /></template> pi.dev/packages
          </Button>
        </div>
        <Input v-model="newPluginName" placeholder='例如：@hypabolic/pi-hypa 或 npm:@hypabolic/pi-hypa' :disabled="installing" />

        <div style="font-size:12px;color:var(--td-text-color-placeholder);margin-top:4px;">
          支持格式：<code>npm:package</code>、<code>git:github.com/user/repo</code>、<code>https://...</code>
        </div>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <Button variant="outline" :disabled="installing" @click="addDialog = false">取消</Button>
          <Button theme="primary" :loading="installing" @click="handleAdd">{{ installing ? '安装中...' : '安装' }}</Button>
        </div>
      </template>
    </Dialog>
  </div>
</template>
