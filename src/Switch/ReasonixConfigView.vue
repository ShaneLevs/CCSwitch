<script setup>
import { ref, computed, onMounted } from "vue";
import {
  Card, Empty, Button, Tag, Space, Dialog, Input, InputNumber, MessagePlugin,
  Select, Popconfirm, Alert as TAlert,
} from "tdesign-vue-next";
import {
  RefreshIcon, EditIcon, FolderOpen1Icon, AddIcon, DeleteIcon,
  ChevronDownIcon, ChevronRightIcon,
} from "tdesign-icons-vue-next";
import ApiKeyInput from "../components/ApiKeyInput.vue";
import "./styles/ReasonixConfigView.css";

const loading = ref(false);
const warningMsg = ref("");
const providers = ref([]);
const defaultModel = ref("");
const expanded = ref(new Set());

// ==================== 弹窗状态 ====================

const addProviderDialog = ref(false);
const addProviderForm = ref({ name: "", kind: "openai", baseUrl: "", chatUrl: "", modelsUrl: "", apiKeyEnv: "", apiKey: "", contextWindow: 0, maxOutputTokens: 0 });
const editDialog = ref(false);
const editingProvider = ref("");
const editForm = ref({ name: "", kind: "openai", baseUrl: "", chatUrl: "", modelsUrl: "", apiKeyEnv: "", apiKey: "", contextWindow: 0, maxOutputTokens: 0 });

const addModelDialog = ref(false);
const addModelProvider = ref("");
const addModelId = ref("");

// ==================== 数据加载 ====================

const refresh = () => {
  loading.value = true;
  warningMsg.value = "";
  try {
    providers.value = window.services.getReasonixProviderList() || [];
    defaultModel.value = window.services.getReasonixDefaultModel() || "";
  } catch (e) {
    console.error("加载 Reasonix 配置失败:", e);
    warningMsg.value = e.message || "加载失败";
  } finally {
    loading.value = false;
  }
};

const toggleExpand = (name) => {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
};

// ==================== 默认模型 ====================

const defaultModelOptions = computed(() => {
  const opts = [{ label: "（未设置）", value: "" }];
  for (const p of providers.value) {
    if (p.default) opts.push({ label: `${p.name}（默认 ${p.default}）`, value: p.name });
    for (const m of p.models) opts.push({ label: `${p.name}/${m}`, value: `${p.name}/${m}` });
  }
  return opts;
});

