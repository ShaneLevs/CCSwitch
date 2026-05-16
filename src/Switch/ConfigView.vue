<script setup>
import { ref, onMounted, computed } from "vue";
import {
  Button,
  Input,
  AutoComplete,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Popconfirm,
  Textarea,
  Tooltip,
} from "tdesign-vue-next";
import {
  AddIcon,
  RefreshIcon,
  DownloadIcon,
  UploadIcon,
  PlayIcon,
  PauseIcon,
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
  subagentModel: "",
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
const SAVED_FIELD_KEYS_ID = "extra_field_keys";
const fixedFieldKeyOptions = [
  "API_TIMEOUT_MS",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "CLAUDE_CODE_NO_FLICKER",
  "CLAUDE_CODE_EFFORT_LEVEL",
  "CLAUDE_CODE_ATTRIBUTION_HEADER",
];
const savedExtraFieldKeys = ref([]);
const extraFieldKeyOptions = computed(() => {
  const all = [...fixedFieldKeyOptions, ...savedExtraFieldKeys.value];
  const unique = [...new Set(all)];
  return unique.map(k => ({ label: k, value: k }));
});
const loadExtraFieldKeys = () => {
  const doc = window.utools.db.get(SAVED_FIELD_KEYS_ID);
  savedExtraFieldKeys.value = doc?.keys || [];
};

const managedFields = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
];
const formData = ref({
  name: "",
  key: "",
  baseUrl: "",
  model: "",
  defaultHaikuModel: "",
  defaultSonnetModel: "",
  defaultOpusModel: "",
  subagentModel: "",
});

const dialogTitle = computed(() => (editingConfig.value ? "编辑配置" : "新建配置"));

const hasModelFields = computed(() =>
  currentConfig.value.model || currentConfig.value.defaultHaikuModel ||
  currentConfig.value.defaultSonnetModel || currentConfig.value.defaultOpusModel ||
  currentConfig.value.subagentModel
);

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
      subagentModel: settings.env.CLAUDE_CODE_SUBAGENT_MODEL || "",
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
          subagentModel: d.subagentModel || "",
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
        subagentModel: d.subagentModel || "",
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
    subagentModel: "",
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
    defaultHaikuModel: config.defaultHaikuModel || "",
    defaultSonnetModel: config.defaultSonnetModel || "",
    defaultOpusModel: config.defaultOpusModel || "",
    subagentModel: config.subagentModel || "",
  };
  showDialog.value = true;
};

const fillCurrentConfig = () => {
  formData.value.key = currentConfig.value.key;
  formData.value.baseUrl = currentConfig.value.baseUrl;
  formData.value.model = currentConfig.value.model;
  formData.value.defaultHaikuModel = currentConfig.value.defaultHaikuModel;
  formData.value.defaultSonnetModel = currentConfig.value.defaultSonnetModel;
  formData.value.defaultOpusModel = currentConfig.value.defaultOpusModel;
  formData.value.subagentModel = currentConfig.value.subagentModel;
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
    subagentModel: formData.value.subagentModel.trim(),
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
  if (config.subagentModel?.trim()) {
    settings.env.CLAUDE_CODE_SUBAGENT_MODEL = config.subagentModel.trim();
  } else {
    delete settings.env.CLAUDE_CODE_SUBAGENT_MODEL;
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
  (config.defaultOpusModel || "") === (currentConfig.value.defaultOpusModel || "") &&
  (config.subagentModel || "") === (currentConfig.value.subagentModel || "");

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
    if (c.subagentModel) cfg[`g${idx}`] = c.subagentModel;
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
      subagentModel: raw[`g${idx}`],
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
      subagentModel: c.subagentModel?.trim() || "",
      updatedAt: Date.now(),
    };
    window.utools.db.put(doc).ok ? ok++ : fail++;
  }
  loadSavedConfigs();
  showImportStringDialog.value = false;
  ok > 0 && fail === 0 ? MessagePlugin.success(`成功导入 ${ok} 个配置`) : ok > 0 ? MessagePlugin.warning(`成功导入 ${ok} 个，失败 ${fail} 个`) : MessagePlugin.error("导入失败");
};

