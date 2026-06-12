<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
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
  Tooltip,
  Loading,
} from "tdesign-vue-next";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  DownloadIcon,
  UploadIcon,
  RefreshIcon,
  SearchIcon,
  FolderIcon,
  ChevronDownIcon,
} from "tdesign-icons-vue-next";
import ApiKeyInput from "../components/ApiKeyInput.vue";
import "./styles/CodexConfigView.css";

// ==================== Constants ====================

const DEFAULT_TOML = `model_provider = "custom"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "custom"
base_url = ""
wire_api = "responses"
requires_openai_auth = true`;

const DEFAULT_AUTH = { OPENAI_API_KEY: "" };

const WIRE_API_OPTIONS = [
  { label: "Responses API", value: "responses" },
  { label: "Chat Completions", value: "chat" },
];

const REASONING_EFFORT_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const BUILT_IN_PRESETS = [
  {
    id: "openai",
    name: "OpenAI 官方",
    category: "official",
    icon: "🤖",
    websiteUrl: "https://openai.com",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "o3"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "openai"
base_url = "https://api.openai.com/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    category: "official",
    icon: "☁️",
    websiteUrl: "https://azure.microsoft.com/en-us/products/ai-services/openai-service",
    apiKeyUrl: "https://portal.azure.com",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "azure-openai"
base_url = "https://YOUR_RESOURCE.openai.azure.com/openai"
wire_api = "chat"
requires_openai_auth = true`,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "aggregator",
    icon: "🌐",
    websiteUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "openai/gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "openrouter"
base_url = "https://openrouter.ai/api/v1"
wire_api = "chat"
requires_openai_auth = true`,
  },
  {
    id: "aihubmix",
    name: "AiHubMix",
    category: "aggregator",
    icon: "🔀",
    websiteUrl: "https://aihubmix.com",
    apiKeyUrl: "https://aihubmix.com/token",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "aihubmix"
base_url = "https://aihubmix.com/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "dmxapi",
    name: "DMXAPI",
    category: "aggregator",
    icon: "⚡",
    websiteUrl: "https://www.dmxapi.com",
    apiKeyUrl: "https://www.dmxapi.com/token",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "dmxapi"
base_url = "https://www.dmxapi.com/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "therouter",
    name: "TheRouter",
    category: "aggregator",
    icon: "🛤️",
    websiteUrl: "https://therouter.ai",
    apiKeyUrl: "https://therouter.ai/keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "openai/gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "therouter"
base_url = "https://openrouter.therouter.ai/v1"
wire_api = "chat"
requires_openai_auth = true`,
  },
  {
    id: "pipellm",
    name: "PIPELLM",
    category: "aggregator",
    icon: "🔧",
    websiteUrl: "https://pipellm.com",
    apiKeyUrl: "https://pipellm.com/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "pipellm"
base_url = "https://api.pipellm.com/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "runapi",
    name: "RunAPI",
    category: "aggregator",
    icon: "🏃",
    websiteUrl: "https://runapi.top",
    apiKeyUrl: "https://runapi.top/token",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "runapi"
base_url = "https://api.runapi.top/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "packycode",
    name: "PackyCode",
    category: "third_party",
    icon: "📦",
    websiteUrl: "https://packycode.com",
    apiKeyUrl: "https://packycode.com/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "packycode"
base_url = "https://api.packycode.com/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "claudecn",
    name: "ClaudeCN",
    category: "third_party",
    icon: "🇨🇳",
    websiteUrl: "https://claudecn.com",
    apiKeyUrl: "https://claudecn.com/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "claude-sonnet-4-20250514"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "claudecn"
base_url = "https://api.claudecn.com/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "cubence",
    name: "Cubence",
    category: "third_party",
    icon: "💎",
    websiteUrl: "https://cubence.ai",
    apiKeyUrl: "https://cubence.ai/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "cubence"
base_url = "https://api.cubence.ai/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "aigocode",
    name: "AIGoCode",
    category: "third_party",
    icon: "🚀",
    websiteUrl: "https://aigocode.ai",
    apiKeyUrl: "https://aigocode.ai/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "aigocode"
base_url = "https://api.aigocode.ai/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "rightcode",
    name: "RightCode",
    category: "third_party",
    icon: "✅",
    websiteUrl: "https://rightcode.ai",
    apiKeyUrl: "https://rightcode.ai/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "rightcode"
base_url = "https://api.rightcode.ai/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "aicodemirror",
    name: "AICodeMirror",
    category: "third_party",
    icon: "🪞",
    websiteUrl: "https://aicodemirror.com",
    apiKeyUrl: "https://aicodemirror.com/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "aicodemirror"
base_url = "https://api.aicodemirror.com/v1"
wire_api = "responses"
requires_openai_auth = true`,
  },
  {
    id: "custom",
    name: "自定义",
    category: "custom",
    icon: "⚙️",
    websiteUrl: "",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: DEFAULT_TOML,
  },
];