const handleSetDefaultModel = () => {
  try {
    window.services.setReasonixDefaultModel(defaultModel.value);
    MessagePlugin.success("默认模型已更新");
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

// ==================== 供应商 CRUD ====================

const emptyProviderForm = () => ({ name: "", kind: "openai", baseUrl: "", chatUrl: "", modelsUrl: "", apiKeyEnv: "", apiKey: "", contextWindow: 0, maxOutputTokens: 0 });

const buildProviderPayload = (form) => ({
  name: form.name,
  kind: form.kind,
  baseUrl: form.baseUrl,
  chatUrl: form.chatUrl,
  modelsUrl: form.modelsUrl,
  apiKeyEnv: form.apiKeyEnv,
  apiKey: form.apiKey,
  contextWindow: Number(form.contextWindow) || 0,
  maxOutputTokens: Number(form.maxOutputTokens) || 0,
});

const openAddProviderDialog = () => {
  addProviderForm.value = emptyProviderForm();
  addProviderDialog.value = true;
};

const handleAddProvider = () => {
  try {
    const name = addProviderForm.value.name.trim();
    if (!name) { MessagePlugin.warning("请输入供应商名称"); return; }
    const form = { ...addProviderForm.value, name, apiKeyEnv: addProviderForm.value.apiKeyEnv.trim() };
    if (!form.apiKeyEnv) form.apiKeyEnv = `${name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_API_KEY`;
    window.services.addReasonixProvider(buildProviderPayload(form));
    MessagePlugin.success(`供应商 ${name} 已添加`);
    addProviderDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("添加失败: " + e.message);
  }
};

const handleEdit = (provider) => {
  editingProvider.value = provider.name;
  editForm.value = {
    name: provider.name,
    kind: provider.kind || "openai",
    baseUrl: provider.baseUrl || "",
    chatUrl: provider.chatUrl || "",
    modelsUrl: provider.modelsUrl || "",
    apiKeyEnv: provider.apiKeyEnv || "",
    apiKey: window.services.getReasonixApiKey(provider.apiKeyEnv) || "",
    contextWindow: provider.contextWindow || 0,
    maxOutputTokens: provider.maxOutputTokens || 0,
  };
  editDialog.value = true;
};

const handleSaveProvider = () => {
  try {
    const { name, ...rest } = editForm.value;
    window.services.updateReasonixProvider(editingProvider.value, buildProviderPayload({ ...rest, name: editingProvider.value }));
    MessagePlugin.success("供应商配置已更新");
    editDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

const handleDeleteProvider = (providerName) => {
  try {
    window.services.deleteReasonixProvider(providerName);
    MessagePlugin.success(`供应商 ${providerName} 已删除`);
    refresh();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
  }
};

// ==================== 模型 CRUD ====================

const openAddModelDialog = (providerName) => {
  addModelProvider.value = providerName;
  addModelId.value = "";
  addModelDialog.value = true;
};

const handleAddModel = () => {
  try {
    const id = addModelId.value.trim();
    if (!id) { MessagePlugin.warning("请输入模型 ID"); return; }
    window.services.addReasonixModel(addModelProvider.value, id);
    MessagePlugin.success(`模型 ${id} 已添加`);
    addModelDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("添加失败: " + e.message);
  }
};

const handleDeleteModel = (providerName, modelId) => {
  try {
    window.services.deleteReasonixModel(providerName, modelId);
    MessagePlugin.success(`模型 ${modelId} 已删除`);
    refresh();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
  }
};

const formatNumber = (n) => {
  if (!n) return "";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
};

const openReasonixDir = () => {
  try { window.services.openReasonixDir(); } catch { /* ignore */ }
};

onMounted(refresh);
</script>

<template>
  <div class="reasonix-config-container">
    <div class="reasonix-config-header">
      <span class="reasonix-config-tip">
        Reasonix 配置 — 供应商见
        <span class="hint-link" @click="openReasonixDir">~/.reasonix/config.toml</span>，密钥存于
        <span class="hint-link" @click="openReasonixDir">~/.reasonix/.env</span>
      </span>
      <div class="reasonix-config-actions">
        <Button size="small" variant="outline" @click="openReasonixDir">
          <template #icon><FolderOpen1Icon /></template> 打开目录
        </Button>
        <Button size="small" variant="outline" :loading="loading" @click="refresh">
          <template #icon><RefreshIcon /></template> 刷新
        </Button>
      </div>
    </div>

    <div v-if="warningMsg" class="reasonix-config-warning">
      <t-alert :message="warningMsg" theme="warning" show-icon />
    </div>

    <template v-if="!loading">
      <!-- 默认模型 -->
      <Card :bordered="true" class="reasonix-default-card">
        <template #header>
          <div class="reasonix-default-header">
            <Space size="12px" align="center">
              <span class="reasonix-block-title">默认模型</span>
              <span class="reasonix-block-sub">config.toml · default_model</span>
            </Space>
          </div>
        </template>
        <div class="reasonix-default-row">
          <Select
            v-model="defaultModel"
            :options="defaultModelOptions"
            :min-column-width="240"
            filterable
            class="reasonix-default-select"
          />
          <Button size="small" theme="primary" variant="base" @click="handleSetDefaultModel">
            保存
          </Button>
        </div>
      </Card>

      <!-- 供应商与模型 -->
      <div class="reasonix-providers-header">
        <Space size="12px" align="center">
          <span class="reasonix-block-title">供应商与模型</span>
          <Tag size="small" variant="outline">{{ providers.length }} 个</Tag>
        </Space>
        <Button size="small" variant="outline" @click="openAddProviderDialog">
          <template #icon><AddIcon /></template> 添加供应商
        </Button>
      </div>

      <div v-if="providers.length === 0" class="reasonix-config-empty">
        <Empty description="未检测到 Reasonix 供应商配置，请运行 reasonix setup 或手动编辑 config.toml" />
      </div>

      <div v-else class="reasonix-provider-list">
        <Card
          v-for="p in providers"
          :key="p.name"
          :bordered="true"
          class="reasonix-provider-card"
          :class="{ 'reasonix-provider-card--active': expanded.has(p.name) }"
        >
          <div class="reasonix-provider-header" @click="toggleExpand(p.name)">
            <div class="reasonix-provider-header-left">
              <span class="reasonix-expand-icon">
                <ChevronDownIcon v-if="expanded.has(p.name)" size="16px" />
                <ChevronRightIcon v-else size="16px" />
              </span>
              <span class="reasonix-provider-name">{{ p.name }}</span>
              <Tag size="small" variant="outline">{{ p.kind }}</Tag>
              <Tag
                v-if="p.default"
                size="small"
                theme="success"
                variant="light"
              >默认 {{ p.default }}</Tag>
              <span class="reasonix-model-count">{{ p.models.length }} 个模型</span>
            </div>
            <div class="reasonix-provider-header-right" @click.stop>
              <Button size="small" theme="default" variant="text" @click="handleEdit(p)">
                <template #icon><EditIcon /></template>
              </Button>
              <Popconfirm
                content="删除该供应商及其所有模型？"
                theme="danger"
                @confirm="handleDeleteProvider(p.name)"
              >
                <Button size="small" theme="danger" variant="text">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </div>
          </div>

          <div v-if="expanded.has(p.name)" class="reasonix-provider-info">
            <div class="reasonix-info-row"><span class="reasonix-info-label">Base URL</span><span class="reasonix-info-value">{{ p.baseUrl || "—" }}</span></div>
            <div v-if="p.chatUrl" class="reasonix-info-row"><span class="reasonix-info-label">Chat URL</span><span class="reasonix-info-value">{{ p.chatUrl }}</span></div>
            <div v-if="p.modelsUrl" class="reasonix-info-row"><span class="reasonix-info-label">Models URL</span><span class="reasonix-info-value">{{ p.modelsUrl }}</span></div>
            <div class="reasonix-info-row"><span class="reasonix-info-label">Key 环境变量</span><span class="reasonix-info-value mono">{{ p.apiKeyEnv || "—" }}</span></div>
            <div v-if="p.contextWindow || p.maxOutputTokens" class="reasonix-info-row">
              <span class="reasonix-info-label">限制</span>
              <span class="reasonix-info-value">
                <template v-if="p.contextWindow">上下文 {{ formatNumber(p.contextWindow) }}</template>
                <template v-if="p.contextWindow && p.maxOutputTokens"> · </template>
                <template v-if="p.maxOutputTokens">输出 {{ formatNumber(p.maxOutputTokens) }}</template>
              </span>
            </div>

            <div class="reasonix-models-section">
              <div class="reasonix-models-title">
                <span>模型</span>
                <Button size="small" variant="outline" @click="openAddModelDialog(p.name)">
                  <template #icon><AddIcon /></template> 添加模型
                </Button>
              </div>
              <div v-if="p.models.length === 0" class="reasonix-models-empty">暂无模型</div>
              <div v-for="m in p.models" :key="m" class="reasonix-model-item">
                <span class="reasonix-model-name">{{ m }}</span>
                <Tag v-if="p.default === m" size="small" theme="success" variant="light">默认</Tag>
                <div class="reasonix-model-actions">
                  <Popconfirm
                    content="删除模型？"
                    theme="danger"
                    @confirm="handleDeleteModel(p.name, m)"
                  >
                    <Button size="small" theme="danger" variant="text">
                      <template #icon><DeleteIcon /></template>
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <!-- 添加供应商弹窗 -->
    <Dialog v-model:visible="addProviderDialog" header="添加供应商" width="520px" :confirm-btn="{ content: '添加', theme: 'primary' }" @confirm="handleAddProvider">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item"><label>名称 <span class="reasonix-form-required">*</span></label><Input v-model="addProviderForm.name" placeholder="deepseek" /></div>
        <div class="reasonix-form-item"><label>Kind</label><Select v-model="addProviderForm.kind" :options="[{ label: 'openai', value: 'openai' }]" /></div>
        <div class="reasonix-form-item"><label>Base URL</label><Input v-model="addProviderForm.baseUrl" placeholder="https://api.deepseek.com" /></div>
        <div class="reasonix-form-row">
          <div class="reasonix-form-item"><label>Chat URL（可选）</label><Input v-model="addProviderForm.chatUrl" placeholder="完整 chat/completions URL" /></div>
        </div>
        <div class="reasonix-form-item"><label>Models URL（可选）</label><Input v-model="addProviderForm.modelsUrl" placeholder="模型发现 URL" /></div>
        <div class="reasonix-form-item"><label>Key 环境变量</label><Input v-model="addProviderForm.apiKeyEnv" placeholder="留空自动生成，如 DEEPSEEK_API_KEY" /></div>
        <div class="reasonix-form-item"><label>API Key</label><ApiKeyInput v-model="addProviderForm.apiKey" placeholder="写入 ~/.reasonix/.env" /></div>
        <div class="reasonix-form-row">
          <div class="reasonix-form-item"><label>上下文窗口</label><InputNumber v-model="addProviderForm.contextWindow" :min="0" :step="1000" /></div>
          <div class="reasonix-form-item"><label>最大输出</label><InputNumber v-model="addProviderForm.maxOutputTokens" :min="0" :step="1000" /></div>
        </div>
      </div>
    </Dialog>

    <!-- 编辑供应商弹窗 -->
    <Dialog v-model:visible="editDialog" header="编辑供应商配置" width="520px" :confirm-btn="{ content: '保存', theme: 'primary' }" @confirm="handleSaveProvider">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item"><label>名称（不可改名）</label><Input :value="editForm.name" disabled /></div>
        <div class="reasonix-form-item"><label>Kind</label><Select v-model="editForm.kind" :options="[{ label: 'openai', value: 'openai' }]" /></div>
        <div class="reasonix-form-item"><label>Base URL</label><Input v-model="editForm.baseUrl" placeholder="https://api.deepseek.com" /></div>
        <div class="reasonix-form-item"><label>Chat URL（可选）</label><Input v-model="editForm.chatUrl" /></div>
        <div class="reasonix-form-item"><label>Models URL（可选）</label><Input v-model="editForm.modelsUrl" /></div>
        <div class="reasonix-form-item"><label>Key 环境变量</label><Input v-model="editForm.apiKeyEnv" /></div>
        <div class="reasonix-form-item"><label>API Key</label><ApiKeyInput v-model="editForm.apiKey" :placeholder="editForm.apiKeyEnv ? '已保存，留空则不修改' : '写入 ~/.reasonix/.env'" /></div>
        <div class="reasonix-form-row">
          <div class="reasonix-form-item"><label>上下文窗口</label><InputNumber v-model="editForm.contextWindow" :min="0" :step="1000" /></div>
          <div class="reasonix-form-item"><label>最大输出</label><InputNumber v-model="editForm.maxOutputTokens" :min="0" :step="1000" /></div>
        </div>
      </div>
    </Dialog>

    <!-- 添加模型弹窗 -->
    <Dialog v-model:visible="addModelDialog" header="添加模型" width="420px" :confirm-btn="{ content: '添加', theme: 'primary' }" @confirm="handleAddModel">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item">
          <label>模型 ID <span class="reasonix-form-required">*</span></label>
          <Input v-model="addModelId" placeholder="deepseek-v4-flash" @enter="handleAddModel" />
        </div>
        <div class="reasonix-form-hint">供应商：{{ addModelProvider }}</div>
      </div>
    </Dialog>
  </div>
</template>
