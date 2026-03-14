<script setup>
import { ref, onMounted, computed } from "vue";
import {
  Card,
  Button,
  Input,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Divider,
  Empty,
  Icon,
} from "tdesign-vue-next";

const DB_PREFIX = "ccswitch_config_";

const currentConfig = ref({
  key: "",
  baseUrl: "",
  model: "",
});

const savedConfigs = ref([]);
const showDialog = ref(false);
const editingConfig = ref(null);
const formData = ref({
  name: "",
  key: "",
  baseUrl: "",
  model: "",
});

const dialogTitle = computed(() =>
  editingConfig.value ? "编辑配置" : "新建配置",
);

const loadCurrentConfig = () => {
  const settings = window.services.readClaudeSettings();
  if (settings && settings.env) {
    currentConfig.value = {
      key: settings.env.ANTHROPIC_AUTH_TOKEN || "",
      baseUrl: settings.env.ANTHROPIC_BASE_URL || "",
      model: settings.env.ANTHROPIC_MODEL || "",
    };
  }
};

const loadSavedConfigs = () => {
  const docs = window.utools.db.allDocs();
  savedConfigs.value = docs
    .filter((doc) => doc._id.startsWith(DB_PREFIX))
    .map((doc) => ({
      id: doc._id,
      name: doc.name,
      key: window.services.decryptKey(doc.key),
      baseUrl: doc.baseUrl,
      model: doc.model,
      updatedAt: doc.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

const maskKey = (key) => {
  if (!key || key.length < 8) return key || "";
  return key.substring(0, 6) + "***" + key.substring(key.length - 4);
};

const openCreateDialog = () => {
  editingConfig.value = null;
  formData.value = {
    name: "",
    key: "",
    baseUrl: "",
    model: "",
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
  };
  showDialog.value = true;
};

const fillCurrentConfig = () => {
  formData.value.key = currentConfig.value.key;
  formData.value.baseUrl = currentConfig.value.baseUrl;
  formData.value.model = currentConfig.value.model;
};

const saveConfig = () => {
  if (!formData.value.name.trim()) {
    MessagePlugin.warning("请输入配置名称");
    return;
  }

  if (!formData.value.key.trim()) {
    MessagePlugin.warning("请输入 Key");
    return;
  }

  if (!formData.value.baseUrl.trim()) {
    MessagePlugin.warning("请输入 URL");
    return;
  }

  const now = Date.now();
  const id = editingConfig.value ? editingConfig.value.id : DB_PREFIX + now;

  const doc = {
    _id: id,
    name: formData.value.name.trim(),
    key: window.services.encryptKey(formData.value.key.trim()),
    baseUrl: formData.value.baseUrl.trim(),
    model: formData.value.model.trim(),
    updatedAt: now,
  };

  if (editingConfig.value) {
    doc._rev = window.utools.db.get(id)._rev;
  }

  const result = window.utools.db.put(doc);
  if (result.ok) {
    MessagePlugin.success(editingConfig.value ? "配置已更新" : "配置已保存");
    showDialog.value = false;
    loadSavedConfigs();
  } else {
    MessagePlugin.error("保存失败");
  }
};

const deleteConfig = (config) => {
  const result = window.utools.db.remove(config.id);
  if (result.ok) {
    MessagePlugin.success("配置已删除");
    loadSavedConfigs();
  } else {
    MessagePlugin.error("删除失败");
  }
};

const switchConfig = (config) => {
  const currentSettings = window.services.readClaudeSettings() || {};

  if (!currentSettings.env) {
    currentSettings.env = {};
  }

  currentSettings.env.ANTHROPIC_AUTH_TOKEN = config.key;
  currentSettings.env.ANTHROPIC_BASE_URL = config.baseUrl;

  if (config.model && config.model.trim()) {
    currentSettings.env.ANTHROPIC_MODEL = config.model.trim();
  } else {
    delete currentSettings.env.ANTHROPIC_MODEL;
  }

  const success = window.services.writeClaudeSettings(currentSettings);
  if (success) {
    MessagePlugin.success("配置已切换");
    loadCurrentConfig();
  } else {
    MessagePlugin.error("切换失败");
  }
};

const isCurrentConfig = (config) => {
  const configModel = config.model || "";
  const currentModel = currentConfig.value.model || "";
  return (
    config.key === currentConfig.value.key &&
    config.baseUrl === currentConfig.value.baseUrl &&
    configModel === currentModel
  );
};

onMounted(() => {
  loadCurrentConfig();
  loadSavedConfigs();
});
</script>

<template>
  <div class="container">
    <div class="header">
      <h2>Claude Code 配置切换</h2>
    </div>

    <Card title="当前配置" :bordered="true" class="current-card">
      <template #actions>
        <Tag theme="success" variant="light">当前生效</Tag>
      </template>
      <div class="config-info">
        <div class="config-item">
          <span class="label">Key:</span>
          <span class="value">{{
            maskKey(currentConfig.key) || "未设置"
          }}</span>
        </div>
        <div class="config-item">
          <span class="label">URL:</span>
          <span class="value">{{ currentConfig.baseUrl || "未设置" }}</span>
        </div>
        <div class="config-item">
          <span class="label">Model:</span>
          <span class="value">{{ currentConfig.model || "未设置" }}</span>
        </div>
      </div>
    </Card>

    <Divider />

    <div class="section-header">
      <h3>已保存的配置方案</h3>
      <Button theme="primary" @click="openCreateDialog">
        <template #icon><Icon name="add" /></template>
        新建配置
      </Button>
    </div>

    <div v-if="savedConfigs.length === 0" class="empty-state">
      <Empty description="暂无保存的配置方案" />
    </div>

    <div v-else class="config-list">
      <Card
        v-for="config in savedConfigs"
        :key="config.id"
        :bordered="true"
        class="config-card"
      >
        <template #title>
          <span class="config-name">{{ config.name }}</span>
          <Tag
            v-if="isCurrentConfig(config)"
            theme="success"
            variant="light"
            size="small"
            >当前</Tag
          >
        </template>
        <div class="config-info">
          <div class="config-item">
            <span class="label">Key:</span>
            <span class="value">{{ maskKey(config.key) }}</span>
          </div>
          <div class="config-item">
            <span class="label">URL:</span>
            <span class="value">{{ config.baseUrl }}</span>
          </div>
          <div class="config-item">
            <span class="label">Model:</span>
            <span class="value">{{ config.model || "未设置" }}</span>
          </div>
        </div>
        <template #actions>
          <Space>
            <Button
              size="small"
              theme="primary"
              variant="base"
              @click="switchConfig(config)"
              :disabled="isCurrentConfig(config)"
            >
              切换
            </Button>
            <Button size="small" variant="base" @click="openEditDialog(config)">
              编辑
            </Button>
            <Button
              size="small"
              theme="danger"
              variant="base"
              @click="deleteConfig(config)"
            >
              删除
            </Button>
          </Space>
        </template>
      </Card>
    </div>

    <Dialog
      v-model:visible="showDialog"
      :header="dialogTitle"
      @confirm="saveConfig"
      width="480px"
    >
      <div class="form">
        <div class="form-item">
          <label>配置名称 <span class="required">*</span></label>
          <Input v-model="formData.name" placeholder="方便分辨的名字" />
        </div>
        <div class="form-item">
          <label>Key <span class="required">*</span></label>
          <Input
            v-model="formData.key"
            type="password"
            placeholder="ANTHROPIC_AUTH_TOKEN"
          />
        </div>
        <div class="form-item">
          <label>URL <span class="required">*</span></label>
          <Input v-model="formData.baseUrl" placeholder="ANTHROPIC_BASE_URL" />
        </div>
        <div class="form-item">
          <label>Model</label>
          <Input v-model="formData.model" placeholder="ANTHROPIC_MODEL" />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <Button variant="outline" @click="fillCurrentConfig">
            <template #icon><Icon name="refresh" /></template>
            读取当前配置
          </Button>
          <div class="dialog-footer-right">
            <Button variant="outline" @click="showDialog = false">取消</Button>
            <Button theme="primary" @click="saveConfig">保存</Button>
          </div>
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.container {
  padding: 20px;
  min-height: 100vh;
  background: var(--td-bg-color-container);
}

.header {
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.current-card {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.config-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-item {
  display: flex;
  gap: 8px;
}

.config-item .label {
  color: var(--td-text-color-secondary);
  min-width: 60px;
}

.config-item .value {
  color: var(--td-text-color-primary);
  word-break: break-all;
}

.config-name {
  margin-right: 8px;
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-card {
  margin-bottom: 0;
}

.empty-state {
  padding: 40px 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.form-item .required {
  color: var(--td-error-color);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-footer-right {
  display: flex;
  gap: 8px;
}
</style>
