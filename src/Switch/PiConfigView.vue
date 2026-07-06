<script setup>
import { ref, onMounted } from "vue";
import {
  Card, Empty, Button, Tag, Space, Tooltip, Dialog, Input, InputNumber, MessagePlugin, Table, Loading, Popconfirm,
} from "tdesign-vue-next";
import {
  RefreshIcon, EditIcon, FolderOpen1Icon, StarIcon, ChevronDownIcon, ChevronRightIcon,
  AddIcon, DeleteIcon,
} from "tdesign-icons-vue-next";
import "./styles/PiConfigView.css";

const loading = ref(false);
const providers = ref([]);
const expanded = ref(new Set());
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
  } catch (e) {
    console.error("加载 Pi 供应商失败:", e);
    providers.value = [];
  }
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
  addModelDialog.value = true;
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
      width="480px"
      :confirm-btn="{ content: '添加', theme: 'primary' }"
      @confirm="handleAddModel"
    >
      <div class="pi-edit-form">
        <div class="pi-form-item">
          <label>所属供应商</label>
          <div class="pi-edit-provider-name">{{ addModelProvider }}</div>
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