const CATEGORY_LABELS = {
  official: "官方",
  aggregator: "聚合",
  third_party: "第三方",
  custom: "自定义",
  dynamic: "动态",
};

// ==================== State ====================

const providers = ref([]);
const currentProviderId = ref(null);
const showDialog = ref(false);
const dialogMode = ref("create");
const showPresetDialog = ref(false);
const showImportDialog = ref(false);
const importString = ref("");
const fetchedModels = ref([]);
const fetchingModels = ref(false);
const presets = ref([]);
const presetsLoading = ref(false);
const presetsError = ref("");
const presetSearch = ref("");
const showTomlEditor = ref(false);
const showAuthEditor = ref(false);
const isUpdatingFromForm = ref(false);
const isUpdatingFromToml = ref(false);

const formData = ref({
  id: "",
  apiKey: "",
  baseUrl: "",
  model: "",
  wireApi: "responses",
  reasoningEffort: "high",
  config: DEFAULT_TOML,
  authJson: JSON.stringify(DEFAULT_AUTH, null, 2),
});

// ==================== Computed ====================

const dialogTitle = computed(() =>
  dialogMode.value === "edit" ? "编辑 Provider" : "新建 Provider"
);

const modelOptions = computed(() =>
  fetchedModels.value.map((m) => ({ label: m, value: m }))
);

const filteredPresets = computed(() => {
  const allPresets = [...BUILT_IN_PRESETS, ...presets.value];
  const q = presetSearch.value.trim().toLowerCase();
  if (!q) return allPresets;
  return allPresets.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
  );
});

// ==================== Helpers ====================

const maskUrl = (url) => {
  if (!url) return "";
  if (url.length <= 40) return url;
  return url.substring(0, 37) + "...";
};

// ==================== Data Loading ====================

const loadProviders = () => {
  try {
    providers.value = window.services.getCodexProviders();
    currentProviderId.value = window.services.getCodexCurrentProvider();
  } catch (e) {
    console.error("Failed to load codex providers:", e);
    providers.value = [];
    currentProviderId.value = null;
  }
};

// ==================== Dialog Actions ====================

const openCreateDialog = () => {
  dialogMode.value = "create";
  formData.value = {
    id: "",
    apiKey: "",
    baseUrl: "",
    model: "gpt-5.4",
    wireApi: "responses",
    reasoningEffort: "high",
    config: DEFAULT_TOML,
    authJson: JSON.stringify(DEFAULT_AUTH, null, 2),
  };
  fetchedModels.value = [];
  showTomlEditor.value = false;
  showAuthEditor.value = false;
  showDialog.value = true;
};

const openEditDialog = (provider) => {
  dialogMode.value = "edit";
  const tomlText = provider.config || DEFAULT_TOML;
  const authObj = provider.auth || { ...DEFAULT_AUTH };

  const baseUrl = window.services.extractCodexBaseUrl(tomlText);
  const model = window.services.extractCodexModelName(tomlText);
  const wireApi = window.services.extractCodexWireApi(tomlText) || "responses";
  const reasoningEffort =
    window.services.extractCodexReasoningEffort(tomlText) || "high";

  formData.value = {
    id: provider.id,
    apiKey: authObj.OPENAI_API_KEY || "",
    baseUrl,
    model,
    wireApi,
    reasoningEffort,
    config: tomlText,
    authJson: JSON.stringify(authObj, null, 2),
  };
  fetchedModels.value = [];
  showTomlEditor.value = false;
  showAuthEditor.value = false;
  showDialog.value = true;
};

// ==================== Bidirectional Sync ====================

