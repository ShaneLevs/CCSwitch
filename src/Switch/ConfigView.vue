<script setup>
import { ref, onMounted, computed } from "vue";
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
  Tabs,
  TabPanel,
} from "tdesign-vue-next";
import {
  AddIcon,
  RefreshIcon,
  DownloadIcon,
  UploadIcon,
  CheckCircleIcon,
  EditIcon,
  DeleteIcon,
  SettingIcon,
} from "tdesign-icons-vue-next";

const DB_PREFIX = "ccswitch_config_";

const currentConfig = ref({
  key: "",
  baseUrl: "",
  model: "",
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
const showExtraFieldsDialog = ref(false);
const extraFields = ref([]);
const formTab = ref("fixed");
const managedFields = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
];
const formData = ref({
  name: "",
  key: "",
  baseUrl: "",
  model: "",
  defaultHaikuModel: "",
  defaultSonnetModel: "",
  defaultOpusModel: "",
});

const dialogTitle = computed(() => (editingConfig.value ? "编辑配置" : "新建配置"));

const loadCurrentConfig = () => {
  const settings = window.services.readClaudeSettings();
  if (settings?.env) {
    currentConfig.value = {
      key: settings.env.ANTHROPIC_AUTH_TOKEN || "",
      baseUrl: settings.env.ANTHROPIC_BASE_URL || "",
      model: settings.env.ANTHROPIC_MODEL || "",
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
    .map((d) => {
      // 检查是否有需要清理的老字段
      const hasOldFields = d.apiTimeoutMs !== undefined || d.disableNonessentialTraffic !== undefined;
      if (hasOldFields) {
        const cleanDoc = {
          _id: d._id,
          _rev: d._rev,
          name: d.name,
          key: d.key,
          baseUrl: d.baseUrl,
          model: d.model,
          defaultHaikuModel: d.defaultHaikuModel || "",
          defaultSonnetModel: d.defaultSonnetModel || "",
          defaultOpusModel: d.defaultOpusModel || "",
          updatedAt: d.updatedAt,
        };
        window.utools.db.put(cleanDoc);
      }
      return {
        id: d._id,
        name: d.name,
        key: window.services.decryptKey(d.key),
        baseUrl: d.baseUrl,
        model: d.model,
        defaultHaikuModel: d.defaultHaikuModel || "",
        defaultSonnetModel: d.defaultSonnetModel || "",
        defaultOpusModel: d.defaultOpusModel || "",
        updatedAt: d.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

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
    defaultHaikuModel: "",
    defaultSonnetModel: "",
    defaultOpusModel: "",
  };
  formTab.value = "fixed";
  showDialog.value = true;
};

const openEditDialog = (config) => {
  editingConfig.value = config;
  formData.value = {
    name: config.name,
    key: config.key,
    baseUrl: config.baseUrl,
    model: config.model,
    defaultHaikuModel: config.defaultHaikuModel || "",
    defaultSonnetModel: config.defaultSonnetModel || "",
    defaultOpusModel: config.defaultOpusModel || "",
  };
  formTab.value = "fixed";
  showDialog.value = true;
};

const fillCurrentConfig = () => {
  formData.value.key = currentConfig.value.key;
  formData.value.baseUrl = currentConfig.value.baseUrl;
  formData.value.model = currentConfig.value.model;
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

  settings.env.ANTHROPIC_AUTH_TOKEN = config.key;
  settings.env.ANTHROPIC_BASE_URL = config.baseUrl;

  if (config.model?.trim()) {
    settings.env.ANTHROPIC_MODEL = config.model.trim();
  } else {
    delete settings.env.ANTHROPIC_MODEL;
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

const openExtraFieldsDialog = () => {
  const settings = window.services.readClaudeSettings() || {};
  const env = settings.env || {};
  extraFields.value = [];

  Object.keys(env).forEach(key => {
    if (!managedFields.includes(key)) {
      extraFields.value.push({ key, value: String(env[key]) });
    }
  });

  showExtraFieldsDialog.value = true;
};

const addExtraField = () => {
  extraFields.value.push({ key: '', value: '' });
};

const removeExtraField = (idx) => {
  extraFields.value.splice(idx, 1);
};

const saveExtraFields = () => {
  const settings = window.services.readClaudeSettings() || {};
  if (!settings.env) settings.env = {};

  Object.keys(settings.env).forEach(key => {
    if (!managedFields.includes(key)) {
      delete settings.env[key];
    }
  });

  extraFields.value.forEach(field => {
    const key = field.key.trim();
    const value = field.value.trim();
    if (key) {
      settings.env[key] = value;
    }
  });

  if (window.services.writeClaudeSettings(settings)) {
    MessagePlugin.success("全局设置已保存");
    showExtraFieldsDialog.value = false;
    loadCurrentConfig();
  } else {
    MessagePlugin.error("保存失败");
  }
};

onMounted(() => { loadCurrentConfig(); loadSavedConfigs(); });
</script>

<template>
  <div class="config-view">
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

    <!-- 当前配置展示 -->
    <div class="current-config-card">
      <div class="current-config-header">
        <span class="current-config-title">当前生效配置</span>
        <Button size="small" theme="primary" variant="text" @click="openExtraFieldsDialog"><template #icon><SettingIcon /></template> 全局设置</Button>
      </div>
      <div class="current-config-content">
        <div class="current-config-item">
          <span class="current-config-label">AUTH_TOKEN</span>
          <span class="current-config-value">{{ maskKey(currentConfig.key) || '未设置' }}</span>
        </div>
        <div class="current-config-item">
          <span class="current-config-label">BASE_URL</span>
          <span class="current-config-value">{{ currentConfig.baseUrl || '未设置' }}</span>
        </div>
        <div v-if="currentConfig.model" class="current-config-item">
          <span class="current-config-label">MODEL</span>
          <span class="current-config-value">{{ currentConfig.model }}</span>
        </div>
        <div v-if="currentConfig.defaultHaikuModel" class="current-config-item">
          <span class="current-config-label">HAIKU_MODEL</span>
          <span class="current-config-value">{{ currentConfig.defaultHaikuModel }}</span>
        </div>
        <div v-if="currentConfig.defaultSonnetModel" class="current-config-item">
          <span class="current-config-label">SONNET_MODEL</span>
          <span class="current-config-value">{{ currentConfig.defaultSonnetModel }}</span>
        </div>
        <div v-if="currentConfig.defaultOpusModel" class="current-config-item">
          <span class="current-config-label">OPUS_MODEL</span>
          <span class="current-config-value">{{ currentConfig.defaultOpusModel }}</span>
        </div>
      </div>
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

    <Dialog v-model:visible="showDialog" :header="dialogTitle" @confirm="saveConfig" width="560px">
      <div class="form">
        <div class="form-item"><label>配置名称 <span class="required">*</span></label><Input v-model="formData.name" placeholder="方便分辨的名字" /></div>
        <div class="form-item"><label>ANTHROPIC_AUTH_TOKEN <span class="required">*</span></label><Input v-model="formData.key" type="password" placeholder="sk-ant-..." /></div>
        <div class="form-item"><label>ANTHROPIC_BASE_URL <span class="required">*</span></label><Input v-model="formData.baseUrl" placeholder="https://api.anthropic.com" /></div>
        <Tabs v-model="formTab" class="form-tabs">
          <TabPanel value="fixed" label="固定模型">
            <div class="form-item"><label>ANTHROPIC_MODEL</label><Input v-model="formData.model" placeholder="claude-sonnet-4-20250514" /></div>
          </TabPanel>
          <TabPanel value="mapping" label="模型映射">
            <div class="form-item"><label>ANTHROPIC_DEFAULT_HAIKU_MODEL</label><Input v-model="formData.defaultHaikuModel" placeholder="claude-haiku-4-20250514" /></div>
            <div class="form-item"><label>ANTHROPIC_DEFAULT_SONNET_MODEL</label><Input v-model="formData.defaultSonnetModel" placeholder="claude-sonnet-4-20250514" /></div>
            <div class="form-item"><label>ANTHROPIC_DEFAULT_OPUS_MODEL</label><Input v-model="formData.defaultOpusModel" placeholder="claude-opus-4-20250514" /></div>
          </TabPanel>
        </Tabs>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <Button variant="outline" @click="fillCurrentConfig"><template #icon><RefreshIcon /></template> 读取当前配置</Button>
          <div class="dialog-footer-right"><Button variant="outline" @click="showDialog = false">取消</Button><Button theme="primary" @click="saveConfig">保存</Button></div>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="showImportStringDialog" header="从字符串导入" @confirm="handleImportFromString" width="480px">
      <div class="form"><div class="form-item"><label>配置字符串</label><Textarea v-if="showImportStringDialog" v-model="importString" placeholder="粘贴配置字符串" :autosize="{ minRows: 4, maxRows: 8 }" /></div></div>
    </Dialog>

    <Dialog v-model:visible="showPreviewDialog" header="配置详情" width="560px" :footer="false">
      <div v-if="previewConfig" class="preview-content">
        <div class="preview-item"><span class="preview-label">配置名称</span><span class="preview-value">{{ previewConfig.name }}</span></div>
        <div class="preview-item"><span class="preview-label">AUTH_TOKEN</span><span class="preview-value">{{ maskKey(previewConfig.key) || "未设置" }}</span></div>
        <div class="preview-item"><span class="preview-label">BASE_URL</span><span class="preview-value">{{ previewConfig.baseUrl || "未设置" }}</span></div>
        <div class="preview-item"><span class="preview-label">MODEL</span><span class="preview-value">{{ previewConfig.model || "未设置" }}</span></div>
        <div v-if="previewConfig.defaultHaikuModel || previewConfig.defaultSonnetModel || previewConfig.defaultOpusModel" class="preview-divider"></div>
        <div v-if="previewConfig.defaultHaikuModel" class="preview-item"><span class="preview-label">HAIKU_MODEL</span><span class="preview-value">{{ previewConfig.defaultHaikuModel }}</span></div>
        <div v-if="previewConfig.defaultSonnetModel" class="preview-item"><span class="preview-label">SONNET_MODEL</span><span class="preview-value">{{ previewConfig.defaultSonnetModel }}</span></div>
        <div v-if="previewConfig.defaultOpusModel" class="preview-item"><span class="preview-label">OPUS_MODEL</span><span class="preview-value">{{ previewConfig.defaultOpusModel }}</span></div>
      </div>
    </Dialog>

    <Dialog v-model:visible="showExtraFieldsDialog" header="全局设置（额外字段）" width="600px" @confirm="saveExtraFields">
      <div class="extra-fields-dialog">
        <div class="extra-fields-hint">
          <p>这些字段保存在 settings.json 的 env 中，不随配置切换而改变。</p>
          <p>例如：API_TIMEOUT_MS、CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC、CLAUDE_CODE_NO_FLICKER</p>
        </div>
        <div class="extra-fields-list">
          <div v-for="(field, idx) in extraFields" :key="idx" class="extra-field-item">
            <Input v-model="field.key" class="field-key" placeholder="字段名（如 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC）" />
            <Input v-model="field.value" class="field-value" placeholder="字段值" />
            <Button size="small" theme="danger" variant="text" @click="removeExtraField(idx)"><DeleteIcon /></Button>
          </div>
        </div>
        <Button size="small" variant="outline" @click="addExtraField" class="add-field-btn"><template #icon><AddIcon /></template> 添加字段</Button>
      </div>
      <template #footer>
        <Button variant="outline" @click="showExtraFieldsDialog = false">取消</Button>
        <Button theme="primary" @click="saveExtraFields">保存</Button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.config-view { display: flex; flex-direction: column; }
.section-header { display: flex; justify-content: flex-end; align-items: center; margin-bottom: 16px; }
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
.preview-label { color: var(--td-text-color-secondary); min-width: 120px; font-size: 14px; }
.preview-value { color: var(--td-text-color-primary); word-break: break-all; font-size: 14px; }
.preview-divider { margin: 8px 0; border-top: 1px solid var(--td-component-border); }

/* 当前配置展示 */
.current-config-card { margin-bottom: 16px; padding: 16px; background: var(--td-bg-color-container); border-radius: 8px; border: 1px solid var(--td-component-border); }
.current-config-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.current-config-title { font-size: 14px; font-weight: 500; color: var(--td-text-color-primary); }
.current-config-content { display: flex; flex-direction: column; gap: 8px; }
.current-config-item { display: flex; gap: 16px; font-size: 13px; }
.current-config-label { color: var(--td-text-color-secondary); min-width: 120px; }
.current-config-value { color: var(--td-text-color-primary); word-break: break-all; }

/* 额外字段弹窗样式 */
.extra-fields-dialog { display: flex; flex-direction: column; gap: 16px; }
.extra-fields-hint { padding: 12px 16px; background: var(--td-bg-color-container-hover); border-radius: 6px; font-size: 13px; color: var(--td-text-color-secondary); }
.extra-fields-hint p { margin: 0 0 4px 0; }
.extra-fields-hint p:last-child { margin-bottom: 0; }
.extra-fields-list { display: flex; flex-direction: column; gap: 12px; }
.extra-field-item { display: flex; gap: 8px; align-items: center; }
.extra-field-item .field-key { flex: 1; }
.extra-field-item .field-value { flex: 0 0 140px; }
.add-field-btn { align-self: flex-start; }

/* 表单样式 */
.form { display: flex; flex-direction: column; gap: 16px; }
.form-item { display: flex; flex-direction: column; gap: 8px; }
.form-item label { font-size: 14px; color: var(--td-text-color-primary); }
.form-item .required { color: var(--td-error-color); }
.form-tabs { margin-top: 8px; }
.form-tabs :deep(.t-tab-panel) { padding: 16px 0 0 0; }
.form-tabs :deep(.t-tab-panel) .form-item { margin-bottom: 16px; }
.form-tabs :deep(.t-tab-panel) .form-item:last-child { margin-bottom: 0; }
.dialog-footer { display: flex; justify-content: space-between; align-items: center; }
.dialog-footer-right { display: flex; gap: 8px; }
</style>