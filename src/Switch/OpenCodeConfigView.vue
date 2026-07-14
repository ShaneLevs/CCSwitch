<script setup>

import { ref, onMounted, computed } from "vue";
import {
  Button,
  Input,
  Select,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Popconfirm,
  Textarea,
  Collapse,
  CollapsePanel,
  InputNumber,
  Dropdown,
  DropdownMenu,
  DropdownItem,
  Tooltip,
} from "tdesign-vue-next";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  DownloadIcon,
  UploadIcon,
  ChevronDownIcon,
  RefreshIcon,
  SearchIcon,
} from "tdesign-icons-vue-next";
import DynamicKvEditor from "../components/DynamicKvEditor.vue";
import ApiKeyInput from "../components/ApiKeyInput.vue";
import "./styles/OpenCodeConfigView.css";

// ==================== Constants ====================

const NPM_OPTIONS = [
  { label: "@ai-sdk/openai", value: "@ai-sdk/openai" },
  { label: "@ai-sdk/openai-compatible", value: "@ai-sdk/openai-compatible" },
  { label: "@ai-sdk/anthropic", value: "@ai-sdk/anthropic" },
  { label: "@ai-sdk/amazon-bedrock", value: "@ai-sdk/amazon-bedrock" },
  { label: "@ai-sdk/google", value: "@ai-sdk/google" },
];

const KNOWN_PROVIDER_OPTION_KEYS = ["baseURL", "apiKey", "headers"];
const KNOWN_MODEL_KEYS = ["name", "limit", "options"];

// Models.dev npm mapping: models.dev uses some custom npm names
const MODELS_DEV_NPM_MAP = {
  "@openrouter/ai-sdk-provider": "@ai-sdk/openai-compatible",
};

// ==================== State ====================

const providers = ref({});
const showDialog = ref(false);
const dialogMode = ref("create");
const showPresetDialog = ref(false);
const showImportDialog = ref(false);
const importString = ref("");
const presets = ref([]);
const presetsLoading = ref(false);
const presetsError = ref("");
const presetSearch = ref("");

const formData = ref({
  id: "",
  npm: "@ai-sdk/openai-compatible",
  name: "",
  baseUrl: "",
  apiKey: "",
  extraOptions: [],
  models: [],
});

// ==================== Computed ====================

const dialogTitle = computed(() => (dialogMode.value === "edit" ? "编辑配置" : "新建配置"));

const providerList = computed(() => {
  return Object.entries(providers.value).map(([id, config]) => ({
    id,
    ...config,
    modelCount: config.models ? Object.keys(config.models).length : 0,
  }));
});

// ==================== Helpers ====================

const maskUrl = (url) => {
  if (!url) return "";
  if (url.length <= 40) return url;
  return url.substring(0, 37) + "...";
};

const optionsToKv = (optionsObj, knownKeys) => {
  if (!optionsObj || typeof optionsObj !== "object") return [];
  return Object.entries(optionsObj)
    .filter(([key]) => !knownKeys.includes(key))
    .map(([key, value]) => ({ key, value: typeof value === "object" ? JSON.stringify(value) : String(value) }));
};

const kvToOptions = (kvList) => {
  const result = {};
  for (const { key, value } of kvList) {
    if (!key?.trim()) continue;
    try {
      result[key.trim()] = JSON.parse(value);
    } catch {
      result[key.trim()] = value;
    }
  }
  return result;
};

const modelExtraFieldsToKv = (modelObj) => {
  if (!modelObj || typeof modelObj !== "object") return [];
  return Object.entries(modelObj)
    .filter(([key]) => !KNOWN_MODEL_KEYS.includes(key))
    .map(([key, value]) => ({ key, value: typeof value === "object" ? JSON.stringify(value) : String(value) }));
};

const modelOptionsToKv = (optionsObj) => {
  if (!optionsObj || typeof optionsObj !== "object") return [];
  return Object.entries(optionsObj).map(([key, value]) => ({
    key,
    value: typeof value === "object" ? JSON.stringify(value) : String(value),
  }));
};

// ==================== Data Loading ====================

const loadProviders = () => {
  try {
    providers.value = window.services.getOpencodeProviders();
  } catch (e) {
    console.error("Failed to load opencode providers:", e);
    providers.value = {};
  }
};

// ==================== Dialog Actions ====================

const createEmptyModel = () => ({
  id: "",
  name: "",
  context: 128000,
  output: 4096,
  sdkOptions: [],
  extraFields: [],
});