const syncFormToToml = () => {
  if (isUpdatingFromToml.value) return;
  isUpdatingFromForm.value = true;
  try {
    let toml = formData.value.config;
    toml = window.services.setCodexBaseUrlInConfig(toml, formData.value.baseUrl);
    toml = window.services.setCodexModelNameInConfig(toml, formData.value.model);
    toml = window.services.setCodexWireApiInConfig(toml, formData.value.wireApi);
    toml = window.services.setCodexReasoningEffortInConfig(
      toml,
      formData.value.reasoningEffort
    );
    formData.value.config = toml;

    // Sync apiKey to authJson
    try {
      const authObj = JSON.parse(formData.value.authJson);
      authObj.OPENAI_API_KEY = formData.value.apiKey;
      formData.value.authJson = JSON.stringify(authObj, null, 2);
    } catch {
      formData.value.authJson = JSON.stringify(
        { OPENAI_API_KEY: formData.value.apiKey },
        null,
        2
      );
    }
  } finally {
    nextTick(() => {
      isUpdatingFromForm.value = false;
    });
  }
};

const syncTomlToForm = () => {
  if (isUpdatingFromForm.value) return;
  isUpdatingFromToml.value = true;
  try {
    const toml = formData.value.config;
    formData.value.baseUrl = window.services.extractCodexBaseUrl(toml);
    formData.value.model = window.services.extractCodexModelName(toml);
    formData.value.wireApi = window.services.extractCodexWireApi(toml) || "responses";
    formData.value.reasoningEffort =
      window.services.extractCodexReasoningEffort(toml) || "high";

    // Sync authJson apiKey
    try {
      const authObj = JSON.parse(formData.value.authJson);
      if (authObj.OPENAI_API_KEY !== formData.value.apiKey) {
        formData.value.apiKey = authObj.OPENAI_API_KEY || "";
      }
    } catch {
      // ignore parse error
    }
  } finally {
    nextTick(() => {
      isUpdatingFromToml.value = false;
    });
  }
};

const handleApiKeyChange = (val) => {
  formData.value.apiKey = val;
  syncFormToToml();
};

const handleBaseUrlChange = () => {
  syncFormToToml();
};

const handleModelChange = () => {
  syncFormToToml();
};

const handleWireApiChange = () => {
  syncFormToToml();
};

const handleReasoningEffortChange = () => {
  syncFormToToml();
};

const handleTomlChange = (val) => {
  formData.value.config = val;
  syncTomlToForm();
};

const handleAuthJsonChange = (val) => {
  formData.value.authJson = val;
  // Try to extract apiKey from auth
  try {
    const authObj = JSON.parse(val);
    if (authObj.OPENAI_API_KEY !== undefined) {
      formData.value.apiKey = authObj.OPENAI_API_KEY;
    }
  } catch {
    // ignore
  }
};

// ==================== Fetch Models ====================

const fetchModels = async () => {
  if (!formData.value.baseUrl) {
    return MessagePlugin.warning("请先填写 Base URL");
  }
  fetchingModels.value = true;
  fetchedModels.value = [];
  try {
    const models = await window.services.fetchModelsForCodex(
      formData.value.baseUrl,
      formData.value.apiKey
    );
    if (models && models.length) {
      fetchedModels.value = models;
      MessagePlugin.success(`获取到 ${models.length} 个模型`);
    } else {
      MessagePlugin.warning("未获取到模型列表");
    }
  } catch (e) {
    MessagePlugin.error("获取模型失败: " + (e.message || e));
  } finally {
    fetchingModels.value = false;
  }
};

// ==================== Save ====================

const saveProvider = () => {
  const id = formData.value.id.trim();
  if (!id) return MessagePlugin.warning("请输入 Provider ID");

  if (dialogMode.value === "create") {
    const exists = providers.value.some((p) => p.id === id);
    if (exists) return MessagePlugin.warning("Provider ID 已存在: " + id);
  }

  // Parse authJson
  let auth;
  try {
    auth = JSON.parse(formData.value.authJson);
  } catch {
    return MessagePlugin.warning("Auth JSON 格式不正确");
  }

  const config = formData.value.config;

  if (window.services.setCodexProvider(id, { auth, config })) {
    MessagePlugin.success(
      dialogMode.value === "create" ? "Provider 已添加" : "Provider 已更新"
    );
    showDialog.value = false;
    loadProviders();
  } else {
    MessagePlugin.error("保存失败");
  }
};

