<script setup>
import { ref, computed, onMounted } from "vue";
import {
  Empty, Button, Tag, Dialog, Input, MessagePlugin,
  Select, Popconfirm, Alert as TAlert, Tooltip, Link, Checkbox,
  Collapse, CollapsePanel, AutoComplete,
} from "tdesign-vue-next";
import {
  RefreshIcon, EditIcon, AddIcon, DeleteIcon, StarIcon,
  CopyIcon, LockOnIcon, SaveIcon,
} from "tdesign-icons-vue-next";
import ApiKeyInput from "../../components/ApiKeyInput.vue";
import "./styles/ConfigView.css";

// Codex 模型配置（Desktop / CLI 共用 ~/.codex/config.toml）。
// 接入方式参照 DeepSeek 官方文档：[model_providers.<id>] 子表（base_url / wire_api /
// experimental_bearer_token）+ 顶层 model / model_provider / model_reasoning_effort 等字段。
// 仅管理模型相关字段，config.toml 其余配置由服务层读改写原样保留。

const loading = ref(false);
const warningMsg = ref("");
const providers = ref([]);
// 每供应商模型列表（config.toml 无此概念，存 uTools DB，供快捷切换与 models.json 目录生成）
const modelsMap = ref({});
const current = ref({ provider: "", model: "", reasoningEffort: "", apiAuth: false, catalogPath: "" });
const expandedList = ref([]);

// ==================== 当前模型配置（顶层字段） ====================

// 供应商/模型改动先落在 draft，「应用」一次性写入 model_provider + model
const draft = ref({ provider: "", model: "" });
const applyingCurrent = ref(false);
// 思考强度：'' = 删除字段走 Codex 默认
const effortValue = ref("");
const apiAuthValue = ref(false);

const effortOptions = [
  { label: "默认", value: "" },
  { label: "low", value: "low" },
  { label: "medium", value: "medium" },
  { label: "high", value: "high" },
];

const wireApiOptions = [
  { label: "responses（Codex 原生）", value: "responses" },
  { label: "chat（OpenAI 兼容）", value: "chat" },
];

const providerIdOptions = computed(() => {
  const ids = providers.value.map((p) => p.id);
  // 当前供应商可能是未在本地配置自定义供应商时的内置 ID（如 openai），保留展示
  if (current.value.provider && !ids.includes(current.value.provider)) {
    ids.unshift(current.value.provider);
  }
  return ids.map((id) => ({ label: id, value: id }));
});

const draftModelOptions = computed(() =>
  (modelsMap.value[draft.value.provider] || []).map((m) => ({ label: m, value: m }))
);

const isCurrentProvider = (p) => current.value.provider === p.id;
const isCurrentModel = (providerId, m) =>
  current.value.provider === providerId && current.value.model === m;

const applyCurrent = async () => {
  const providerId = String(draft.value.provider || "").trim();
  const modelId = String(draft.value.model || "").trim();
  if (!modelId) return MessagePlugin.warning("请输入模型 ID");
  applyingCurrent.value = true;
  try {
    window.services.setCodexDefaultModel(providerId, modelId);
    MessagePlugin.success(`已切换到 ${providerId ? providerId + " / " : ""}${modelId}`);
    refresh();
  } catch (e) {
    MessagePlugin.error("切换失败: " + e.message);
  } finally {
    applyingCurrent.value = false;
  }
};