const openExtraFieldsDialog = () => {
  loadExtraFieldKeys();
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

  const userKeys = [];
  extraFields.value.forEach(field => {
    const key = field.key.trim();
    const value = field.value.trim();
    if (key) {
      settings.env[key] = value;
      if (!fixedFieldKeyOptions.includes(key)) {
        userKeys.push(key);
      }
    }
  });

  // Save user-entered keys to db (merge with existing)
  const existing = savedExtraFieldKeys.value;
  const merged = [...new Set([...existing, ...userKeys])];
  const doc = { _id: SAVED_FIELD_KEYS_ID, keys: merged };
  const existingDoc = window.utools.db.get(SAVED_FIELD_KEYS_ID);
  if (existingDoc) doc._rev = existingDoc._rev;
  window.utools.db.put(doc);

  if (window.services.writeClaudeSettings(settings)) {
    MessagePlugin.success("全局设置已保存");
    showExtraFieldsDialog.value = false;
    loadCurrentConfig();
  } else {
    MessagePlugin.error("保存失败");
  }
};

const openSettingsFile = () => {
  const filePath = window.services.getClaudeSettingsPath();
  window.utools.shellOpenPath(filePath);
};

onMounted(() => { loadCurrentConfig(); loadSavedConfigs(); loadExtraFieldKeys(); });
</script>

<template>
  <div class="config-view">
    <div class="section-header">
      <span class="section-tip">直接编辑 <span class="hint-link" @click="openSettingsFile">settings.json</span></span>
      <Space size="small">
        <Button size="small" variant="outline" @click="handleExportAsString"><template #icon><DownloadIcon /></template> 导出</Button>
        <Button size="small" variant="outline" @click="openImportStringDialog"><template #icon><UploadIcon /></template> 导入</Button>
        <Button size="small" theme="primary" @click="openCreateDialog"><template #icon><AddIcon /></template> 新建配置</Button>
      </Space>
    </div>

    <!-- 当前配置展示 -->
    <div class="current-config-card">
      <div class="current-config-header">
        <span class="current-config-title">当前生效配置</span>
        <Button size="small" theme="primary" variant="text" @click="openExtraFieldsDialog"><template #icon><SettingIcon /></template>env其他字段设置</Button>
      </div>
      <div class="current-config-content">
        <div class="current-config-main">
          <span class="current-config-token">{{ maskKey(currentConfig.key) || '未设置' }}</span>
          <span class="current-config-arrow">→</span>
          <span class="current-config-url">{{ currentConfig.baseUrl || '未设置' }}</span>
        </div>
        <div v-if="hasModelFields" class="current-config-models">
          <Tag v-if="currentConfig.model" size="small" variant="outline">MODEL: {{ currentConfig.model }}</Tag>
          <Tag v-if="currentConfig.defaultHaikuModel" size="small" variant="outline">HAIKU: {{ currentConfig.defaultHaikuModel }}</Tag>
          <Tag v-if="currentConfig.defaultSonnetModel" size="small" variant="outline">SONNET: {{ currentConfig.defaultSonnetModel }}</Tag>
          <Tag v-if="currentConfig.defaultOpusModel" size="small" variant="outline">OPUS: {{ currentConfig.defaultOpusModel }}</Tag>
          <Tag v-if="currentConfig.subagentModel" size="small" variant="outline">SUBAGENT: {{ currentConfig.subagentModel }}</Tag>
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
              <Button v-else size="small" theme="success" variant="text" @click="switchConfig(config)"><template #icon><PlayIcon /></template>启用</Button>
              <Tooltip content="编辑" placement="top">
                <Button size="small" theme="default" variant="text" @click="openEditDialog(config)"><EditIcon /></Button>
              </Tooltip>
              <Tooltip content="删除" placement="top">
                <Popconfirm theme="danger" content="确定要删除这个配置吗？" @confirm="deleteConfig(config)">
                  <Button size="small" theme="danger" variant="text"><DeleteIcon /></Button>
                </Popconfirm>
              </Tooltip>
            </Space>
          </div>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="showDialog" :header="dialogTitle" @confirm="saveConfig" width="560px">
      <div class="form">
        <div class="form-item"><label>名称 <span class="required">*</span></label><Input v-model="formData.name" placeholder="方便分辨的名字" /></div>
        <div class="form-item"><label>URL <span class="required">*</span></label><Input v-model="formData.baseUrl" placeholder="ANTHROPIC_BASE_URL" /></div>
        <div class="form-item"><label>TOKEN <span class="required">*</span></label><Input v-model="formData.key" type="password" placeholder="ANTHROPIC_AUTH_TOKEN" /></div>
        <div class="form-item"><label>MODEL</label><Input v-model="formData.model" placeholder="ANTHROPIC_MODEL" /></div>
        <div class="form-item"><label>HAIKU</label><Input v-model="formData.defaultHaikuModel" placeholder="ANTHROPIC_DEFAULT_HAIKU_MODEL" /></div>
        <div class="form-item"><label>SONNET</label><Input v-model="formData.defaultSonnetModel" placeholder="ANTHROPIC_DEFAULT_SONNET_MODEL" /></div>
        <div class="form-item"><label>OPUS</label><Input v-model="formData.defaultOpusModel" placeholder="ANTHROPIC_DEFAULT_OPUS_MODEL" /></div>
        <div class="form-item"><label>SUBAGENT</label><Input v-model="formData.subagentModel" placeholder="CLAUDE_CODE_SUBAGENT_MODEL" /></div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <Button variant="outline" @click="fillCurrentConfig"><template #icon><RefreshIcon /></template> 读取当前配置</Button>
          <div class="dialog-footer-right"><Button variant="outline" @click="showDialog = false">取消</Button><Button theme="primary" @click="saveConfig">保存</Button></div>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="showImportStringDialog" header="从字符串导入" @confirm="handleImportFromString" width="480px">
      <div class="form"><div class="form-item-vertical"><label>配置字符串</label><Textarea v-if="showImportStringDialog" v-model="importString" placeholder="粘贴配置字符串" :autosize="{ minRows: 4, maxRows: 8 }" /></div></div>
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
        <div v-if="previewConfig.subagentModel" class="preview-item"><span class="preview-label">SUBAGENT_MODEL</span><span class="preview-value">{{ previewConfig.subagentModel }}</span></div>
      </div>
    </Dialog>

    <Dialog v-model:visible="showExtraFieldsDialog" header="env其他字段设置" width="600px" @confirm="saveExtraFields">
      <div class="extra-fields-dialog">
        <div class="extra-fields-hint">
          <p>这些字段保存在 settings.json 的 env 中，不随配置切换而改变。</p>
          <p>例如：API_TIMEOUT_MS、CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC、CLAUDE_CODE_NO_FLICKER</p>
        </div>
        <div class="extra-fields-list">
          <div v-for="(field, idx) in extraFields" :key="idx" class="extra-field-item">
            <AutoComplete v-model="field.key" class="field-key" :options="extraFieldKeyOptions" filterable placeholder="字段名（如 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC）" />
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
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.section-tip { font-size: 12px; color: var(--td-text-color-placeholder); }
.hint-link { color: var(--td-brand-color); cursor: pointer; text-decoration: underline; }
.empty-state { padding: 40px 0; }