const openCreateDialog = () => {
  dialogMode.value = "create";
  formData.value = {
    id: "",
    npm: "@ai-sdk/openai-compatible",
    name: "",
    baseUrl: "",
    apiKey: "",
    extraOptions: [],
    models: [],
  };
  showDialog.value = true;
};

const openEditDialog = (provider) => {
  dialogMode.value = "edit";
  const options = provider.options || {};
  const extraOptions = optionsToKv(options, KNOWN_PROVIDER_OPTION_KEYS);

  const models = [];
  if (provider.models && typeof provider.models === "object") {
    for (const [modelId, modelConfig] of Object.entries(provider.models)) {
      const limit = modelConfig.limit || {};
      const sdkOptions = modelOptionsToKv(modelConfig.options || {});
      const extraFields = modelExtraFieldsToKv(modelConfig);
      models.push({
        id: modelId,
        name: modelConfig.name || "",
        context: limit.context || 128000,
        output: limit.output || 4096,
        sdkOptions,
        extraFields,
      });
    }
  }

  formData.value = {
    id: provider.id,
    npm: provider.npm || "",
    name: provider.name || "",
    baseUrl: options.baseURL || "",
    apiKey: options.apiKey || "",
    extraOptions,
    models,
  };
  showDialog.value = true;
};

// ==================== Preset Quick-fill ====================

const fetchPresets = async () => {
  presetsLoading.value = true;
  presetsError.value = "";
  try {
    const apiData = await window.services.fetchModelsDevPresets();
    const result = [];
    for (const [providerId, provider] of Object.entries(apiData)) {
      const npm = MODELS_DEV_NPM_MAP[provider.npm] || provider.npm || "@ai-sdk/openai-compatible";
      const models = [];
      if (provider.models) {
        for (const [modelId, model] of Object.entries(provider.models)) {
          models.push({
            id: modelId,
            name: model.name || modelId,
            context: model.limit?.context || 128000,
            output: model.limit?.output || 4096,
            modalities: model.modalities || null,
            cost: model.cost || null,
            reasoning: model.reasoning || false,
            toolCall: model.tool_call || false,
            reasoningOptions: model.reasoning_options || null,
            attachment: model.attachment || false,
          });
        }
      }
      result.push({
        id: providerId,
        name: provider.name || providerId,
        npm,
        baseUrl: provider.api || "",
        env: provider.env || [],
        doc: provider.doc || "",
        models,
      });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    presets.value = result;
  } catch (e) {
    presetsError.value = e.message || "获取预设失败";
    console.error("Failed to fetch models.dev presets:", e);
  } finally {
    presetsLoading.value = false;
  }
};

const filteredPresets = computed(() => {
  const q = presetSearch.value.trim().toLowerCase();
  if (!q) return presets.value;
  return presets.value.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    p.npm.toLowerCase().includes(q)
  );
});

const openPresetDialog = () => {
  presetSearch.value = "";
  showPresetDialog.value = true;
  if (!presets.value.length && !presetsLoading.value) {
    fetchPresets();
  }
};

// ==================== Model Selection ====================

const showModelSelectDialog = ref(false);
const selectedPreset = ref(null);
const selectedModelIds = ref([]);
const modelSelectSearch = ref("");

const openModelSelectDialog = (preset) => {
  selectedPreset.value = preset;
  selectedModelIds.value = [];
  modelSelectSearch.value = "";
  showModelSelectDialog.value = true;
};

const filteredModels = computed(() => {
  if (!selectedPreset.value) return [];
  const q = modelSelectSearch.value.trim().toLowerCase();
  const models = selectedPreset.value.models;
  if (!q) return models;
  return models.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.id.toLowerCase().includes(q)
  );
});

const toggleModelSelect = (modelId) => {
  const idx = selectedModelIds.value.indexOf(modelId);
  if (idx >= 0) selectedModelIds.value.splice(idx, 1);
  else selectedModelIds.value.push(modelId);
};

const selectAllModels = () => {
  selectedModelIds.value = filteredModels.value.map(m => m.id);
};

