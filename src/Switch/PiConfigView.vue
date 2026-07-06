<script setup>
import { ref, onMounted } from "vue";
import {
  Card, Empty, Button, Tag, Space, Tooltip, Dialog, Input, MessagePlugin, Table, Loading,
} from "tdesign-vue-next";
import { RefreshIcon, EditIcon, FolderOpen1Icon, StarIcon, ChevronDownIcon, ChevronRightIcon } from "tdesign-icons-vue-next";
import "./styles/PiConfigView.css";

const loading = ref(false);
const providers = ref([]);
const expanded = ref(new Set());
const editDialog = ref(false);
const editingProvider = ref(null);
const editForm = ref({ apiKey: '', baseUrl: '' });

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
            <div class="pi-models-title">模型列表</div>
            <div class="pi-model-item" v-for="m in prov.models" :key="m.id">
              <div class="pi-model-info">
                <span class="pi-model-name">{{ m.name }}</span>
                <span class="pi-model-id mono">{{ m.id }}</span>
                <Tag v-if="m.reasoning" size="small" theme="warning" variant="light">推理</Tag>
              </div>
              <div class="pi-model-meta">
                <span class="pi-model-stat">上下文: {{ formatNumber(m.contextWindow) }}</span>
                <span class="pi-model-stat">最大输出: {{ formatNumber(m.maxTokens) }}</span>
                <span v-if="m.cost" class="pi-model-stat">
                  费用: ¥{{ m.cost.input }}/1K in · ¥{{ m.cost.output }}/1K out
                </span>
              </div>
              <div class="pi-model-actions" @click.stop>
                <Tooltip content="设为默认模型" placement="top">
                  <Button size="small" variant="text" @click="setDefaultModel(prov.name, m.id)">
                    <template #icon><StarIcon /></template>
                  </Button>
                </Tooltip>
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
        <div class="pi-form-hint">模型列表请在 ~/.pi/agent/models.json 中编辑</div>
      </div>
    </Dialog>
  </div>
</template>
