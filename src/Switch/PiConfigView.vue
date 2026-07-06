<script setup>
import { ref, onMounted } from "vue";
import {
  Card, Empty, Button, Tag, Space, Tooltip, Dialog, Input, InputNumber, MessagePlugin, Table, Loading, Popconfirm, Alert as TAlert,
} from "tdesign-vue-next";
import {
  RefreshIcon, EditIcon, FolderOpen1Icon, StarIcon, ChevronDownIcon, ChevronRightIcon,
  AddIcon, DeleteIcon,
} from "tdesign-icons-vue-next";
import "./styles/PiConfigView.css";

const loading = ref(false);
const providers = ref([]);
const expanded = ref(new Set());
const warningMsg = ref("");
const editDialog = ref(false);
const editingProvider = ref(null);
const editForm = ref({ apiKey: '', baseUrl: '' });
const addProviderDialog = ref(false);
const addProviderForm = ref({ name: '', apiKey: '', baseUrl: '' });
const addModelDialog = ref(false);
const addModelProvider = ref(null);
const addModelForm = ref({ id: '', name: '', contextWindow: 0, maxTokens: 0, reasoning: false });

const toggleExpand = (name) => {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
};

const loadProviders = () => {
  try {
    providers.value = window.services.getPiProviderList();
    validateConfig();
  } catch (e) {
    console.error("加载 Pi 供应商失败:", e);
    providers.value = [];
  }
};

// 校验 defaultModel 是否在 defaultProvider 下，否则 Pi CLI 会报"无可用模型"
const validateConfig = () => {
  try {
    const settings = window.services.readPiSettings();
    const defProv = settings.defaultProvider;
    const defModel = settings.defaultModel;
    if (!defProv) { warningMsg.value = "未设置默认供应商，Pi CLI 可能无法启动"; return; }
    if (!defModel) { warningMsg.value = "未设置默认模型，请在 [默认] 模型上点击星标设置"; return; }
    const prov = providers.value.find(p => p.name === defProv);
    if (!prov) { warningMsg.value = `默认供应商 "${defProv}" 不存在于 models.json`; return; }
    if (!prov.models.some(m => m.id === defModel)) {
      warningMsg.value = `默认模型 "${defModel}" 不在供应商 "${defProv}" 下，Pi CLI 将报"无可用模型"`;
      return;
    }
    warningMsg.value = "";
  } catch { /* ignore */ }
};

const handleEdit = (provider) => {
  editingProvider.value = provider.name;
  editForm.value = { apiKey: provider.apiKey || '', baseUrl: provider.baseUrl || '' };
  editDialog.value = true;
};

