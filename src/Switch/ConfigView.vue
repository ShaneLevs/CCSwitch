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
  RadioGroup,
  RadioButton,
} from "tdesign-vue-next";
import {
  AddIcon,
  RefreshIcon,
  DownloadIcon,
  UploadIcon,
  PlayIcon,
  EditIcon,
  DeleteIcon,
  SettingIcon,
} from "tdesign-icons-vue-next";
import { useConfigColumns } from "../composables/useConfigColumns";
import { useConfigImportExport } from "../composables/useConfigImportExport";
import { useConfigSwitch } from "../composables/useConfigSwitch";
import { useExtraFields } from "../composables/useExtraFields";
import "./styles/ConfigView.css";

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
const dialogTab = ref("basic");
const showPreviewDialog = ref(false);
const previewConfig = ref(null);
const formData = ref({
  name: "",
  key: "",
  baseUrl: "",
  model: "",
  defaultHaikuModel: "",
  defaultSonnetModel: "",
  defaultOpusModel: "",
  subagentModel: "",
  extraFields: [],
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
          extraFields: d.extraFields || [],
          updatedAt: d.updatedAt,
        };
        window.utools.db.put(cleanDoc);
      }
      const createdAt = parseInt(d._id.replace(DB_PREFIX, "")) || d.updatedAt || 0;
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
        extraFields: d.extraFields || [],
        updatedAt: d.updatedAt,
        createdAt,
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);
};

const {
  leftColumn, rightColumn, dragState, groupOrder,
  loadGroupOrder, rebalanceColumns, onDragMouseDown,
} = useConfigColumns(savedConfigs);

const {
  showImportStringDialog, importString,
  handleExportAsString, openImportStringDialog, handleImportFromString,
} = useConfigImportExport(savedConfigs, loadSavedConfigs);

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
  dialogTab.value = "basic";
  loadGlobalExtraFields();
  formData.value = {
    name: "",
    key: "",
    baseUrl: "",
    model: "",
    defaultHaikuModel: "",
    defaultSonnetModel: "",
    defaultOpusModel: "",
    subagentModel: "",
    extraFields: [],
  };
  showDialog.value = true;
};

