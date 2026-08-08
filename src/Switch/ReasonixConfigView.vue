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

// Reasonix 支持的 provider 协议类型（docs: GUIDE.md "Custom OpenAI-compatible providers"）
const kindOptions = [
  { label: "openai", value: "openai" },
  { label: "anthropic", value: "anthropic" },
];
// 编辑弹窗初始加载的 key，用于保存时判断是否被用户修改
const originalApiKey = ref("");

// ==================== .env 环境变量管理 ====================

const envEntries = ref([]);
const envDialog = ref(false);
const envForm = ref({ name: "", value: "" });

const loadEnv = () => {
  try {
    const env = window.services.readReasonixEnv() || {};
    envEntries.value = Object.entries(env)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.error("读取 Reasonix .env 失败:", e);
    envEntries.value = [];
  }
};

// 引用该变量的供应商（删除/编辑时提示）
const envRefProviders = (name) =>
  providers.value.filter(p => p.apiKeyEnv === name).map(p => p.name);

const openAddEnvDialog = () => {
  envForm.value = { name: "", value: "" };
  envDialog.value = true;
};

const handleAddEnv = () => {
  try {
    const name = envForm.value.name.trim();
    const value = String(envForm.value.value || "").trim();
    if (!name) { MessagePlugin.warning("请输入变量名"); return; }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      MessagePlugin.warning("变量名只能包含字母、数字、下划线，且不能以数字开头");
      return;
    }
    if (envEntries.value.some(e => e.name === name)) { MessagePlugin.warning(`变量 ${name} 已存在`); return; }
    if (!value) { MessagePlugin.warning("请输入变量值"); return; }
    window.services.writeReasonixEnvKey(name, value);
    MessagePlugin.success(`${name} 已添加`);
    envDialog.value = false;
    loadEnv();
  } catch (e) {
    MessagePlugin.error("添加失败: " + e.message);
  }
};