const applySelectedModels = () => {
  const preset = selectedPreset.value;
  if (!preset) return;

  formData.value.npm = preset.npm;
  formData.value.baseUrl = preset.baseUrl;
  if (!formData.value.name && preset.name) formData.value.name = preset.name;
  if (!formData.value.id && preset.id) formData.value.id = preset.id;

  const selectedModels = preset.models.filter(m => selectedModelIds.value.includes(m.id));
  if (selectedModels.length) {
    formData.value.models = selectedModels.map(m => {
      const modelForm = {
        id: m.id,
        name: m.name || m.id,
        context: m.context || 128000,
        output: m.output || 4096,
        sdkOptions: [],
        extraFields: [],
      };
      // Fill modalities as extra field
      if (m.modalities) {
        modelForm.extraFields.push({ key: 'modalities', value: JSON.stringify(m.modalities) });
      }
      // Fill cost as extra field
      if (m.cost) {
        modelForm.extraFields.push({ key: 'cost', value: JSON.stringify(m.cost) });
      }
      // Build variants from reasoning_options
      if (m.reasoning_options && m.reasoning_options.length > 0) {
        const variants = buildVariants(m.reasoning_options, preset.npm);
        if (Object.keys(variants).length > 0) {
          modelForm.extraFields.push({ key: 'variants', value: JSON.stringify(variants) });
        }
      }
      return modelForm;
    });
  }

  showModelSelectDialog.value = false;
  showPresetDialog.value = false;
  MessagePlugin.success(`已填入 ${selectedModels.length} 个模型`);
};

const buildVariants = (reasoningOptions, npm) => {
  const variants = {};
  for (const opt of reasoningOptions) {
    if (opt.type === 'effort' && opt.values) {
      for (const level of opt.values) {
        if (npm === '@ai-sdk/anthropic') {
          variants[level] = { effort: level };
        } else if (npm === '@ai-sdk/openai') {
          variants[level] = { reasoningEffort: level, reasoningSummary: 'auto', textVerbosity: 'medium' };
        } else if (npm === '@ai-sdk/google') {
          variants[level] = { thinkingConfig: { includeThoughts: true, thinkingLevel: level } };
        } else {
          variants[level] = { reasoningEffort: level };
        }
      }
    }
    if (opt.type === 'budget_tokens' && opt.min) {
      if (npm === '@ai-sdk/anthropic') {
        variants['thinking'] = { thinking: { type: 'enabled', budgetTokens: opt.min } };
      }
    }
    if (opt.type === 'toggle') {
      variants['thinking'] = { thinking: { type: 'enabled' } };
    }
  }
  return variants;
};

// ==================== Model Management ====================

const addModel = () => {
  formData.value.models.push(createEmptyModel());
};

const removeModel = (idx) => {
  formData.value.models.splice(idx, 1);
};

// ==================== Save ====================

const saveProvider = () => {
  const id = formData.value.id.trim();
  if (!id) return MessagePlugin.warning("请输入 Provider ID");
  if (!formData.value.npm) return MessagePlugin.warning("请选择 NPM Package");

  if (dialogMode.value === "create" && providers.value[id]) {
    return MessagePlugin.warning("Provider ID 已存在: " + id);
  }

  // Build options
  const options = {};
  if (formData.value.baseUrl) options.baseURL = formData.value.baseUrl;
  if (formData.value.apiKey) options.apiKey = formData.value.apiKey;
  const extraOptObj = kvToOptions(formData.value.extraOptions);
  Object.assign(options, extraOptObj);

  // Build models
  const models = {};
  for (const model of formData.value.models) {
    const modelId = model.id?.trim();
    if (!modelId) continue;
    const modelConfig = { name: model.name || modelId };
    if (model.context || model.output) {
      modelConfig.limit = { context: model.context || 128000, output: model.output || 4096 };
    }
    const sdkOptObj = kvToOptions(model.sdkOptions);
    if (Object.keys(sdkOptObj).length > 0) {
      modelConfig.options = sdkOptObj;
    }
    const extraObj = kvToOptions(model.extraFields);
    Object.assign(modelConfig, extraObj);
    models[modelId] = modelConfig;
  }

  const providerConfig = {
    npm: formData.value.npm,
    name: formData.value.name || id,
    options,
    models,
  };

  if (window.services.setOpencodeProvider(id, providerConfig)) {
    MessagePlugin.success(dialogMode.value === "create" ? "Provider 已添加" : "Provider 已更新");
    showDialog.value = false;
    loadProviders();
  } else {
    MessagePlugin.error("保存失败");
  }
};

// ==================== Delete ====================

const deleteProvider = (providerId) => {
  if (window.services.removeOpencodeProvider(providerId)) {
    MessagePlugin.success("Provider 已删除");
    loadProviders();
  } else {
    MessagePlugin.error("删除失败");
  }
};

// ==================== Open Config File ====================