const handleSaveProvider = async () => {
  try {
    window.services.updatePiProvider(editingProvider.value, editForm.value);
    MessagePlugin.success("供应商配置已更新");
    editDialog.value = false;
    loadProviders();
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

const setDefaultProvider = (name) => {
  try {
    window.services.setPiDefaultProvider(name);
    loadProviders();
  } catch (e) {
    MessagePlugin.error("设置默认供应商失败: " + e.message);
  }
};

const setDefaultModel = (providerName, modelId) => {
  try {
    window.services.setPiDefaultModel(modelId);
    // Update local state to show the new default model
    loadProviders();
  } catch (e) {
    MessagePlugin.error("设置默认模型失败: " + e.message);
  }
};

const openAddProviderDialog = () => {
  addProviderForm.value = { name: '', apiKey: '', baseUrl: '' };
  addProviderDialog.value = true;
};

const handleAddProvider = async () => {
  try {
    const name = addProviderForm.value.name.trim();
    if (!name) { MessagePlugin.warning('请输入供应商名称'); return; }
    window.services.addPiProvider(name, { apiKey: addProviderForm.value.apiKey, baseUrl: addProviderForm.value.baseUrl });
    MessagePlugin.success(`供应商 ${name} 已添加`);
    addProviderDialog.value = false;
    loadProviders();
  } catch (e) {
    MessagePlugin.error('添加失败: ' + e.message);
  }
};

const handleDeleteProvider = async (providerName) => {
  try {
    window.services.deletePiProvider(providerName);
    MessagePlugin.success(`供应商 ${providerName} 已删除`);
    loadProviders();
  } catch (e) {
    MessagePlugin.error('删除失败: ' + e.message);
  }
};

const openAddModelDialog = (providerName) => {
  addModelProvider.value = providerName;
  addModelForm.value = { id: '', name: '', contextWindow: 0, maxTokens: 0, reasoning: false };
  autoModels.value = [];
  autoModelsLoading.value = false;
  addModelDialog.value = true;
};

const autoModels = ref([]);
const autoModelsLoading = ref(false);

const handleAutoFetchModels = async () => {
  const prov = providers.value.find(p => p.name === addModelProvider.value);
  if (!prov || !prov.baseUrl) {
    MessagePlugin.warning('该供应商未配置 Base URL，无法自动获取');
    return;
  }
  autoModelsLoading.value = true;
  try {
    const list = await window.services.fetchProviderModels(prov.baseUrl, prov.apiKey);
    autoModels.value = list;
    if (list.length === 0) MessagePlugin.info('接口返回空列表');
  } catch (e) {
    MessagePlugin.error('获取失败: ' + e.message);
  } finally {
    autoModelsLoading.value = false;
  }
};

const applyAutoModel = (m) => {
  addModelForm.value = {
    id: m.id,
    name: m.name || m.id,
    contextWindow: m.contextWindow || 0,
    maxTokens: m.maxTokens || 0,
    reasoning: !!m.reasoning,
  };
};

const handleAddModel = async () => {
  try {
    const id = addModelForm.value.id.trim();
    if (!id) { MessagePlugin.warning('请输入模型 ID'); return; }
    window.services.addPiModel(addModelProvider.value, {
      id,
      name: addModelForm.value.name.trim() || id,
      contextWindow: Number(addModelForm.value.contextWindow) || 0,
      maxTokens: Number(addModelForm.value.maxTokens) || 0,
      reasoning: addModelForm.value.reasoning,
    });
    MessagePlugin.success(`模型 ${id} 已添加`);
    addModelDialog.value = false;
    loadProviders();
  } catch (e) {
    MessagePlugin.error('添加失败: ' + e.message);
  }
};

const handleDeleteModel = async (providerName, modelId) => {
  try {
    window.services.deletePiModel(providerName, modelId);
    MessagePlugin.success(`模型 ${modelId} 已删除`);
    loadProviders();
  } catch (e) {
    MessagePlugin.error('删除失败: ' + e.message);
  }
};

const formatNumber = (n) => {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
};

const openPiDir = () => {
  try { window.services.openPiDir(); } catch { /* ignore */ }
};

const refresh = () => {
  loading.value = true;
  setTimeout(() => { loadProviders(); loading.value = false; }, 50);
};

onMounted(refresh);
</script>

<template>
  <div class="pi-config-container">
    <div class="pi-config-header">
      <span class="pi-config-tip">
        Pi Agent 供应商与模型配置 —
        <span class="hint-link" @click="openPiDir">~/.pi/agent</span>
      </span>
      <div class="pi-config-actions">
        <Tooltip content="添加供应商" placement="top">
          <Button size="small" variant="outline" @click="openAddProviderDialog">
            <template #icon><AddIcon /></template> 添加供应商
          </Button>
        </Tooltip>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template> 刷新
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="warningMsg" class="pi-config-warning">
      <t-alert :message="warningMsg" theme="warning" show-icon />
    </div>

    <div v-if="providers.length === 0" class="pi-config-empty">
      <Empty description="未检测到 Pi 供应商配置，请在终端中配置或手动编辑 models.json" />
    </div>

    <div v-else class="pi-provider-list">
      <Card v-for="prov in providers" :key="prov.name" :bordered="true" class="pi-provider-card">
        <template #header>
          <div class="pi-provider-header" @click="toggleExpand(prov.name)">
            <div class="pi-provider-header-left">
              <span v-if="expanded.has(prov.name)" class="pi-expand-icon"><ChevronDownIcon /></span>
              <span v-else class="pi-expand-icon"><ChevronRightIcon /></span>
              <span class="pi-provider-name">{{ prov.name }}</span>
              <Tag v-if="prov.isDefault" size="small" theme="warning" variant="light">默认</Tag>
              <Tag size="small" variant="outline">{{ prov.api || 'openai-completions' }}</Tag>
            </div>
            <div class="pi-provider-header-right" @click.stop>
              <span class="pi-model-count">{{ prov.models.length }} 个模型</span>
              <Space size="small">
                <Tooltip content="设为默认供应商" placement="top">
                  <Button v-if="!prov.isDefault" size="small" variant="text" @click="setDefaultProvider(prov.name)">
                    <template #icon><StarIcon /></template>
                  </Button>
                </Tooltip>
                <Tooltip content="编辑配置" placement="top">
                  <Button size="small" variant="text" @click="handleEdit(prov)">
                    <template #icon><EditIcon /></template>
                  </Button>
                </Tooltip>
                <Popconfirm content="确定删除此供应商？其下所有模型也会被删除。" @confirm="handleDeleteProvider(prov.name)">
                  <Button size="small" variant="text" theme="danger">
                    <template #icon><DeleteIcon /></template>
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          </div>
        </template>

        <template v-if="expanded.has(prov.name)">
          <div class="pi-provider-info">
            <div class="pi-info-row">
              <span class="pi-info-label">API Key</span>
              <span class="pi-info-value mono">{{ prov.apiKey ? prov.apiKey.slice(0, 8) + '...' + prov.apiKey.slice(-4) : '未设置' }}</span>
            </div>
            <div class="pi-info-row">
              <span class="pi-info-label">Base URL</span>
              <span class="pi-info-value mono">{{ prov.baseUrl || '默认' }}</span>
            </div>
          </div>

          <div class="pi-models-section">
            <div class="pi-models-title">
              <span>模型列表</span>
              <Button size="small" variant="text" @click="openAddModelDialog(prov.name)">
                <template #icon><AddIcon /></template> 添加模型
              </Button>
            </div>
            <div class="pi-model-item" v-for="m in prov.models" :key="m.id">
              <div class="pi-model-info">
                <span class="pi-model-name">{{ m.name }}</span>
                <span class="pi-model-id mono">{{ m.id }}</span>
                <Tag v-if="m.reasoning" size="small" theme="warning" variant="light">推理</Tag>
              </div>
              <div class="pi-model-meta">
                <span class="pi-model-stat">上下文: {{ formatNumber(m.contextWindow) }}</span>
                <span class="pi-model-stat">最大输出: {{ formatNumber(m.maxTokens) }}</span>
                <span v-if="m.cost && m.cost.input != null" class="pi-model-stat">
                  费用: ¥{{ m.cost.input }}/1K in · ¥{{ m.cost.output }}/1K out
                </span>
              </div>
              <div class="pi-model-actions" @click.stop>
                <Tooltip content="设为默认模型" placement="top">
                  <Button size="small" variant="text" @click="setDefaultModel(prov.name, m.id)">
                    <template #icon><StarIcon /></template>
                  </Button>
                </Tooltip>
                <Popconfirm content="确定删除此模型？" @confirm="handleDeleteModel(prov.name, m.id)">
                  <Button size="small" variant="text" theme="danger">
                    <template #icon><DeleteIcon /></template>
                  </Button>
                </Popconfirm>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </div>

    <Dialog
      v-model:visible="editDialog"
      header="编辑供应商配置"
      width="480px"
      :confirm-btn="{ content: '保存', theme: 'primary' }"
      @confirm="handleSaveProvider"
    >
      <div class="pi-edit-form">
        <div class="pi-form-item">
          <label>供应商</label>
          <div class="pi-edit-provider-name">{{ editingProvider }}</div>
        </div>
        <div class="pi-form-item">
          <label>API Key</label>
          <Input v-model="editForm.apiKey" placeholder="输入 API Key" />
        </div>
        <div class="pi-form-item">
          <label>Base URL</label>
          <Input v-model="editForm.baseUrl" placeholder="留空则使用默认 URL" />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="addProviderDialog"
      header="添加供应商"
      width="480px"
      :confirm-btn="{ content: '添加', theme: 'primary' }"
      @confirm="handleAddProvider"
    >
      <div class="pi-edit-form">
        <div class="pi-form-item">
          <label>供应商名称 <span class="pi-form-required">*</span></label>
          <Input v-model="addProviderForm.name" placeholder="例如：openai、deepseek、zhipu" />
        </div>
        <div class="pi-form-item">
          <label>API Key</label>
          <Input v-model="addProviderForm.apiKey" placeholder="输入 API Key（可留空后续再填）" />
        </div>
        <div class="pi-form-item">
          <label>Base URL</label>
          <Input v-model="addProviderForm.baseUrl" placeholder="留空使用供应商默认 URL" />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="addModelDialog"
      header="添加模型"
      width="520px"
      :confirm-btn="{ content: '添加', theme: 'primary' }"
      @confirm="handleAddModel"
    >
      <div class="pi-edit-form">
        <div class="pi-form-item">
          <label>所属供应商</label>
          <div class="pi-edit-provider-name">{{ addModelProvider }}</div>
        </div>

        <!-- 自动获取模型 -->
        <div class="pi-form-item">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <label>从供应商接口自动获取</label>
            <Button size="small" variant="outline" :loading="autoModelsLoading" @click="handleAutoFetchModels">
              <template #icon><RefreshIcon /></template> 自动获取
            </Button>
          </div>
          <div v-if="autoModels.length > 0" class="pi-auto-model-list">
            <div
              v-for="m in autoModels"
              :key="m.id"
              class="pi-auto-model-item"
              @click="applyAutoModel(m)"
            >
              <span class="pi-auto-model-id">{{ m.name || m.id }}</span>
              <span v-if="m.contextWindow" class="pi-auto-model-meta">{{ formatNumber(m.contextWindow) }} ctx</span>
              <span v-if="m.reasoning" class="pi-auto-model-tag">推理</span>
            </div>
          </div>
          <div v-else-if="!autoModelsLoading" class="pi-form-hint">
            点击「自动获取」从供应商 /models 接口拉取，点击列表项即可自动填入
          </div>
        </div>

        <div class="pi-form-item">
          <label>模型 ID <span class="pi-form-required">*</span></label>
          <Input v-model="addModelForm.id" placeholder="例如：gpt-4o、deepseek-chat" />
        </div>
        <div class="pi-form-item">
          <label>显示名称</label>
          <Input v-model="addModelForm.name" placeholder="留空则使用模型 ID" />
        </div>
        <div class="pi-form-row">
          <div class="pi-form-item">
            <label>上下文窗口</label>
            <InputNumber v-model="addModelForm.contextWindow" :min="0" placeholder="如 128000" />
          </div>
          <div class="pi-form-item">
            <label>最大输出</label>
            <InputNumber v-model="addModelForm.maxTokens" :min="0" placeholder="如 8192" />
          </div>
        </div>
        <div class="pi-form-item">
          <label>
            <input type="checkbox" v-model="addModelForm.reasoning" /> 推理模型
          </label>
        </div>
      </div>
    </Dialog>
  </div>
</template>
