<script setup>
import { ref, onMounted, computed, watch } from "vue";
import {
  Button,
  Input,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Popconfirm,
  Dropdown,
  DropdownMenu,
  DropdownItem,
  Textarea,
  List,
  ListItem,
  ListItemMeta,
  Collapse,
  CollapsePanel,
} from "tdesign-vue-next";
import {
  AddIcon,
  RefreshIcon,
  DownloadIcon,
  UploadIcon,
  CheckCircleIcon,
  EditIcon,
  DeleteIcon,
  ChartIcon,
  DashboardIcon,
  ServerIcon,
} from "tdesign-icons-vue-next";
import UsageView from "./UsageView.vue";
import McpView from "./McpView.vue";

const DB_PREFIX = "ccswitch_config_";
const activeTab = ref("config");

const currentConfig = ref({
  key: "",
  baseUrl: "",
  model: "",
  apiTimeoutMs: "",
  disableNonessentialTraffic: "",
  defaultHaikuModel: "",
  defaultSonnetModel: "",
  defaultOpusModel: "",
});
const savedConfigs = ref([]);
const showDialog = ref(false);
const editingConfig = ref(null);
const showImportStringDialog = ref(false);
const importString = ref("");
const showPreviewDialog = ref(false);
const previewConfig = ref(null);
const formData = ref({
  name: "",
  key: "",
  baseUrl: "",
  model: "",
  apiTimeoutMs: "",
  disableNonessentialTraffic: "",
  defaultHaikuModel: "",
  defaultSonnetModel: "",
  defaultOpusModel: "",
});

const dialogTitle = computed(() => (editingConfig.value ? "编辑配置" : "新建配置"));

const pageTitle = computed(() => {
  if (activeTab.value === 'usage') return 'Claude Code 使用统计';
  if (activeTab.value === 'mcp') return 'Claude Code MCP 配置';
  return 'Claude Code 配置切换';
});

const loadCurrentConfig = () => {
  const settings = window.services.readClaudeSettings();
  if (settings?.env) {
    currentConfig.value = {
      key: settings.env.ANTHROPIC_AUTH_TOKEN || "",
      baseUrl: settings.env.ANTHROPIC_BASE_URL || "",
      model: settings.env.ANTHROPIC_MODEL || "",
      apiTimeoutMs: settings.env.API_TIMEOUT_MS || "",
      disableNonessentialTraffic: settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || "",
      defaultHaikuModel: settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "",
      defaultSonnetModel: settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL || "",
      defaultOpusModel: settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "",
    };
  }
};