const openConfigFile = () => {
  const filePath = window.services.getOpencodeConfigPath();
  window.utools.shellOpenPath(filePath);
};

// ==================== Export / Import ====================

const handleExport = () => {
  try {
    const currentProviders = window.services.getOpencodeProviders();
    const list = Object.entries(currentProviders).map(([id, config]) => ({ id, ...config }));
    if (!list.length) return MessagePlugin.warning("没有 Provider 可导出");
    const compressed = window.services.compressConfigs(list);
    window.utools.copyText(compressed);
    MessagePlugin.success("已复制到剪贴板");
  } catch (e) {
    MessagePlugin.error("导出失败: " + e.message);
  }
};

const openImportDialog = () => {
  importString.value = "";
  showImportDialog.value = true;
};

const handleImport = () => {
  if (!importString.value.trim()) return MessagePlugin.warning("请粘贴配置字符串");
  try {
    const decompressed = window.services.decompressConfigs(importString.value.trim());
    if (!Array.isArray(decompressed)) return MessagePlugin.error("解压数据格式不正确");

    const batch = {};
    for (const item of decompressed) {
      const { id, ...config } = item;
      if (!id) continue;
      // Merge models if provider already exists
      const existing = providers.value[id];
      if (existing && existing.models && config.models) {
        config.models = { ...existing.models, ...config.models };
      }
      batch[id] = config;
    }
    const count = Object.keys(batch).length;
    if (count && window.services.setOpencodeProviders(batch)) {
      MessagePlugin.success(`已导入 ${count} 个 Provider`);
      showImportDialog.value = false;
      loadProviders();
    } else if (!count) {
      MessagePlugin.warning("没有有效的 Provider 可导入");
    }
  } catch (e) {
    MessagePlugin.error("导入失败: " + e.message);
  }
};

// ==================== NPM Tag Color ====================

const getNpmTagTheme = (npm) => {
  if (npm === "@ai-sdk/openai") return "primary";
  if (npm === "@ai-sdk/openai-compatible") return "success";
  if (npm === "@ai-sdk/anthropic") return "warning";
  if (npm === "@ai-sdk/amazon-bedrock") return "default";
  if (npm === "@ai-sdk/google") return "danger";
  return "default";
};

const getNpmShortLabel = (npm) => {
  const map = {
    "@ai-sdk/openai": "OpenAI",
    "@ai-sdk/openai-compatible": "Compatible",
    "@ai-sdk/anthropic": "Anthropic",
    "@ai-sdk/amazon-bedrock": "Bedrock",
    "@ai-sdk/google": "Google",
  };
  return map[npm] || npm;
};

onMounted(() => {
  loadProviders();
});

</script>