const saveEnvEntry = (entry) => {
  try {
    if (!String(entry.value || "").trim()) { MessagePlugin.warning("值不能为空，如需删除请用删除按钮"); return; }
    window.services.writeReasonixEnvKey(entry.name, String(entry.value).trim());
    MessagePlugin.success(`${entry.name} 已保存`);
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

const handleDeleteEnv = (name) => {
  try {
    window.services.deleteReasonixEnvKey(name);
    MessagePlugin.success(`${name} 已删除`);
    loadEnv();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
  }
};

// ==================== 数据加载 ====================

const refresh = () => {
  loading.value = true;
  warningMsg.value = "";
  try {
    providers.value = window.services.getReasonixProviderList() || [];
    defaultModel.value = window.services.getReasonixDefaultModel() || "";
    loadEnv();
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
    // 留空时按 Reasonix 官方命名规则生成（CONFIG_PATHS.md "Custom provider api_key_env names"）
    if (!form.apiKeyEnv) form.apiKeyEnv = window.services.generateReasonixApiKeyEnv(name);
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
  originalApiKey.value = editForm.value.apiKey;
  editDialog.value = true;
};

const handleSaveProvider = () => {
  try {
    const { name, apiKey, ...rest } = editForm.value;
    // 已保存过 key 且用户清空了输入框 → 走删除确认流程
    if (originalApiKey.value && !apiKey && editForm.value.apiKeyEnv) {
      const newEnv = editForm.value.apiKeyEnv;
      const oldEnv = providers.value.find(p => p.name === editingProvider.value)?.apiKeyEnv || "";
      pendingDeleteKeyEnv.value = newEnv;
      // clearApiKey 会同时清理新名与旧名的 key，两个名的共享者都要列出
      sharedEnvProviders.value = [];
      const newRefs = providers.value
        .filter(p => p.apiKeyEnv === newEnv && p.name !== editingProvider.value)
        .map(p => p.name);
      if (newRefs.length) sharedEnvProviders.value.push({ env: newEnv, providers: newRefs });
      if (oldEnv && oldEnv !== newEnv) {
        const oldRefs = providers.value
          .filter(p => p.apiKeyEnv === oldEnv && p.name !== editingProvider.value)
          .map(p => p.name);
        if (oldRefs.length) sharedEnvProviders.value.push({ env: oldEnv, providers: oldRefs });
      }
      deleteKeyDialog.value = true;
      return;
    }
    // 填了新 key 但 env 名为空 → key 无处可存，提示而非静默丢弃
    if (apiKey && !editForm.value.apiKeyEnv) {
      MessagePlugin.warning("未设置 Key 环境变量名，API Key 未保存（请先填写变量名）");
      return;
    }
    // 清空了 key 且 env 名为空 → 无法定位要删的 key，提示旧 key 仍保留在 .env
    if (originalApiKey.value && !apiKey && !editForm.value.apiKeyEnv) {
      MessagePlugin.warning("已清空 Key 但未设置环境变量名，原 Key 仍保留在 .env，可在环境变量区块手动删除");
      return;
    }
    const payload = buildProviderPayload({ ...rest, name: editingProvider.value });
    // key 未修改则不回传，避免对 .env 做无意义写入（也避免把已保存的 key 再透传一遍）
    if (apiKey && apiKey !== originalApiKey.value) payload.apiKey = apiKey;
    window.services.updateReasonixProvider(editingProvider.value, payload);
    MessagePlugin.success("供应商配置已更新");
    editDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

// 删除已保存 key（清空 key 输入框保存时触发）
const deleteKeyDialog = ref(false);
const pendingDeleteKeyEnv = ref("");
// 共享同一 env 名（含新名/旧名）的其他供应商，删除确认时提示
// 结构：[{ env, providers: string[] }]
const sharedEnvProviders = ref([]);

// 取消删除时恢复 key 输入框，避免误触后无法找回
const cancelDeleteKey = () => {
  editForm.value.apiKey = originalApiKey.value;
};

const confirmDeleteKey = () => {
  try {
    const { name, ...rest } = editForm.value;
    // clearApiKey 由后端统一处理：清理旧/新 env 名下已保存的 key
    window.services.updateReasonixProvider(editingProvider.value, {
      ...buildProviderPayload({ ...rest, name: editingProvider.value }),
      clearApiKey: true,
    });
    MessagePlugin.success("供应商配置已更新（Key 已删除）");
    deleteKeyDialog.value = false;
    editDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
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

      <!-- 环境变量 / API Key -->
      <Card :bordered="true" class="reasonix-env-card">
        <template #header>
          <div class="reasonix-env-header">
            <Space size="12px" align="center">
              <span class="reasonix-block-title">环境变量 / API Key</span>
              <span class="reasonix-block-sub">~/.reasonix/.env · 共 {{ envEntries.length }} 个</span>
            </Space>
            <Button size="small" variant="outline" @click="openAddEnvDialog">
              <template #icon><AddIcon /></template> 添加变量
            </Button>
          </div>
        </template>

        <div v-if="envEntries.length === 0" class="reasonix-models-empty">
          .env 中暂无变量，可在供应商编辑弹窗中填写 API Key 自动写入
        </div>

        <div v-for="e in envEntries" :key="e.name" class="reasonix-env-item">
          <span class="reasonix-env-name mono">{{ e.name }}</span>
          <span v-if="envRefProviders(e.name).length" class="reasonix-env-refs">
            <Tag size="small" theme="warning" variant="light">被 {{ envRefProviders(e.name).length }} 个供应商引用</Tag>
          </span>
          <div class="reasonix-env-value">
            <ApiKeyInput v-model="e.value" placeholder="输入新值后保存" />
          </div>
          <div class="reasonix-env-actions">
            <Button size="small" theme="primary" variant="text" @click="saveEnvEntry(e)">
              保存
            </Button>
            <Popconfirm
              :content="envRefProviders(e.name).length
                ? `该变量被 ${envRefProviders(e.name).join('、')} 引用，删除后这些供应商将失效！`
                : '从 .env 删除该变量？'"
              theme="danger"
              @confirm="handleDeleteEnv(e.name)"
            >
              <Button size="small" theme="danger" variant="text">
                <template #icon><DeleteIcon /></template>
              </Button>
            </Popconfirm>
          </div>
        </div>
      </Card>
    </template>

    <!-- 添加供应商弹窗 -->
    <Dialog v-model:visible="addProviderDialog" header="添加供应商" width="520px" :confirm-btn="{ content: '添加', theme: 'primary' }" @confirm="handleAddProvider">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item"><label>名称 <span class="reasonix-form-required">*</span></label><Input v-model="addProviderForm.name" placeholder="deepseek" /></div>
        <div class="reasonix-form-item"><label>Kind</label><Select v-model="addProviderForm.kind" :options="kindOptions" creatable /></div>
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
        <div class="reasonix-form-item"><label>Kind</label><Select v-model="editForm.kind" :options="kindOptions" creatable /></div>
        <div class="reasonix-form-item"><label>Base URL</label><Input v-model="editForm.baseUrl" placeholder="https://api.deepseek.com" /></div>
        <div class="reasonix-form-item"><label>Chat URL（可选）</label><Input v-model="editForm.chatUrl" /></div>
        <div class="reasonix-form-item"><label>Models URL（可选）</label><Input v-model="editForm.modelsUrl" /></div>
        <div class="reasonix-form-item"><label>Key 环境变量</label><Input v-model="editForm.apiKeyEnv" /></div>
        <div class="reasonix-form-item"><label>API Key</label><ApiKeyInput v-model="editForm.apiKey" :placeholder="editForm.apiKeyEnv ? (originalApiKey ? '已保存，留空则删除；填写则覆盖' : '写入 ~/.reasonix/.env') : '写入 ~/.reasonix/.env'" /></div>
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

    <!-- 删除已保存 Key 确认弹窗 -->
    <Dialog v-model:visible="deleteKeyDialog" header="删除 API Key" width="480px" :confirm-btn="{ content: '删除', theme: 'danger' }" @confirm="confirmDeleteKey" @cancel="cancelDeleteKey" @close="cancelDeleteKey">
      <div class="reasonix-edit-form">
        <p>将从 ~/.reasonix/.env 删除该供应商已保存的 API Key（{{ pendingDeleteKeyEnv }}），该操作不可撤销。</p>
        <p v-for="s in sharedEnvProviders" :key="s.env" class="reasonix-form-hint">
          注意：变量 <span class="mono">{{ s.env }}</span> 也被供应商 {{ s.providers.join("、") }} 引用，删除后这些供应商将失效。
        </p>
      </div>
    </Dialog>

    <!-- 添加环境变量弹窗 -->
    <Dialog v-model:visible="envDialog" header="添加环境变量" width="440px" :confirm-btn="{ content: '添加', theme: 'primary' }" @confirm="handleAddEnv">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item">
          <label>变量名 <span class="reasonix-form-required">*</span></label>
          <Input v-model="envForm.name" placeholder="DEEPSEEK_API_KEY" />
        </div>
        <div class="reasonix-form-item">
          <label>变量值 <span class="reasonix-form-required">*</span></label>
          <ApiKeyInput v-model="envForm.value" placeholder="API Key 或任意值" />
        </div>
        <div class="reasonix-form-hint">写入 ~/.reasonix/.env，供 Reasonix CLI 与各供应商 api_key_env 引用</div>
      </div>
    </Dialog>
  </div>
</template>