const handleEffortChange = (val) => {
  try {
    window.services.setCodexReasoningEffort(val || "");
    MessagePlugin.success(val ? `思考强度已设为 ${val}` : "思考强度已恢复默认");
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

// 跳过 ChatGPT 登录 = preferred_auth_method=apikey + forced_login_method=api 成对写删
const handleApiAuthChange = (val) => {
  try {
    window.services.setCodexApiAuth(!!val);
    MessagePlugin.success(val ? "已启用 API Key 认证（跳过 ChatGPT 登录）" : "已关闭 API Key 认证");
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

// ==================== 数据加载 ====================

const refresh = () => {
  loading.value = true;
  warningMsg.value = "";
  try {
    const list = window.services.getCodexProviderList() || [];
    modelsMap.value = window.services.getCodexProviderModelsMap() || {};
    current.value = window.services.getCodexCurrent() || {};
    effortValue.value = current.value.reasoningEffort || "";
    apiAuthValue.value = !!current.value.apiAuth;
    draft.value = { provider: current.value.provider || "", model: current.value.model || "" };
    // 当前供应商排最前
    providers.value = list.sort(
      (a, b) => Number(isCurrentProvider(b)) - Number(isCurrentProvider(a))
    );
  } catch (e) {
    console.error("加载 Codex 配置失败:", e);
    warningMsg.value = e.message || "加载失败";
  } finally {
    loading.value = false;
  }
};

// ==================== 供应商 CRUD ====================

const addProviderDialog = ref(false);
const addProviderForm = ref({ id: "", name: "", baseUrl: "", wireApi: "responses", apiKey: "" });
const editDialog = ref(false);
const editingProvider = ref("");
const editForm = ref({ id: "", name: "", baseUrl: "", wireApi: "responses", apiKey: "" });
const editClearKey = ref(false);
// 编辑弹窗初始加载的 key，用于占位提示
const originalApiKey = ref("");

const emptyProviderForm = () => ({ id: "", name: "", baseUrl: "", wireApi: "responses", apiKey: "" });

const openAddProviderDialog = () => {
  addProviderForm.value = emptyProviderForm();
  addProviderDialog.value = true;
};

const handleAddProvider = () => {
  try {
    const id = addProviderForm.value.id.trim();
    if (!id) return MessagePlugin.warning("请输入供应商 ID");
    const form = { ...addProviderForm.value, id, name: addProviderForm.value.name.trim() };
    if (!form.name) form.name = id;
    window.services.addCodexProvider(form);
    MessagePlugin.success(`供应商 ${id} 已添加`);
    addProviderDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("添加失败: " + e.message);
  }
};

const handleEdit = (p) => {
  editingProvider.value = p.id;
  editForm.value = {
    id: p.id,
    name: p.name || p.id,
    baseUrl: p.baseUrl || "",
    wireApi: p.wireApi || "responses",
    apiKey: p.apiKey || "",
  };
  originalApiKey.value = p.apiKey || "";
  editClearKey.value = false;
  editDialog.value = true;
};

const handleSaveProvider = () => {
  try {
    const newId = String(editForm.value.id || "").trim();
    if (!newId) return MessagePlugin.warning("请输入供应商 ID");
    if (originalApiKey.value && editClearKey.value && editForm.value.apiKey) {
      return MessagePlugin.warning("已勾选删除 Key，请清空 Key 输入框，或取消勾选");
    }
    const payload = {
      id: newId,
      name: editForm.value.name.trim() || newId,
      baseUrl: editForm.value.baseUrl.trim(),
      wireApi: editForm.value.wireApi,
    };
    // key 未修改则不回传，避免无意义写回
    if (editForm.value.apiKey && editForm.value.apiKey !== originalApiKey.value) {
      payload.apiKey = editForm.value.apiKey;
    }
    if (originalApiKey.value && editClearKey.value) payload.clearApiKey = true;
    const renamed = newId !== editingProvider.value;
    window.services.updateCodexProvider(editingProvider.value, payload);
    MessagePlugin.success(renamed ? `供应商配置已更新（重命名为 ${newId}）` : "供应商配置已更新");
    editDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

const handleDeleteProvider = (id) => {
  try {
    window.services.deleteCodexProvider(id);
    MessagePlugin.success(`供应商 ${id} 已删除`);
    refresh();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
  }
};

// ==================== 模型 CRUD（DB 列表） ====================

const addModelDialog = ref(false);
const addModelProvider = ref("");
const addModelId = ref("");
const fetchedModels = ref([]);
const fetchingModels = ref(false);
const fetchModelError = ref("");

const openAddModelDialog = (providerId) => {
  addModelProvider.value = providerId;
  addModelId.value = "";
  fetchedModels.value = [];
  fetchModelError.value = "";
  addModelDialog.value = true;
  // 弹窗打开即尝试拉取该供应商可用模型（同 Pi 配置页）
  handleFetchModels();
};

const addModelOptions = computed(() =>
  fetchedModels.value.map((m) => ({ label: m.name || m.id, value: m.id }))
);

const handleFetchModels = async () => {
  const p = providers.value.find((x) => x.id === addModelProvider.value);
  if (!p || !p.baseUrl) {
    fetchModelError.value = "该供应商未配置 Base URL，无法自动获取";
    return;
  }
  fetchingModels.value = true;
  fetchModelError.value = "";
  try {
    const list = await window.services.fetchProviderModels(p.baseUrl, p.apiKey);
    fetchedModels.value = list || [];
    if (!fetchedModels.value.length) fetchModelError.value = "未获取到模型";
  } catch (e) {
    fetchModelError.value = e.message || "获取失败";
  } finally {
    fetchingModels.value = false;
  }
};

const handleAddModel = () => {
  try {
    const id = addModelId.value.trim();
    if (!id) return MessagePlugin.warning("请输入模型 ID");
    window.services.addCodexModel(addModelProvider.value, id);
    MessagePlugin.success(`模型 ${id} 已添加`);
    addModelDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("添加失败: " + e.message);
  }
};

const handleDeleteModel = (providerId, modelId) => {
  try {
    window.services.deleteCodexModel(providerId, modelId);
    MessagePlugin.success(`模型 ${modelId} 已删除`);
    refresh();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
  }
};

// 点星标 → 设为当前模型（写 model_provider + model，并按接入方式补 API 认证字段）
const setCurrentModel = (providerId, modelId) => {
  try {
    window.services.setCodexDefaultModel(providerId, modelId);
    MessagePlugin.success(`已切换到 ${providerId} / ${modelId}`);
    refresh();
  } catch (e) {
    MessagePlugin.error("切换失败: " + e.message);
  }
};

// ==================== models.json 模型目录 ====================

const syncCatalog = () => {
  try {
    const { total, added } = window.services.syncCodexModelCatalog();
    MessagePlugin.success(`已生成 ~/.codex/models.json（新增 ${added}，共 ${total} 条）并设置 model_catalog_json`);
    refresh();
  } catch (e) {
    MessagePlugin.error("同步失败: " + e.message);
  }
};

// ==================== 辅助 ====================

// 掩码显示：只保留前 4 + 后 4，中间用 ··· 替代
const maskValue = (val) => {
  if (!val) return "";
  if (val.length <= 10) return "••••••";
  return val.slice(0, 4) + "····" + val.slice(-4);
};

const keyDisplay = (p) => {
  if (p.apiKey) return maskValue(p.apiKey);
  if (p.envKey) return `环境变量 ${p.envKey}`;
  return "—";
};

const copyText = (val) => {
  try {
    window.utools.copyText(val);
    MessagePlugin.success("已复制到剪贴板");
  } catch {
    MessagePlugin.error("复制失败");
  }
};

const openCodexDir = () => {
  try { window.services.openCodexDir(); } catch { /* ignore */ }
};

onMounted(refresh);
</script>

<template>
  <div class="codex-config-container">
    <!-- 顶部工具栏：路径提示 + 操作 -->
    <div class="codex-toolbar">
      <div class="codex-toolbar-left">
        <span class="codex-toolbar-tip">
          <Link theme="primary" :underline="true" @click="openCodexDir">~/.codex/</Link>
          <span class="codex-toolbar-sub">config.toml + models.json（Desktop / CLI 共用）</span>
        </span>
      </div>
      <div class="codex-toolbar-right">
        <Button size="small" variant="outline" theme="primary" @click="openAddProviderDialog">
          <template #icon><AddIcon /></template> 添加供应商
        </Button>
        <Tooltip
          content="生成 ~/.codex/models.json 模型目录（Codex 桌面端模型列表由该文件驱动），并设置 model_catalog_json"
          placement="top"
        >
          <Button size="small" variant="outline" @click="syncCatalog">
            <template #icon><SaveIcon /></template> 同步模型目录
          </Button>
        </Tooltip>
        <Tooltip content="刷新" placement="top">
          <Button size="small" variant="outline" :loading="loading" @click="refresh">
            <template #icon><RefreshIcon /></template>
          </Button>
        </Tooltip>
      </div>
    </div>

    <div v-if="warningMsg" class="codex-config-warning">
      <t-alert :message="warningMsg" theme="warning" show-icon />
    </div>

    <template v-if="!loading">
      <!-- 当前模型配置（config.toml 顶层字段） -->
      <div class="codex-current-card">
        <div class="codex-current-header">
          <span class="codex-block-title">当前模型配置</span>
          <span class="codex-block-sub">仅管理模型相关字段，config.toml 其余配置原样保留</span>
        </div>
        <div class="codex-current-controls">
          <div class="codex-current-item">
            <label>供应商</label>
            <Select
              v-model="draft.provider"
              :options="providerIdOptions"
              size="small"
              filterable
              placeholder="内置 / 自定义"
              style="width: 150px"
            />
          </div>
          <div class="codex-current-item codex-current-item--grow">
            <label>模型</label>
            <AutoComplete
              v-model="draft.model"
              :options="draftModelOptions"
              size="small"
              filterable
              clearable
              placeholder="deepseek-v4-flash"
            />
          </div>
          <Button size="small" theme="primary" variant="base" :loading="applyingCurrent" @click="applyCurrent">
            应用
          </Button>
          <div class="codex-current-item">
            <label>思考强度</label>
            <Select
              v-model="effortValue"
              :options="effortOptions"
              size="small"
              style="width: 110px"
              @change="handleEffortChange"
            />
          </div>
          <Tooltip content="preferred_auth_method=apikey + forced_login_method=api，写入后 Codex 跳过 ChatGPT 登录" placement="top">
            <Checkbox v-model="apiAuthValue" class="codex-current-auth" @change="handleApiAuthChange">
              跳过 ChatGPT 登录
            </Checkbox>
          </Tooltip>
        </div>
      </div>

      <!-- 供应商列表 -->
      <div v-if="providers.length === 0" class="codex-config-empty">
        <Empty description="未检测到 Codex 自定义供应商，添加一个即可按 DeepSeek 官方接入方式使用第三方模型" />
      </div>

      <div v-else class="codex-provider-list">
        <Collapse v-model="expandedList" class="codex-provider-collapse">
          <CollapsePanel v-for="p in providers" :key="p.id" :value="p.id">
            <!-- 供应商头部：名称 + 协议 + 当前标记 + 操作 -->
            <template #header>
              <div class="codex-provider-header-left">
                <span class="codex-provider-name">{{ p.id }}</span>
                <Tag size="small" variant="outline">{{ p.wireApi }}</Tag>
                <Tag v-if="isCurrentProvider(p)" size="small" theme="warning" variant="light">当前</Tag>
                <span v-if="p.name && p.name !== p.id" class="codex-provider-display-name">{{ p.name }}</span>
                <span class="codex-model-count">{{ (modelsMap[p.id] || []).length }} 个模型</span>
              </div>
            </template>
            <template #headerRightContent>
              <div class="codex-provider-header-right" @click.stop>
                <Button size="small" theme="default" variant="text" @click="handleEdit(p)">
                  <template #icon><EditIcon /></template> 编辑
                </Button>
                <Tooltip content="删除供应商">
                  <Popconfirm
                    :content="`删除供应商 ${p.id} 及其模型列表？config.toml 中的 API Key 将一并移除`"
                    theme="danger"
                    @confirm="handleDeleteProvider(p.id)"
                  >
                    <Button size="small" theme="danger" variant="text">
                      <template #icon><DeleteIcon /></template>
                    </Button>
                  </Popconfirm>
                </Tooltip>
              </div>
            </template>

            <!-- 展开内容：详情 + 模型 -->
            <template #content>
              <div class="codex-provider-body">
                <div class="codex-provider-details">
                  <div class="codex-detail-item">
                    <span class="codex-detail-label">Base URL</span>
                    <span class="codex-detail-value mono">{{ p.baseUrl || "—" }}</span>
                  </div>
                  <div class="codex-detail-item">
                    <span class="codex-detail-label">API Key</span>
                    <span class="codex-detail-value mono">
                      <LockOnIcon v-if="p.apiKey" size="12px" class="codex-key-lock" />
                      {{ keyDisplay(p) }}
                      <Tooltip v-if="p.apiKey" content="复制">
                        <span class="codex-key-copy" @click="copyText(p.apiKey)"><CopyIcon size="12px" /></span>
                      </Tooltip>
                    </span>
                  </div>
                  <div class="codex-detail-item">
                    <span class="codex-detail-label">接口协议</span>
                    <span class="codex-detail-value">wire_api = {{ p.wireApi }}</span>
                  </div>
                  <div class="codex-detail-item">
                    <span class="codex-detail-label">存储</span>
                    <span class="codex-detail-value">config.toml [model_providers.{{ p.id }}]</span>
                  </div>
                </div>

                <!-- 模型子区 -->
                <div class="codex-models-section">
                  <div class="codex-models-title">
                    <span>模型</span>
                    <Button size="small" variant="outline" @click="openAddModelDialog(p.id)">
                      <template #icon><AddIcon /></template> 添加
                    </Button>
                  </div>
                  <div v-if="(modelsMap[p.id] || []).length === 0" class="codex-models-empty">
                    暂无模型，添加后可点星标一键切换
                  </div>
                  <div v-else class="codex-model-tags">
                    <span v-for="m in modelsMap[p.id]" :key="m" class="codex-model-tag">
                      <span class="codex-model-tag-name">{{ m }}</span>
                      <Tag v-if="isCurrentModel(p.id, m)" size="small" theme="success" variant="light">当前</Tag>
                      <Tooltip v-else content="切换到此模型" placement="top">
                        <span class="codex-model-tag-star" @click="setCurrentModel(p.id, m)"><StarIcon size="12px" /></span>
                      </Tooltip>
                      <Popconfirm content="删除模型？" theme="danger" @confirm="handleDeleteModel(p.id, m)">
                        <span class="codex-model-tag-del"><DeleteIcon size="12px" /></span>
                      </Popconfirm>
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </CollapsePanel>
        </Collapse>
      </div>
    </template>

    <!-- 添加供应商弹窗 -->
    <Dialog
      v-model:visible="addProviderDialog"
      header="添加供应商"
      width="520px"
      :confirm-btn="{ content: '添加', theme: 'primary' }"
      @confirm="handleAddProvider"
    >
      <div class="codex-edit-form">
        <div class="codex-form-item">
          <label>ID <span class="codex-form-required">*</span></label>
          <Input v-model="addProviderForm.id" placeholder="deepseek" />
          <div class="codex-form-hint">对应 config.toml 的 [model_providers.&lt;ID&gt;]，字母/数字/下划线/中划线</div>
        </div>
        <div class="codex-form-item"><label>名称（可选）</label><Input v-model="addProviderForm.name" placeholder="留空则同 ID" /></div>
        <div class="codex-form-item"><label>Base URL</label><Input v-model="addProviderForm.baseUrl" placeholder="https://api.deepseek.com/" /></div>
        <div class="codex-form-item">
          <label>接口协议（wire_api）</label>
          <Select v-model="addProviderForm.wireApi" :options="wireApiOptions" />
        </div>
        <div class="codex-form-item">
          <label>API Key</label>
          <ApiKeyInput v-model="addProviderForm.apiKey" placeholder="写入 experimental_bearer_token" />
          <div class="codex-form-hint">按 DeepSeek 官方接入方式明文写入 config.toml，请确保 ~/.codex/ 目录权限安全</div>
        </div>
      </div>
    </Dialog>

    <!-- 编辑供应商弹窗 -->
    <Dialog
      v-model:visible="editDialog"
      header="编辑供应商配置"
      width="520px"
      :confirm-btn="{ content: '保存', theme: 'primary' }"
      @confirm="handleSaveProvider"
    >
      <div class="codex-edit-form">
        <div class="codex-form-item">
          <label>ID <span class="codex-form-required">*</span></label>
          <Input v-model="editForm.id" placeholder="deepseek" />
          <div class="codex-form-hint">修改后自动同步 model_provider 引用与模型列表</div>
        </div>
        <div class="codex-form-item"><label>名称（可选）</label><Input v-model="editForm.name" placeholder="留空则同 ID" /></div>
        <div class="codex-form-item"><label>Base URL</label><Input v-model="editForm.baseUrl" placeholder="https://api.deepseek.com/" /></div>
        <div class="codex-form-item">
          <label>接口协议（wire_api）</label>
          <Select v-model="editForm.wireApi" :options="wireApiOptions" />
        </div>
        <div class="codex-form-item">
          <label>API Key</label>
          <ApiKeyInput
            v-model="editForm.apiKey"
            :placeholder="originalApiKey ? '已保存，留空则保留原 Key' : '写入 experimental_bearer_token'"
          />
          <Checkbox v-if="originalApiKey" v-model="editClearKey" class="codex-clear-key-checkbox">
            删除已保存的 Key
          </Checkbox>
        </div>
      </div>
    </Dialog>

    <!-- 添加模型弹窗 -->
    <Dialog
      v-model:visible="addModelDialog"
      header="添加模型"
      width="460px"
      :confirm-btn="{ content: '添加', theme: 'primary' }"
      @confirm="handleAddModel"
    >
      <div class="codex-edit-form">
        <div class="codex-form-item">
          <label>模型 ID <span class="codex-form-required">*</span></label>
          <AutoComplete
            v-model="addModelId"
            :options="addModelOptions"
            :loading="fetchingModels"
            filterable
            clearable
            placeholder="deepseek-v4-flash"
          />
          <div v-if="fetchingModels" class="codex-form-hint">正在从该供应商拉取模型列表…</div>
          <div v-else-if="fetchModelError" class="codex-form-hint codex-fetch-error">
            自动获取失败：{{ fetchModelError }}
            <span class="codex-fetch-retry" @click="handleFetchModels">重试</span>
          </div>
          <div v-else class="codex-form-hint">从该供应商 Base URL 的 /models 接口获取，也可手动输入</div>
        </div>
        <div class="codex-form-hint">供应商：{{ addModelProvider }}</div>
      </div>
    </Dialog>
  </div>
</template>