const loadSavedConfigs = () => {
  savedConfigs.value = window.utools.db
    .allDocs()
    .filter((d) => d._id.startsWith(DB_PREFIX))
    .map((d) => ({
      id: d._id,
      name: d.name,
      key: window.services.decryptKey(d.key),
      baseUrl: d.baseUrl,
      model: d.model,
      apiTimeoutMs: d.apiTimeoutMs || "",
      disableNonessentialTraffic: d.disableNonessentialTraffic || "",
      defaultHaikuModel: d.defaultHaikuModel || "",
      defaultSonnetModel: d.defaultSonnetModel || "",
      defaultOpusModel: d.defaultOpusModel || "",
      updatedAt: d.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

// 将配置按 key + baseUrl 分组
const groupedConfigs = computed(() => {
  const groups = new Map();
  savedConfigs.value.forEach(config => {
    const groupKey = `${config.key}|${config.baseUrl}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: config.key,
        baseUrl: config.baseUrl,
        configs: [],
      });
    }
    const group = groups.get(groupKey);
    group.configs.push(config);
  });
  // 每组按最新更新时间排序
  return Array.from(groups.values()).map(group => {
    group.configs.sort((a, b) => b.updatedAt - a.updatedAt);
    group.latestConfig = group.configs[0];
    return group;
  }).sort((a, b) => b.latestConfig.updatedAt - a.latestConfig.updatedAt);
});

const maskKey = (key) => {
  if (!key || key.length < 8) return key || "";
  return key.substring(0, 6) + "***" + key.substring(key.length - 4);
};

const openPreviewDialog = (config) => {
  previewConfig.value = config;
  showPreviewDialog.value = true;
};

const openCreateDialog = () => {
  editingConfig.value = null;
  formData.value = {
    name: "",
    key: "",
    baseUrl: "",
    model: "",
    apiTimeoutMs: "",
    disableNonessentialTraffic: "",
    defaultHaikuModel: "",
    defaultSonnetModel: "",
    defaultOpusModel: "",
  };
  showDialog.value = true;
};

const openEditDialog = (config) => {
  editingConfig.value = config;
  formData.value = {
    name: config.name,
    key: config.key,
    baseUrl: config.baseUrl,
    model: config.model,
    apiTimeoutMs: config.apiTimeoutMs || "",
    disableNonessentialTraffic: config.disableNonessentialTraffic || "",
    defaultHaikuModel: config.defaultHaikuModel || "",
    defaultSonnetModel: config.defaultSonnetModel || "",
    defaultOpusModel: config.defaultOpusModel || "",
  };
  showDialog.value = true;
};

const fillCurrentConfig = () => {
  formData.value.key = currentConfig.value.key;
  formData.value.baseUrl = currentConfig.value.baseUrl;
  formData.value.model = currentConfig.value.model;
  formData.value.apiTimeoutMs = currentConfig.value.apiTimeoutMs;
  formData.value.disableNonessentialTraffic = currentConfig.value.disableNonessentialTraffic;
  formData.value.defaultHaikuModel = currentConfig.value.defaultHaikuModel;
  formData.value.defaultSonnetModel = currentConfig.value.defaultSonnetModel;
  formData.value.defaultOpusModel = currentConfig.value.defaultOpusModel;
};

const saveConfig = () => {
  if (!formData.value.name.trim()) return MessagePlugin.warning("请输入配置名称");
  if (!formData.value.key.trim()) return MessagePlugin.warning("请输入 Key");
  if (!formData.value.baseUrl.trim()) return MessagePlugin.warning("请输入 URL");

  const now = Date.now();
  const id = editingConfig.value ? editingConfig.value.id : DB_PREFIX + now;
  const doc = {
    _id: id,
    name: formData.value.name.trim(),
    key: window.services.encryptKey(formData.value.key.trim()),
    baseUrl: formData.value.baseUrl.trim(),
    model: formData.value.model.trim(),
    apiTimeoutMs: formData.value.apiTimeoutMs.trim(),
    disableNonessentialTraffic: formData.value.disableNonessentialTraffic.trim(),
    defaultHaikuModel: formData.value.defaultHaikuModel.trim(),
    defaultSonnetModel: formData.value.defaultSonnetModel.trim(),
    defaultOpusModel: formData.value.defaultOpusModel.trim(),
    updatedAt: now,
  };
  if (editingConfig.value) doc._rev = window.utools.db.get(id)._rev;

  if (window.utools.db.put(doc).ok) {
    MessagePlugin.success(editingConfig.value ? "配置已更新" : "配置已保存");
    showDialog.value = false;
    loadSavedConfigs();
  } else {
    MessagePlugin.error("保存失败");
  }
};

const deleteConfig = (config) => {
  if (window.utools.db.remove(config.id).ok) {
    MessagePlugin.success("配置已删除");
    loadSavedConfigs();
  } else {
    MessagePlugin.error("删除失败");
  }
};

const switchConfig = (config) => {
  const settings = window.services.readClaudeSettings() || {};
  if (!settings.env) settings.env = {};

  // 只替换管理的字段，保留其他未管理的字段
  settings.env.ANTHROPIC_AUTH_TOKEN = config.key;
  settings.env.ANTHROPIC_BASE_URL = config.baseUrl;

  // 可选字段：有值则设置，无值则删除
  if (config.model?.trim()) {
    settings.env.ANTHROPIC_MODEL = config.model.trim();
  } else {
    delete settings.env.ANTHROPIC_MODEL;
  }
  if (config.apiTimeoutMs?.trim()) {
    settings.env.API_TIMEOUT_MS = config.apiTimeoutMs.trim();
  } else {
    delete settings.env.API_TIMEOUT_MS;
  }
  if (config.disableNonessentialTraffic?.trim()) {
    settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = config.disableNonessentialTraffic.trim();
  } else {
    delete settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
  }
  if (config.defaultHaikuModel?.trim()) {
    settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = config.defaultHaikuModel.trim();
  } else {
    delete settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  }
  if (config.defaultSonnetModel?.trim()) {
    settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = config.defaultSonnetModel.trim();
  } else {
    delete settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  }
  if (config.defaultOpusModel?.trim()) {
    settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = config.defaultOpusModel.trim();
  } else {
    delete settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  }

  if (window.services.writeClaudeSettings(settings)) {
    MessagePlugin.success("配置已切换");
    loadCurrentConfig();
  } else {
    MessagePlugin.error("切换失败");
  }
};

const isCurrentConfig = (config) =>
  config.key === currentConfig.value.key &&
  config.baseUrl === currentConfig.value.baseUrl &&
  (config.model || "") === (currentConfig.value.model || "") &&
  (config.apiTimeoutMs || "") === (currentConfig.value.apiTimeoutMs || "") &&
  (config.disableNonessentialTraffic || "") === (currentConfig.value.disableNonessentialTraffic || "") &&
  (config.defaultHaikuModel || "") === (currentConfig.value.defaultHaikuModel || "") &&
  (config.defaultSonnetModel || "") === (currentConfig.value.defaultSonnetModel || "") &&
  (config.defaultOpusModel || "") === (currentConfig.value.defaultOpusModel || "");

const handleExport = () => {
  if (!savedConfigs.value.length) return MessagePlugin.warning("没有可导出的配置");
  const filePath = window.utools.showSaveDialog({
    title: "导出配置",
    defaultPath: `ccswitch-configs-${new Date().toISOString().split("T")[0].replace(/-/g, "")}.json`,
    filters: [{ name: "JSON 文件", extensions: ["json"] }],
  });
  if (!filePath) return;
  window.services.exportConfigsToFile(
    filePath,
    savedConfigs.value.map((c) => ({
      name: c.name,
      key: window.services.encryptKey(c.key),
      baseUrl: c.baseUrl,
      model: c.model,
      apiTimeoutMs: c.apiTimeoutMs,
      disableNonessentialTraffic: c.disableNonessentialTraffic,
      defaultHaikuModel: c.defaultHaikuModel,
      defaultSonnetModel: c.defaultSonnetModel,
      defaultOpusModel: c.defaultOpusModel,
    }))
  );
  MessagePlugin.success("配置已导出");
};

const handleImport = () => {
  const filePaths = window.utools.showOpenDialog({ title: "导入配置", filters: [{ name: "JSON 文件", extensions: ["json"] }], properties: ["openFile"] });
  if (!filePaths?.length) return;
  const data = window.services.importConfigsFromFile(filePaths[0]);
  if (!data || data.app !== "ccswitch" || !Array.isArray(data.configs)) return MessagePlugin.error("文件格式不正确");

  let ok = 0, fail = 0;
  for (const c of data.configs) {
    if (!c.name || !c.key) { fail++; continue; }
    const doc = {
      _id: DB_PREFIX + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
      name: c.name.trim(),
      key: window.services.encryptKey(window.services.decryptKey(c.key)),
      baseUrl: c.baseUrl?.trim() || "",
      model: c.model?.trim() || "",
      apiTimeoutMs: c.apiTimeoutMs?.trim() || "",
      disableNonessentialTraffic: c.disableNonessentialTraffic?.trim() || "",
      defaultHaikuModel: c.defaultHaikuModel?.trim() || "",
      defaultSonnetModel: c.defaultSonnetModel?.trim() || "",
      defaultOpusModel: c.defaultOpusModel?.trim() || "",
      updatedAt: Date.now(),
    };
    window.utools.db.put(doc).ok ? ok++ : fail++;
  }
  loadSavedConfigs();
  ok > 0 && fail === 0 ? MessagePlugin.success(`成功导入 ${ok} 个配置`) : ok > 0 ? MessagePlugin.warning(`成功导入 ${ok} 个，失败 ${fail} 个`) : MessagePlugin.error("导入失败");
};

const handleExportAsString = () => {
  if (!savedConfigs.value.length) return MessagePlugin.warning("没有可导出的配置");
  const keyDict = new Map(), urlDict = new Map(), list = [];
  savedConfigs.value.forEach((c, i) => {
    const idx = i + 1, cfg = {};
    cfg[`n${idx}`] = c.name;
    if (keyDict.has(c.key)) { cfg[`k${idx}`] = `k${keyDict.get(c.key)}`; } else { cfg[`k${idx}`] = c.key; keyDict.set(c.key, idx); }
    if (urlDict.has(c.baseUrl)) { cfg[`u${idx}`] = `u${urlDict.get(c.baseUrl)}`; } else { cfg[`u${idx}`] = c.baseUrl; urlDict.set(c.baseUrl, idx); }
    if (c.model) cfg[`m${idx}`] = c.model;
    if (c.apiTimeoutMs) cfg[`t${idx}`] = c.apiTimeoutMs;
    if (c.disableNonessentialTraffic) cfg[`d${idx}`] = c.disableNonessentialTraffic;
    if (c.defaultHaikuModel) cfg[`h${idx}`] = c.defaultHaikuModel;
    if (c.defaultSonnetModel) cfg[`s${idx}`] = c.defaultSonnetModel;
    if (c.defaultOpusModel) cfg[`o${idx}`] = c.defaultOpusModel;
    list.push(cfg);
  });
  window.utools.copyText(window.services.encryptString(window.services.compressConfigs(list)));
  MessagePlugin.success("配置已复制到剪贴板");
};

const openImportStringDialog = () => { importString.value = ""; showImportStringDialog.value = true; };

const handleImportFromString = () => {
  const str = importString.value.trim();
  if (!str) return MessagePlugin.warning("请输入配置字符串");
  const decompressed = window.services.decompressConfigs(window.services.decryptString(str));
  if (!decompressed || !Array.isArray(decompressed)) return MessagePlugin.error("配置字符串格式不正确");

  const configs = [], keyMap = new Map(), urlMap = new Map();
  decompressed.forEach((raw, i) => {
    const idx = i + 1;
    let key = raw[`k${idx}`], url = raw[`u${idx}`];
    if (typeof key === "string" && /^k\d+$/.test(key)) { key = keyMap.get(parseInt(key.substring(1))); } else { keyMap.set(idx, key); }
    if (typeof url === "string" && /^u\d+$/.test(url)) { url = urlMap.get(parseInt(url.substring(1))); } else { urlMap.set(idx, url); }
    configs.push({
      name: raw[`n${idx}`],
      key,
      baseUrl: url,
      model: raw[`m${idx}`],
      apiTimeoutMs: raw[`t${idx}`],
      disableNonessentialTraffic: raw[`d${idx}`],
      defaultHaikuModel: raw[`h${idx}`],
      defaultSonnetModel: raw[`s${idx}`],
      defaultOpusModel: raw[`o${idx}`],
    });
  });

  let ok = 0, fail = 0;
  for (const c of configs) {
    if (!c.name || !c.key) { fail++; continue; }
    const doc = {
      _id: DB_PREFIX + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
      name: c.name.trim(),
      key: window.services.encryptKey(c.key),
      baseUrl: c.baseUrl?.trim() || "",
      model: c.model?.trim() || "",
      apiTimeoutMs: c.apiTimeoutMs?.trim() || "",
      disableNonessentialTraffic: c.disableNonessentialTraffic?.trim() || "",
      defaultHaikuModel: c.defaultHaikuModel?.trim() || "",
      defaultSonnetModel: c.defaultSonnetModel?.trim() || "",
      defaultOpusModel: c.defaultOpusModel?.trim() || "",
      updatedAt: Date.now(),
    };
    window.utools.db.put(doc).ok ? ok++ : fail++;
  }
  loadSavedConfigs();
  showImportStringDialog.value = false;
  ok > 0 && fail === 0 ? MessagePlugin.success(`成功导入 ${ok} 个配置`) : ok > 0 ? MessagePlugin.warning(`成功导入 ${ok} 个，失败 ${fail} 个`) : MessagePlugin.error("导入失败");
};

onMounted(() => { loadCurrentConfig(); loadSavedConfigs(); });
</script>

<template>
  <div class="container">
    <div class="header">
      <div class="header-left">
        <img src="/logo.png" alt="logo" class="logo" />
        <t-typography-title level="h5">{{ pageTitle }}</t-typography-title>
      </div>
      <div class="header-right">
        <div class="tab-buttons">
          <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
            <template #icon><DashboardIcon /></template> 配置管理
          </Button>
          <Button size="small" :theme="activeTab === 'mcp' ? 'primary' : 'default'" :variant="activeTab === 'mcp' ? 'base' : 'outline'" @click="activeTab = 'mcp'">
            <template #icon><ServerIcon /></template> MCP
          </Button>
          <Button size="small" :theme="activeTab === 'usage' ? 'primary' : 'default'" :variant="activeTab === 'usage' ? 'base' : 'outline'" @click="activeTab = 'usage'">
            <template #icon><ChartIcon /></template> 使用统计
          </Button>
        </div>
      </div>
    </div>

    <!-- 配置管理 -->
    <template v-if="activeTab === 'config'">
      <div class="section-header">
        <Space size="small">
          <Dropdown>
            <template #dropdown><DropdownMenu><DropdownItem @click="handleExport">导出到文件</DropdownItem><DropdownItem @click="handleExportAsString">复制配置</DropdownItem></DropdownMenu></template>
            <Button size="small" variant="outline"><template #icon><DownloadIcon /></template> 导出</Button>
          </Dropdown>
          <Dropdown>
            <template #dropdown><DropdownMenu><DropdownItem @click="handleImport">从文件导入</DropdownItem><DropdownItem @click="openImportStringDialog">从字符串导入</DropdownItem></DropdownMenu></template>
            <Button size="small" variant="outline"><template #icon><UploadIcon /></template> 导入</Button>
          </Dropdown>
          <Button size="small" theme="primary" @click="openCreateDialog"><template #icon><AddIcon /></template> 新建配置</Button>
        </Space>
      </div>

      <div v-if="!savedConfigs.length" class="empty-state"><Empty description="暂无保存的配置方案" /></div>

      <div v-else class="config-groups">
        <div v-for="(group, gIdx) in groupedConfigs" :key="gIdx" class="config-group">
          <div class="group-header">
            <span class="group-url">{{ group.baseUrl }}</span>
          </div>
          <div class="group-items">
            <div v-for="config in group.configs" :key="config.id + '-' + (isCurrentConfig(config) ? 'cur' : 'other')" class="config-item clickable" @click="openPreviewDialog(config)">
              <div class="config-item-left">
                <span class="config-name">{{ config.name }}</span>
                <span v-if="config.model" class="config-model">{{ config.model }}</span>
              </div>
              <Space size="small" :key="config.id + '-actions'" @click.stop>
                <Tag v-if="isCurrentConfig(config)" theme="success" variant="light" size="small">当前</Tag>
                <Button size="small" theme="primary" variant="text" @click="switchConfig(config)" :disabled="isCurrentConfig(config)" title="切换配置"><CheckCircleIcon /></Button>
                <Button size="small" theme="default" variant="text" @click="openEditDialog(config)" title="编辑"><EditIcon /></Button>
                <Popconfirm theme="danger" content="确定要删除这个配置吗？" @confirm="deleteConfig(config)">
                  <Button size="small" theme="danger" variant="text" title="删除"><DeleteIcon /></Button>
                </Popconfirm>
              </Space>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 使用统计 -->
    <UsageView v-else-if="activeTab === 'usage'" />

    <!-- MCP 配置 -->
    <McpView v-else-if="activeTab === 'mcp'" />

    <Dialog v-model:visible="showDialog" :header="dialogTitle" @confirm="saveConfig" width="560px">
      <div class="form">
        <div class="form-item"><label>配置名称 <span class="required">*</span></label><Input v-model="formData.name" placeholder="方便分辨的名字" /></div>
        <div class="form-item"><label>ANTHROPIC_AUTH_TOKEN <span class="required">*</span></label><Input v-model="formData.key" type="password" placeholder="sk-ant-..." /></div>
        <div class="form-item"><label>ANTHROPIC_BASE_URL <span class="required">*</span></label><Input v-model="formData.baseUrl" placeholder="https://api.anthropic.com" /></div>
        <div class="form-item"><label>ANTHROPIC_MODEL</label><Input v-model="formData.model" placeholder="claude-sonnet-4-20250514" /></div>
        <Collapse class="advanced-collapse">
          <CollapsePanel header="高级配置" value="advanced">
            <div class="form-item"><label>API_TIMEOUT_MS</label><Input v-model="formData.apiTimeoutMs" placeholder="60000" /></div>
            <div class="form-item"><label>CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC</label><Input v-model="formData.disableNonessentialTraffic" placeholder="1" /></div>
            <div class="form-item"><label>ANTHROPIC_DEFAULT_HAIKU_MODEL</label><Input v-model="formData.defaultHaikuModel" placeholder="claude-haiku-4-20250514" /></div>
            <div class="form-item"><label>ANTHROPIC_DEFAULT_SONNET_MODEL</label><Input v-model="formData.defaultSonnetModel" placeholder="claude-sonnet-4-20250514" /></div>
            <div class="form-item"><label>ANTHROPIC_DEFAULT_OPUS_MODEL</label><Input v-model="formData.defaultOpusModel" placeholder="claude-opus-4-20250514" /></div>
          </CollapsePanel>
        </Collapse>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <Button variant="outline" @click="fillCurrentConfig"><template #icon><RefreshIcon /></template> 读取当前配置</Button>
          <div class="dialog-footer-right"><Button variant="outline" @click="showDialog = false">取消</Button><Button theme="primary" @click="saveConfig">保存</Button></div>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="showImportStringDialog" header="从字符串导入" @confirm="handleImportFromString" width="480px">
      <div class="form"><div class="form-item"><label>配置字符串</label><Textarea v-model="importString" placeholder="粘贴配置字符串" :autosize="{ minRows: 4, maxRows: 8 }" /></div></div>
    </Dialog>

    <Dialog v-model:visible="showPreviewDialog" header="配置详情" width="560px" :footer="false">
      <div v-if="previewConfig" class="preview-content">
        <div class="preview-item"><span class="preview-label">配置名称</span><span class="preview-value">{{ previewConfig.name }}</span></div>
        <div class="preview-item"><span class="preview-label">ANTHROPIC_AUTH_TOKEN</span><span class="preview-value">{{ maskKey(previewConfig.key) || "未设置" }}</span></div>
        <div class="preview-item"><span class="preview-label">ANTHROPIC_BASE_URL</span><span class="preview-value">{{ previewConfig.baseUrl || "未设置" }}</span></div>
        <div class="preview-item"><span class="preview-label">ANTHROPIC_MODEL</span><span class="preview-value">{{ previewConfig.model || "未设置" }}</span></div>
        <Collapse class="preview-collapse">
          <CollapsePanel header="高级配置" value="advanced">
            <div class="preview-item"><span class="preview-label">API_TIMEOUT_MS</span><span class="preview-value">{{ previewConfig.apiTimeoutMs || "未设置" }}</span></div>
            <div class="preview-item"><span class="preview-label">CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC</span><span class="preview-value">{{ previewConfig.disableNonessentialTraffic || "未设置" }}</span></div>
            <div class="preview-item"><span class="preview-label">ANTHROPIC_DEFAULT_HAIKU_MODEL</span><span class="preview-value">{{ previewConfig.defaultHaikuModel || "未设置" }}</span></div>
            <div class="preview-item"><span class="preview-label">ANTHROPIC_DEFAULT_SONNET_MODEL</span><span class="preview-value">{{ previewConfig.defaultSonnetModel || "未设置" }}</span></div>
            <div class="preview-item"><span class="preview-label">ANTHROPIC_DEFAULT_OPUS_MODEL</span><span class="preview-value">{{ previewConfig.defaultOpusModel || "未设置" }}</span></div>
          </CollapsePanel>
        </Collapse>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.container { padding: 20px; min-height: 100vh; background: var(--td-bg-color-container); }
.header { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 12px; }
.header-right { display: flex; align-items: center; }
.header .logo { width: 32px; height: 32px; border-radius: 6px; }
.header :deep(.t-typography-title) { margin: 0; }
.tab-buttons { display: flex; gap: 4px; }
.section-header { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 16px; }
.section-header :deep(.t-typography-title) { margin: 0; }
.empty-state { padding: 40px 0; }

/* 配置分组样式 */
.config-groups { display: flex; flex-direction: column; gap: 12px; }
.config-group { background: var(--td-bg-color-container); border-radius: 8px; overflow: hidden; border: 1px solid var(--td-component-border); }
.group-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--td-bg-color-container-hover); border-bottom: 1px solid var(--td-component-border); }
.group-url { font-size: 13px; color: var(--td-text-color-primary); font-family: monospace; }
.group-items { padding: 8px 0; }
.config-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; }
.config-item:hover { background: var(--td-bg-color-container-hover); }
.config-item.clickable { cursor: pointer; }
.config-item.clickable:hover .config-name { color: var(--td-brand-color); }
.config-item-left { display: flex; align-items: center; gap: 12px; }
.config-name { font-size: 14px; font-weight: 500; color: var(--td-text-color-primary); }
.config-model { font-size: 12px; color: var(--td-text-color-placeholder); font-family: monospace; }

/* 预览弹窗样式 */
.preview-content { display: flex; flex-direction: column; gap: 12px; }
.preview-item { display: flex; gap: 16px; }
.preview-label { color: var(--td-text-color-secondary); min-width: 220px; font-size: 14px; }
.preview-value { color: var(--td-text-color-primary); word-break: break-all; font-size: 14px; }
.preview-collapse { margin-top: 4px; }
.preview-collapse :deep(.t-collapse-panel__content) { padding: 12px 16px; background: var(--td-bg-color-container-hover); border-radius: 6px; }
.preview-collapse :deep(.t-collapse-panel__content) .preview-item { margin-bottom: 12px; }
.preview-collapse :deep(.t-collapse-panel__content) .preview-item:last-child { margin-bottom: 0; }

.form { display: flex; flex-direction: column; gap: 16px; }
.form-item { display: flex; flex-direction: column; gap: 8px; }
.form-item label { font-size: 14px; color: var(--td-text-color-primary); }
.form-item .required { color: var(--td-error-color); }
.advanced-collapse { margin-top: 8px; }
.advanced-collapse :deep(.t-collapse-panel__content) { padding: 16px; background: var(--td-bg-color-container-hover); border-radius: 6px; }
.advanced-collapse :deep(.t-collapse-panel__content) .form-item { margin-bottom: 16px; }
.advanced-collapse :deep(.t-collapse-panel__content) .form-item:last-child { margin-bottom: 0; }
.dialog-footer { display: flex; justify-content: space-between; align-items: center; }
.dialog-footer-right { display: flex; gap: 8px; }
</style>