const openEditDialog = (config) => {
  editingConfig.value = config;
  dialogTab.value = "basic";
  loadGlobalExtraFields();
  formData.value = {
    name: config.name,
    key: config.key,
    baseUrl: config.baseUrl,
    model: config.model,
    defaultHaikuModel: config.defaultHaikuModel || "",
    defaultSonnetModel: config.defaultSonnetModel || "",
    defaultOpusModel: config.defaultOpusModel || "",
    subagentModel: config.subagentModel || "",
    extraFields: (config.extraFields || []).map(f => ({ ...f })),
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

const addDialogExtraField = () => formData.value.extraFields.push({ key: "", value: "" });
const removeDialogExtraField = (idx) => formData.value.extraFields.splice(idx, 1);

const saveConfig = () => {
  if (!formData.value.name.trim()) return MessagePlugin.warning("请输入配置名称");
  if (!formData.value.key.trim()) return MessagePlugin.warning("请输入 Key");
  if (!formData.value.baseUrl.trim()) return MessagePlugin.warning("请输入 URL");

  const now = Date.now();
  const id = editingConfig.value ? editingConfig.value.id : DB_PREFIX + now;
  const cleanExtraFields = (formData.value.extraFields || [])
    .filter(f => f.key?.trim())
    .map(f => ({ key: f.key.trim(), value: f.value?.trim() || "" }));
  // 检查重复 key
  const extraKeys = cleanExtraFields.map(f => f.key);
  const duplicateKey = extraKeys.find((k, i) => extraKeys.indexOf(k) !== i);
  if (duplicateKey) return MessagePlugin.warning(`env字段 key 重复: ${duplicateKey}`);
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
    extraFields: cleanExtraFields,
    updatedAt: now,
  };
  if (editingConfig.value) doc._rev = window.utools.db.get(id)._rev;

  if (window.utools.db.put(doc).ok) {
    // 保存使用过的字段名到候选列表
    saveExtraFieldKeys(cleanExtraFields.map(f => f.key));
    MessagePlugin.success(editingConfig.value ? "配置已更新" : "配置已保存");
    showDialog.value = false;
    loadSavedConfigs();
    // 如果编辑的是当前启用的配置，自动重新启用
    if (editingConfig.value && isCurrentConfig(editingConfig.value)) {
      switchConfig({
        ...doc,
        key: formData.value.key.trim(),
        extraFields: cleanExtraFields,
      });
    }
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

const { switchConfig, isCurrentConfig } = useConfigSwitch(currentConfig, loadCurrentConfig);

const {
  showExtraFieldsDialog, extraFields, activeConfigExtras, extraFieldKeyOptions,
  loadExtraFieldKeys, loadGlobalExtraFields, openExtraFieldsDialog, addExtraField, removeExtraField, saveExtraFields, saveExtraFieldKeys,
} = useExtraFields(loadCurrentConfig, savedConfigs, isCurrentConfig);

const reloadFromSettings = () => {
  const settings = window.services.readClaudeSettings() || {};
  const env = settings.env || {};
  const managedKeys = [
    'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL',
  ];
  extraFields.value = [];
  Object.keys(env).forEach(key => {
    if (!managedKeys.includes(key)) {
      extraFields.value.push({ key, value: String(env[key]) });
    }
  });
  MessagePlugin.success('已从 settings.json 读取');
};

const openSettingsFile = () => {
  const filePath = window.services.getClaudeSettingsPath();
  window.utools.shellOpenPath(filePath);
};

const copyModelName = (name) => {
  window.utools.copyText(name);
  MessagePlugin.success('已复制: ' + name);
};

onMounted(() => { loadCurrentConfig(); loadSavedConfigs(); loadExtraFieldKeys(); loadGroupOrder(); });
</script>

<template>
  <div class="config-view">
    <div class="section-header">
      <span class="section-tip">直接编辑 <span class="hint-link" @click="openSettingsFile">settings.json</span></span>
      <Space size="small">
        <Tooltip content="平衡列"><Button size="small" variant="text" @click="rebalanceColumns"><template #icon><RefreshIcon /></template></Button></Tooltip>
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
          <Tag v-if="currentConfig.model" size="medium" variant="outline" class="model-tag" @click="copyModelName(currentConfig.model)">MODEL: {{ currentConfig.model }}</Tag>
          <Tag v-if="currentConfig.defaultHaikuModel" size="medium" variant="outline" class="model-tag" @click="copyModelName(currentConfig.defaultHaikuModel)">HAIKU: {{ currentConfig.defaultHaikuModel }}</Tag>
          <Tag v-if="currentConfig.defaultSonnetModel" size="medium" variant="outline" class="model-tag" @click="copyModelName(currentConfig.defaultSonnetModel)">SONNET: {{ currentConfig.defaultSonnetModel }}</Tag>
          <Tag v-if="currentConfig.defaultOpusModel" size="medium" variant="outline" class="model-tag" @click="copyModelName(currentConfig.defaultOpusModel)">OPUS: {{ currentConfig.defaultOpusModel }}</Tag>
          <Tag v-if="currentConfig.subagentModel" size="medium" variant="outline" class="model-tag" @click="copyModelName(currentConfig.subagentModel)">SUBAGENT: {{ currentConfig.subagentModel }}</Tag>
        </div>
      </div>
    </div>

    <div v-if="!savedConfigs.length" class="empty-state"><Empty description="暂无保存的配置方案" /></div>

    <div v-else class="config-groups">
      <div class="masonry-col">
        <template v-for="(group, idx) in leftColumn" :key="group.isPlaceholder ? 'placeholder' : 'l-' + idx + '-' + group.key">
          <div v-if="group.isPlaceholder" class="config-group drag-gap-parent">
            <div class="drag-gap" :style="{ height: dragState.dragHeight + 'px' }"></div>
          </div>
          <div v-else class="config-group">
            <div class="group-conn" @mousedown="onDragMouseDown('left', idx, $event)">
              <span class="group-key">{{ maskKey(group.key) }}</span>
              <span class="group-url">{{ group.baseUrl }}</span>
            </div>
            <div v-for="config in group.configs" :key="config.id + '-' + (isCurrentConfig(config) ? 'cur' : 'other')" class="config-row" @click="openPreviewDialog(config)">
              <span class="config-name">{{ config.name }}</span>
              <Space size="small" @click.stop>
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
        </template>
      </div>
      <div class="masonry-col">
        <template v-for="(group, idx) in rightColumn" :key="group.isPlaceholder ? 'placeholder' : 'r-' + idx + '-' + group.key">
          <div v-if="group.isPlaceholder" class="config-group drag-gap-parent">
            <div class="drag-gap" :style="{ height: dragState.dragHeight + 'px' }"></div>
          </div>
          <div v-else class="config-group">
            <div class="group-conn" @mousedown="onDragMouseDown('right', idx, $event)">
              <span class="group-key">{{ maskKey(group.key) }}</span>
              <span class="group-url">{{ group.baseUrl }}</span>
            </div>
            <div v-for="config in group.configs" :key="config.id + '-' + (isCurrentConfig(config) ? 'cur' : 'other')" class="config-row" @click="openPreviewDialog(config)">
              <span class="config-name">{{ config.name }}</span>
              <Space size="small" @click.stop>
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
        </template>
      </div>
    </div>

    <Dialog v-model:visible="showDialog" :header="dialogTitle" @confirm="saveConfig" width="560px">
      <div class="dialog-switch">
        <RadioGroup v-model="dialogTab" variant="default-filled" size="small">
          <RadioButton value="basic">基础配置</RadioButton>
          <RadioButton value="extra">env其他字段</RadioButton>
        </RadioGroup>
      </div>
      <div v-if="dialogTab === 'basic'" class="form">
        <div class="form-item"><label>名称 <span class="required">*</span></label><Input v-model="formData.name" placeholder="方便分辨的名字" /></div>
        <div class="form-item"><label>URL <span class="required">*</span></label><Input v-model="formData.baseUrl" placeholder="ANTHROPIC_BASE_URL" /></div>
        <div class="form-item"><label>TOKEN <span class="required">*</span></label><Input v-model="formData.key" type="password" placeholder="ANTHROPIC_AUTH_TOKEN" /></div>
        <div class="form-hint">设置默认对话模型，留空则跟随系统默认</div>
        <div class="form-item"><label>MODEL</label><Input v-model="formData.model" placeholder="ANTHROPIC_MODEL" /></div>
        <div class="form-hint">分别指定各层级模型版本，留空则使用系统默认分配</div>
        <div class="form-item"><label>HAIKU</label><Input v-model="formData.defaultHaikuModel" placeholder="ANTHROPIC_DEFAULT_HAIKU_MODEL" /></div>
        <div class="form-item"><label>SONNET</label><Input v-model="formData.defaultSonnetModel" placeholder="ANTHROPIC_DEFAULT_SONNET_MODEL" /></div>
        <div class="form-item"><label>OPUS</label><Input v-model="formData.defaultOpusModel" placeholder="ANTHROPIC_DEFAULT_OPUS_MODEL" /></div>
        <div class="form-hint">设置子代理（工具调用、后台任务等）使用的模型</div>
        <div class="form-item"><label>SUBAGENT</label><Input v-model="formData.subagentModel" placeholder="CLAUDE_CODE_SUBAGENT_MODEL" /></div>
      </div>
      <div v-else class="extra-fields-dialog">
        <!-- 全局 env 其他字段参考（只读） -->
        <div v-if="extraFields.length" class="active-config-extras">
          <div class="active-config-extras-title">全局 env 其他字段</div>
          <div class="extra-fields-list">
            <div v-for="(field, idx) in extraFields" :key="idx" class="extra-field-wrap extra-field-readonly">
              <div class="extra-field-row">
                <div class="field-key-readonly">{{ field.key }}</div>
                <div class="field-value-readonly">{{ field.value }}</div>
              </div>
              <div v-if="formData.extraFields.some(f => f.key?.trim() === field.key?.trim())" class="field-tag-row">
                <Tag size="small" theme="warning" variant="light">将被覆盖</Tag>
              </div>
            </div>
          </div>
        </div>
        <div class="extra-fields-hint">
          <p>切换配置时，这些字段会与全局env其他字段做合并（配置优先）。</p>
        </div>
        <div class="extra-fields-list">
          <div v-for="(field, idx) in formData.extraFields" :key="idx" class="extra-field-wrap">
            <div class="extra-field-row">
              <AutoComplete v-model="field.key" class="field-key" :options="extraFieldKeyOptions" filterable placeholder="字段名" />
              <Input v-model="field.value" class="field-value" placeholder="字段值" />
              <Button size="small" theme="danger" variant="text" @click="removeDialogExtraField(idx)"><DeleteIcon /></Button>
            </div>
            <div v-if="extraFields.some(f => f.key?.trim() === field.key?.trim())" class="field-tag-row">
              <Tag size="small" theme="warning" variant="light">覆盖全局</Tag>
            </div>
          </div>
        </div>
        <Button size="small" variant="outline" @click="addDialogExtraField" class="add-field-btn"><template #icon><AddIcon /></template> 添加字段</Button>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <Button v-if="!editingConfig" variant="outline" @click="fillCurrentConfig"><template #icon><RefreshIcon /></template> 读取当前配置</Button>
          <span v-else></span>
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
        <template v-if="previewConfig.extraFields && previewConfig.extraFields.length">
          <div class="preview-divider"></div>
          <div class="preview-subtitle">env 其他字段</div>
          <div v-for="(field, idx) in previewConfig.extraFields" :key="idx" class="preview-item">
            <span class="preview-label">{{ field.key }}</span>
            <span class="preview-value">{{ field.value }}</span>
          </div>
        </template>
      </div>
    </Dialog>

    <Dialog v-model:visible="showExtraFieldsDialog" header="env其他字段设置" width="600px" @confirm="saveExtraFields">
      <div class="extra-fields-dialog">
        <!-- 当前活跃配置的 env 其他字段（只读） -->
        <div v-if="activeConfigExtras && activeConfigExtras.extraFields.length" class="active-config-extras">
          <div class="active-config-extras-title">{{ activeConfigExtras.name ? '来自当前配置「' + activeConfigExtras.name + '」' : '当前生效的 env 其他字段' }}</div>
          <div class="extra-fields-list">
            <div v-for="(field, idx) in activeConfigExtras.extraFields" :key="idx" class="extra-field-wrap extra-field-readonly">
              <div class="extra-field-row">
                <div class="field-key-readonly">{{ field.key }}</div>
                <div class="field-value-readonly">{{ field.value }}</div>
              </div>
              <div class="field-tag-row">
                <Tag v-if="extraFields.some(f => f.key?.trim() === field.key)" size="small" theme="warning" variant="light">覆盖全局</Tag>
                <Tag v-else size="small" theme="success" variant="light">生效中</Tag>
              </div>
            </div>
          </div>
        </div>
        <div class="extra-fields-hint">
          <p>以下为全局基础值，切换配置时会与配置中的env其他字段合并（配置优先）。</p>
        </div>
        <div class="extra-fields-list">
          <div v-for="(field, idx) in extraFields" :key="idx" class="extra-field-wrap">
            <div class="extra-field-row">
              <AutoComplete v-model="field.key" class="field-key" :options="extraFieldKeyOptions" filterable placeholder="字段名" />
              <Input v-model="field.value" class="field-value" placeholder="字段值" />
              <Button size="small" theme="danger" variant="text" @click="removeExtraField(idx)"><DeleteIcon /></Button>
            </div>
            <div v-if="activeConfigExtras?.extraFields.some(f => f.key?.trim() === field.key?.trim())" class="field-tag-row">
              <Tag size="small" theme="warning" variant="light">被覆盖</Tag>
            </div>
          </div>
        </div>
        <div class="extra-fields-actions">
          <Button size="small" variant="outline" @click="addExtraField"><template #icon><AddIcon /></template> 添加字段</Button>
          <Button size="small" variant="outline" @click="reloadFromSettings"><template #icon><RefreshIcon /></template> 重新读取其他字段设置</Button>
        </div>
      </div>
      <template #footer>
        <Button variant="outline" @click="showExtraFieldsDialog = false">取消</Button>
        <Button theme="primary" @click="saveExtraFields">保存</Button>
      </template>
    </Dialog>
  </div>
</template>