<template>
  <div class="opencode-config-view">
    <!-- Section Header -->
    <div class="section-header">
      <span class="section-tip">
        直接编辑 <span class="hint-link" @click="openConfigFile">opencode.json</span>
      </span>
      <Space size="small">
        <Button size="small" variant="outline" @click="handleExport">
          <template #icon><DownloadIcon /></template> 导出
        </Button>
        <Button size="small" variant="outline" @click="openImportDialog">
          <template #icon><UploadIcon /></template> 导入
        </Button>
        <Button size="small" theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template> 新建配置
        </Button>
      </Space>
    </div>

    <!-- Empty State -->
    <div v-if="!providerList.length" class="empty-state">
      <Empty description="暂无配置">
        <template #action>
          <Button theme="primary" @click="openCreateDialog">
            <template #icon><AddIcon /></template> 添加第一个配置
          </Button>
        </template>
      </Empty>
    </div>

    <!-- Provider List -->
    <div v-else class="provider-list">
      <div v-for="provider in providerList" :key="provider.id" class="provider-card">
        <div class="provider-card-header">
          <div class="provider-card-info">
            <span class="provider-id">{{ provider.id }}</span>
            <Tag size="small" :theme="getNpmTagTheme(provider.npm)" variant="light">
              {{ getNpmShortLabel(provider.npm) }}
            </Tag>
          </div>
          <Space size="small">
            <Tag v-if="provider.modelCount" size="small" variant="outline" theme="primary">
              {{ provider.modelCount }} 个模型
            </Tag>
            <Tooltip content="编辑" placement="top">
              <Button size="small" theme="default" variant="text" @click="openEditDialog(provider)">
                <EditIcon />
              </Button>
            </Tooltip>
            <Popconfirm theme="danger" content="确定要删除这个 Provider 吗？" @confirm="deleteProvider(provider.id)">
              <Tooltip content="删除" placement="top">
                <Button size="small" theme="danger" variant="text">
                  <DeleteIcon />
                </Button>
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>
        <div class="provider-card-body">
          <span v-if="provider.name && provider.name !== provider.id" class="provider-name">{{ provider.name }}</span>
          <span v-if="provider.options?.baseURL" class="provider-url">{{ maskUrl(provider.options.baseURL) }}</span>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <Dialog v-model:visible="showDialog" :header="dialogTitle" width="640px" @confirm="saveProvider">
      <div class="oc-form">
        <!-- Provider ID -->
        <div class="oc-form-item">
          <label>Provider ID <span class="required">*</span></label>
          <Input v-model="formData.id" placeholder="例如: deepseek" :disabled="dialogMode === 'edit'" />
        </div>

        <!-- NPM Package -->
        <div class="oc-form-item">
          <label>NPM Package <span class="required">*</span></label>
          <Select v-model="formData.npm" :options="NPM_OPTIONS" placeholder="选择 SDK 包" />
        </div>

        <!-- Display Name -->
        <div class="oc-form-item">
          <label>显示名称</label>
          <Input v-model="formData.name" placeholder="Provider 显示名称" />
        </div>

        <!-- Base URL -->
        <div class="oc-form-item">
          <label>Base URL</label>
          <Input v-model="formData.baseUrl" placeholder="https://api.example.com/v1" />
        </div>

        <!-- API Key -->
        <div class="oc-form-item">
          <label>API Key</label>
          <ApiKeyInput v-model="formData.apiKey" placeholder="sk-..." />
        </div>

        <!-- Extra Options -->
        <div class="oc-form-section">
          <div class="oc-form-section-title">额外选项 (options)</div>
          <DynamicKvEditor
            v-model="formData.extraOptions"
            :key-options="[]"
            key-placeholder="选项名"
            value-placeholder="选项值 (JSON 或字符串)"
          />
        </div>

        <!-- Models -->
        <div class="oc-form-section">
          <div class="oc-form-section-header">
            <span class="oc-form-section-title">模型 (models)</span>
            <Button size="small" variant="outline" @click="addModel">
              <template #icon><AddIcon /></template> 添加模型
            </Button>
          </div>

          <div v-if="!formData.models.length" class="oc-models-empty">暂无模型</div>

          <Collapse v-else class="oc-model-collapse">
            <CollapsePanel
              v-for="(model, idx) in formData.models"
              :key="idx"
              :header="model.id || model.name || '新模型'"
              :value="String(idx)"
            >
              <div class="oc-model-form">
                <div class="oc-form-item">
                  <label>Model ID <span class="required">*</span></label>
                  <Input v-model="model.id" placeholder="例如: deepseek-chat" />
                </div>
                <div class="oc-form-item">
                  <label>显示名称</label>
                  <Input v-model="model.name" placeholder="Model 显示名称" />
                </div>
                <div class="oc-form-item-row">
                  <div class="oc-form-item oc-form-item--flex">
                    <label>Context 限制</label>
                    <InputNumber v-model="model.context" :min="0" :step="1000" theme="normal" />
                  </div>
                  <div class="oc-form-item oc-form-item--flex">
                    <label>Output 限制</label>
                    <InputNumber v-model="model.output" :min="0" :step="1000" theme="normal" />
                  </div>
                </div>
                <div class="oc-form-subsection">
                  <div class="oc-form-subsection-title">SDK Options</div>
                  <DynamicKvEditor
                    v-model="model.sdkOptions"
                    :key-options="[]"
                    key-placeholder="选项名"
                    value-placeholder="选项值"
                  />
                </div>
                <div class="oc-form-subsection">
                  <div class="oc-form-subsection-title">额外字段 (variants, modalities, cost 等)</div>
                  <DynamicKvEditor
                    v-model="model.extraFields"
                    :key-options="[]"
                    key-placeholder="字段名"
                    value-placeholder="字段值 (JSON 或字符串)"
                  />
                </div>
                <div class="oc-model-remove">
                  <Button size="small" theme="danger" variant="outline" @click="removeModel(idx)">
                    <template #icon><DeleteIcon /></template> 移除此模型
                  </Button>
                </div>
              </div>
            </CollapsePanel>
          </Collapse>
        </div>
      </div>

      <template #footer>
        <div class="oc-dialog-footer">
          <Button variant="outline" @click="openPresetDialog">
            <template #icon><ChevronDownIcon /></template> 预设填充
          </Button>
          <div class="oc-dialog-footer-right">
            <Button variant="outline" @click="showDialog = false">取消</Button>
            <Button theme="primary" @click="saveProvider">保存</Button>
          </div>
        </div>
      </template>
    </Dialog>

    <!-- Preset Quick-fill Dialog -->
    <Dialog v-model:visible="showPresetDialog" header="选择预设 (models.dev)" width="560px" :footer="false">
      <div class="oc-preset-toolbar">
        <Input
          v-model="presetSearch"
          placeholder="搜索提供商..."
          clearable
          class="oc-preset-search"
        >
          <template #prefixIcon><SearchIcon /></template>
        </Input>
        <Button size="small" variant="text" @click="fetchPresets" :loading="presetsLoading">
          <template #icon><RefreshIcon /></template>
        </Button>
      </div>
      <div v-if="presetsLoading" class="oc-preset-loading">加载中...</div>
      <div v-else-if="presetsError" class="oc-preset-error">
        {{ presetsError }}
        <Button size="small" variant="outline" @click="fetchPresets">重试</Button>
      </div>
      <div v-else-if="!filteredPresets.length" class="oc-preset-empty">无匹配的提供商</div>
      <div v-else class="oc-preset-list">
        <div
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="oc-preset-item"
          @click="openModelSelectDialog(preset)"
        >
          <div class="oc-preset-name">{{ preset.name }}</div>
          <div class="oc-preset-desc">
            <Tag size="small" :theme="getNpmTagTheme(preset.npm)" variant="light">
              {{ getNpmShortLabel(preset.npm) }}
            </Tag>
            <span v-if="preset.baseUrl" class="oc-preset-url">{{ maskUrl(preset.baseUrl) }}</span>
            <span v-if="preset.models.length" class="oc-preset-models">{{ preset.models.length }} 个模型</span>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Model Selection Dialog -->
    <Dialog
      v-model:visible="showModelSelectDialog"
      :header="selectedPreset ? `选择模型 — ${selectedPreset.name}` : '选择模型'"
      width="560px"
      @confirm="applySelectedModels"
    >
      <div v-if="selectedPreset" class="oc-model-select">
        <div class="oc-model-select-toolbar">
          <Input
            v-model="modelSelectSearch"
            placeholder="搜索模型..."
            clearable
            class="oc-preset-search"
          >
            <template #prefixIcon><SearchIcon /></template>
          </Input>
          <Button size="small" variant="outline" @click="selectAllModels">全选</Button>
        </div>
        <div v-if="!filteredModels.length" class="oc-preset-empty">无匹配的模型</div>
        <div v-else class="oc-model-select-list">
          <div
            v-for="model in filteredModels"
            :key="model.id"
            class="oc-model-select-item"
            :class="{ 'oc-model-select-item--selected': selectedModelIds.includes(model.id) }"
            @click="toggleModelSelect(model.id)"
          >
            <div class="oc-model-select-check">
              <span class="oc-check-box">{{ selectedModelIds.includes(model.id) ? '☑' : '☐' }}</span>
            </div>
            <div class="oc-model-select-info">
              <span class="oc-model-select-name">{{ model.name || model.id }}</span>
              <span class="oc-model-select-id">{{ model.id }}</span>
            </div>
            <div class="oc-model-select-meta">
              <span v-if="model.context" class="oc-model-meta-tag">{{ (model.context / 1000).toFixed(0) }}K ctx</span>
              <span v-if="model.reasoning" class="oc-model-meta-tag oc-meta-reasoning">推理</span>
              <span v-if="model.toolCall" class="oc-model-meta-tag oc-meta-tool">工具</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="oc-dialog-footer">
          <span class="oc-model-select-count">已选 {{ selectedModelIds.length }} 个模型</span>
          <div class="oc-dialog-footer-right">
            <Button variant="outline" @click="showModelSelectDialog = false">取消</Button>
            <Button theme="primary" @click="applySelectedModels" :disabled="!selectedModelIds.length">填入</Button>
          </div>
        </div>
      </template>
    </Dialog>

    <!-- Import Dialog -->
    <Dialog v-model:visible="showImportDialog" header="从字符串导入" width="480px" @confirm="handleImport">
      <div class="oc-form">
        <div class="oc-form-item-vertical">
          <label>配置字符串</label>
          <Textarea
            v-if="showImportDialog"
            v-model="importString"
            placeholder="粘贴配置字符串"
            :autosize="{ minRows: 4, maxRows: 8 }"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>