// ==================== Delete ====================

const deleteProvider = (id) => {
  if (window.services.removeCodexProvider(id)) {
    if (currentProviderId.value === id) {
      currentProviderId.value = null;
    }
    MessagePlugin.success("Provider 已删除");
    loadProviders();
  } else {
    MessagePlugin.error("删除失败");
  }
};

// ==================== Activate ====================

const activateProvider = (id) => {
  if (window.services.setCodexCurrentProvider(id)) {
    currentProviderId.value = id;
    MessagePlugin.success("已切换 Provider");
    loadProviders();
  } else {
    MessagePlugin.error("切换失败");
  }
};

// ==================== Open Config Dir ====================

const openConfigDir = () => {
  const dir = window.services.getCodexDir();
  window.utools.shellOpenPath(dir);
};

// ==================== Preset ====================

const openPresetDialog = () => {
  presetSearch.value = "";
  showPresetDialog.value = true;
};

const fetchPresets = async () => {
  presetsLoading.value = true;
  presetsError.value = "";
  try {
    const apiData = await window.services.fetchModelsDevPresets();
    const result = [];
    for (const [providerId, provider] of Object.entries(apiData)) {
      if (!provider.api) continue;
      result.push({
        id: `dynamic_${providerId}`,
        name: provider.name || providerId,
        category: "dynamic",
        icon: "🌐",
        websiteUrl: provider.doc || "",
        apiKeyUrl: "",
        auth: { OPENAI_API_KEY: "" },
        config: buildDynamicPresetConfig(
          provider.name || providerId,
          provider.api
        ),
        baseUrl: provider.api,
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

const buildDynamicPresetConfig = (name, baseUrl) => {
  return `model_provider = "custom"
model = "gpt-4o"
model_reasoning_effort = "medium"
disable_response_storage = true

[model_providers.custom]
name = "${name}"
base_url = "${baseUrl}"
wire_api = "chat"
requires_openai_auth = true`;
};

const applyPreset = (preset) => {
  const config = preset.config;
  const auth = preset.auth || { OPENAI_API_KEY: "" };

  formData.value.config = config;
  formData.value.baseUrl = window.services.extractCodexBaseUrl(config);
  formData.value.model = window.services.extractCodexModelName(config);
  formData.value.wireApi = window.services.extractCodexWireApi(config) || "responses";
  formData.value.reasoningEffort =
    window.services.extractCodexReasoningEffort(config) || "high";
  formData.value.apiKey = auth.OPENAI_API_KEY || "";
  formData.value.authJson = JSON.stringify(auth, null, 2);

  if (dialogMode.value === "create" && !formData.value.id) {
    formData.value.id = preset.id.replace(/^dynamic_/, "");
  }

  showPresetDialog.value = false;
  MessagePlugin.success(`已应用预设: ${preset.name}`);
};

// ==================== Export / Import ====================

const handleExport = () => {
  try {
    const currentProviders = window.services.getCodexProviders();
    if (!currentProviders.length)
      return MessagePlugin.warning("没有 Provider 可导出");
    const compressed = window.services.compressConfigs(currentProviders);
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
  if (!importString.value.trim())
    return MessagePlugin.warning("请粘贴配置字符串");
  try {
    const decompressed = window.services.decompressConfigs(
      importString.value.trim()
    );
    if (!Array.isArray(decompressed))
      return MessagePlugin.error("解压数据格式不正确");

    let addedCount = 0;
    for (const item of decompressed) {
      const { id, auth, config } = item;
      if (!id) continue;
      if (window.services.setCodexProvider(id, { auth, config })) {
        addedCount++;
      }
    }
    MessagePlugin.success(`已导入 ${addedCount} 个 Provider`);
    showImportDialog.value = false;
    loadProviders();
  } catch (e) {
    MessagePlugin.error("导入失败: " + e.message);
  }
};

onMounted(() => {
  loadProviders();
});
</script>

<template>
  <div class="codex-config-view">
    <!-- Section Header -->
    <div class="codex-section-header">
      <span></span>
      <Space size="small">
        <Button size="small" theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template> 新建
        </Button>
        <Button size="small" variant="outline" @click="openPresetDialog">
          <template #icon><ChevronDownIcon /></template> 预设
        </Button>
        <Button size="small" variant="outline" @click="openImportDialog">
          <template #icon><UploadIcon /></template> 导入
        </Button>
        <Button size="small" variant="outline" @click="handleExport">
          <template #icon><DownloadIcon /></template> 导出
        </Button>
        <Button size="small" variant="text" @click="openConfigDir">
          <template #icon><FolderIcon /></template>
        </Button>
      </Space>
    </div>

    <!-- Empty State -->
    <div v-if="!providers.length" class="codex-empty-state">
      <Empty description="暂无 Provider 配置">
        <template #action>
          <Button theme="primary" @click="openCreateDialog">
            <template #icon><AddIcon /></template> 添加第一个 Provider
          </Button>
        </template>
      </Empty>
    </div>

    <!-- Provider List -->
    <div v-else class="codex-provider-list">
      <div
        v-for="provider in providers"
        :key="provider.id"
        class="codex-provider-card"
        :class="{ 'codex-provider-card--active': currentProviderId === provider.id }"
      >
        <div class="codex-provider-card-header">
          <div class="codex-provider-card-info">
            <span class="codex-provider-id">{{ provider.id }}</span>
            <Tag
              v-if="currentProviderId === provider.id"
              size="small"
              theme="primary"
              variant="light"
            >
              当前
            </Tag>
            <Tag
              v-if="window.services.extractCodexWireApi(provider.config) === 'responses'"
              size="small"
              theme="primary"
              variant="light"
            >
              Responses
            </Tag>
            <Tag
              v-else-if="window.services.extractCodexWireApi(provider.config) === 'chat'"
              size="small"
              theme="warning"
              variant="light"
            >
              Chat
            </Tag>
          </div>
          <Space size="small">
            <Tooltip v-if="currentProviderId !== provider.id" content="切换" placement="top">
              <Button
                size="small"
                theme="primary"
                variant="text"
                @click="activateProvider(provider.id)"
              >
                切换
              </Button>
            </Tooltip>
            <Tooltip content="编辑" placement="top">
              <Button
                size="small"
                theme="default"
                variant="text"
                @click="openEditDialog(provider)"
              >
                <EditIcon />
              </Button>
            </Tooltip>
            <Popconfirm
              theme="danger"
              content="确定要删除这个 Provider 吗？"
              @confirm="deleteProvider(provider.id)"
            >
              <Tooltip content="删除" placement="top">
                <Button size="small" theme="danger" variant="text">
                  <DeleteIcon />
                </Button>
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>
        <div class="codex-provider-card-body">
          <span class="codex-provider-name">
            {{ window.services.extractCodexProviderName(provider.config) || provider.id }}
          </span>
          <Tag
            v-if="window.services.extractCodexModelName(provider.config)"
            size="small"
            variant="outline"
            theme="default"
          >
            {{ window.services.extractCodexModelName(provider.config) }}
          </Tag>
          <span
            v-if="window.services.extractCodexBaseUrl(provider.config)"
            class="codex-provider-url"
          >
            {{ maskUrl(window.services.extractCodexBaseUrl(provider.config)) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <Dialog
      v-model:visible="showDialog"
      :header="dialogTitle"
      width="640px"
      :footer="false"
    >
      <div class="codex-form">
        <!-- Provider ID -->
        <div class="codex-form-item">
          <label>Provider ID <span class="required">*</span></label>
          <Input
            v-model="formData.id"
            placeholder="例如: openai"
            :disabled="dialogMode === 'edit'"
          />
        </div>

        <!-- API Key -->
        <div class="codex-form-item">
          <label>API Key</label>
          <ApiKeyInput
            :model-value="formData.apiKey"
            placeholder="sk-..."
            @update:model-value="handleApiKeyChange"
          />
        </div>

        <!-- Base URL -->
        <div class="codex-form-item">
          <label>Base URL</label>
          <Input
            v-model="formData.baseUrl"
            placeholder="https://api.openai.com/v1"
            @change="handleBaseUrlChange"
          />
        </div>

        <!-- Model -->
        <div class="codex-form-item">
          <label>Model</label>
          <div class="codex-model-row">
            <Select
              v-if="fetchedModels.length"
              v-model="formData.model"
              :options="modelOptions"
              placeholder="选择模型"
              filterable
              @change="handleModelChange"
            />
            <Input
              v-else
              v-model="formData.model"
              placeholder="gpt-4o"
              @change="handleModelChange"
            />
            <Button
              size="small"
              variant="outline"
              :loading="fetchingModels"
              @click="fetchModels"
            >
              <template #icon><RefreshIcon /></template>
              获取模型
            </Button>
          </div>
        </div>

        <!-- Wire API -->
        <div class="codex-form-item">
          <label>API 格式</label>
          <Select
            v-model="formData.wireApi"
            :options="WIRE_API_OPTIONS"
            @change="handleWireApiChange"
          />
        </div>

        <!-- Reasoning Effort -->
        <div class="codex-form-item">
          <label>Reasoning Effort</label>
          <Select
            v-model="formData.reasoningEffort"
            :options="REASONING_EFFORT_OPTIONS"
            @change="handleReasoningEffortChange"
          />
        </div>

        <!-- TOML Editor -->
        <div class="codex-form-section">
          <div
            class="codex-form-section-title"
            style="cursor: pointer; display: flex; align-items: center; gap: 4px"
            @click="showTomlEditor = !showTomlEditor"
          >
            config.toml (高级)
            <ChevronDownIcon
              :style="{ transform: showTomlEditor ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }"
              size="14px"
            />
          </div>
          <div v-if="showTomlEditor">
            <Textarea
              v-model="formData.config"
              class="codex-raw-editor"
              :autosize="{ minRows: 8, maxRows: 20 }"
              @change="handleTomlChange"
            />
          </div>
        </div>

        <!-- Auth JSON Editor -->
        <div class="codex-form-section">
          <div
            class="codex-form-section-title"
            style="cursor: pointer; display: flex; align-items: center; gap: 4px"
            @click="showAuthEditor = !showAuthEditor"
          >
            auth.json (高级)
            <ChevronDownIcon
              :style="{ transform: showAuthEditor ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }"
              size="14px"
            />
          </div>
          <div v-if="showAuthEditor">
            <Textarea
              v-model="formData.authJson"
              class="codex-raw-editor"
              :autosize="{ minRows: 3, maxRows: 10 }"
              @change="handleAuthJsonChange"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="codex-dialog-footer">
          <div></div>
          <div class="codex-dialog-footer-right">
            <Button variant="outline" @click="showDialog = false">取消</Button>
            <Button theme="primary" @click="saveProvider">保存</Button>
          </div>
        </div>
      </template>
    </Dialog>

    <!-- Preset Dialog -->
    <Dialog
      v-model:visible="showPresetDialog"
      header="选择预设"
      width="520px"
      :footer="false"
    >
      <div class="codex-preset-toolbar">
        <Input
          v-model="presetSearch"
          placeholder="搜索预设..."
          clearable
          class="codex-preset-search"
        >
          <template #prefixIcon><SearchIcon /></template>
        </Input>
        <Button
          size="small"
          variant="text"
          @click="fetchPresets"
          :loading="presetsLoading"
        >
          <template #icon><RefreshIcon /></template>
        </Button>
      </div>
      <div v-if="presetsLoading" class="codex-preset-loading">加载中...</div>
      <div v-else-if="presetsError" class="codex-preset-error">
        {{ presetsError }}
        <Button size="small" variant="outline" @click="fetchPresets">重试</Button>
      </div>
      <div v-else-if="!filteredPresets.length" class="codex-preset-empty">
        无匹配的预设
      </div>
      <div v-else class="codex-preset-list">
        <div
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="codex-preset-item"
          @click="applyPreset(preset)"
        >
          <div class="codex-preset-name">
            {{ preset.icon || "" }} {{ preset.name }}
          </div>
          <div class="codex-preset-desc">
            <Tag size="small" variant="light" theme="default">
              {{ CATEGORY_LABELS[preset.category] || preset.category }}
            </Tag>
            <span v-if="preset.baseUrl" class="codex-preset-url">
              {{ maskUrl(preset.baseUrl) }}
            </span>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Import Dialog -->
    <Dialog
      v-model:visible="showImportDialog"
      header="从字符串导入"
      width="480px"
      @confirm="handleImport"
    >
      <div class="codex-form">
        <Textarea
          v-if="showImportDialog"
          v-model="importString"
          class="codex-import-textarea"
          placeholder="粘贴配置字符串"
          :autosize="{ minRows: 4, maxRows: 8 }"
        />
      </div>
    </Dialog>
  </div>
</template>