/* 配置分组样式 */
.config-groups { display: flex; flex-direction: column; gap: 12px; }
.config-group { background: var(--td-bg-color-container); border-radius: var(--td-radius-medium); overflow: hidden; border: 1px solid var(--td-component-border); }
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
.current-config-card { margin-bottom: 16px; padding: 16px; background: var(--td-bg-color-container); border-radius: var(--td-radius-medium); border: 1px solid var(--td-component-border); }
.current-config-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.current-config-title { font-size: 14px; font-weight: 500; color: var(--td-text-color-primary); }
.current-config-content { display: flex; flex-direction: column; gap: 8px; }
.current-config-main { display: flex; align-items: center; gap: 8px; font-size: 13px; font-family: monospace; }
.current-config-token { color: var(--td-text-color-primary); }
.current-config-arrow { color: var(--td-text-color-placeholder); }
.current-config-url { color: var(--td-brand-color); word-break: break-all; }
.current-config-models { display: flex; flex-wrap: wrap; gap: 6px; }

/* 额外字段弹窗样式 */
.extra-fields-dialog { display: flex; flex-direction: column; gap: 16px; }
.extra-fields-hint { padding: 12px 16px; background: var(--td-bg-color-container-hover); border-radius: var(--td-radius-default); font-size: 13px; color: var(--td-text-color-secondary); }
.extra-fields-hint p { margin: 0 0 4px 0; }
.extra-fields-hint p:last-child { margin-bottom: 0; }
.extra-fields-list { display: flex; flex-direction: column; gap: 12px; }
.extra-field-item { display: flex; gap: 8px; align-items: center; }
.extra-field-item .field-key { flex: 1; }
.extra-field-item .field-value { flex: 0 0 140px; }
.add-field-btn { align-self: flex-start; }

/* 表单样式 */
.form { display: flex; flex-direction: column; gap: 16px; }
.form-item { display: flex; align-items: center; gap: 12px; }
.form-item label { font-size: 14px; color: var(--td-text-color-primary); flex-shrink: 0; width: 80px; text-align: right; }
.form-item-vertical { display: flex; flex-direction: column; gap: 8px; }
.form-item-vertical label { font-size: 14px; color: var(--td-text-color-primary); }
.form-item .required { color: var(--td-error-color); }
.dialog-footer { display: flex; justify-content: space-between; align-items: center; }
.dialog-footer-right { display: flex; gap: 8px; }
</style>