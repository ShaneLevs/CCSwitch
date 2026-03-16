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
  Popconfirm,
  Dropdown,
  DropdownMenu,
  DropdownItem,
  Textarea,
} from "tdesign-vue-next";
import { AddIcon, RefreshIcon, DownloadIcon, UploadIcon, FileIcon, LinkIcon } from "tdesign-icons-vue-next";

const DB_PREFIX = "ccswitch_config_";

const currentConfig = ref({
  key: "",
  baseUrl: "",
  model: "",
});

const savedConfigs = ref([]);
const showDialog = ref(false);
const editingConfig = ref(null);
const showImportStringDialog = ref(false);
const importString = ref("");
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

const handleExport = () => {
  if (savedConfigs.value.length === 0) {
    MessagePlugin.warning("没有可导出的配置");
    return;
  }

  const filePath = window.utools.showSaveDialog({
    title: "导出配置",
    defaultPath: `ccswitch-configs-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`,
    filters: [{ name: "JSON 文件", extensions: ["json"] }]
  });

  if (!filePath) return;

  try {
    const configsToExport = savedConfigs.value.map(config => ({
      name: config.name,
      key: window.services.encryptKey(config.key),
      baseUrl: config.baseUrl,
      model: config.model
    }));

    window.services.exportConfigsToFile(filePath, configsToExport);
    MessagePlugin.success("配置已导出");
  } catch (error) {
    console.error("导出失败:", error);
    MessagePlugin.error("导出失败");
  }
};

const handleImport = () => {
  const filePaths = window.utools.showOpenDialog({
    title: "导入配置",
    filters: [{ name: "JSON 文件", extensions: ["json"] }],
    properties: ["openFile"]
  });

  if (!filePaths || filePaths.length === 0) return;

  const filePath = filePaths[0];

  try {
    const data = window.services.importConfigsFromFile(filePath);

    if (!data || data.app !== "ccswitch" || !Array.isArray(data.configs)) {
      MessagePlugin.error("文件格式不正确");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const config of data.configs) {
      if (!config.name || !config.key) {
        failCount++;
        continue;
      }

      try {
        const decryptedKey = window.services.decryptKey(config.key);
        const now = Date.now();
        const doc = {
          _id: DB_PREFIX + now + "_" + Math.random().toString(36).substr(2, 9),
          name: config.name.trim(),
          key: window.services.encryptKey(decryptedKey),
          baseUrl: config.baseUrl?.trim() || "",
          model: config.model?.trim() || "",
          updatedAt: now
        };

        const result = window.utools.db.put(doc);
        if (result.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error("导入配置失败:", err);
        failCount++;
      }
    }

    loadSavedConfigs();

    if (successCount > 0 && failCount === 0) {
      MessagePlugin.success(`成功导入 ${successCount} 个配置`);
    } else if (successCount > 0 && failCount > 0) {
      MessagePlugin.warning(`成功导入 ${successCount} 个，失败 ${failCount} 个`);
    } else {
      MessagePlugin.error("导入失败，请检查文件格式");
    }
  } catch (error) {
    console.error("导入失败:", error);
    MessagePlugin.error("无法读取文件");
  }
};

const handleExportAsString = () => {
  if (savedConfigs.value.length === 0) {
    MessagePlugin.warning("没有可导出的配置");
    return;
  }

  try {
    // 构建去重字典和带引用的配置列表
    const keyDict = new Map(); // key值 -> 第一个出现的配置索引
    const urlDict = new Map(); // url值 -> 第一个出现的配置索引
    const configsToExport = [];

    savedConfigs.value.forEach((config, index) => {
      const cfg = {};
      const idx = index + 1; // 从1开始计数

      // name 总是直接存储
      cfg[`n${idx}`] = config.name;

      // key: 如果重复，引用第一个出现的配置
      if (keyDict.has(config.key)) {
        cfg[`k${idx}`] = `k${keyDict.get(config.key)}`;
      } else {
        cfg[`k${idx}`] = config.key;
        keyDict.set(config.key, idx);
      }

      // url: 如果重复，引用第一个出现的配置
      if (urlDict.has(config.baseUrl)) {
        cfg[`u${idx}`] = `u${urlDict.get(config.baseUrl)}`;
      } else {
        cfg[`u${idx}`] = config.baseUrl;
        urlDict.set(config.baseUrl, idx);
      }

      // model 直接存储（通常不重复）
      cfg[`m${idx}`] = config.model;

      configsToExport.push(cfg);
    });

    const compressed = window.services.compressConfigs(configsToExport);
    const encrypted = window.services.encryptString(compressed);
    window.utools.copyText(encrypted);
    MessagePlugin.success("配置已复制到剪贴板，请勿泄露给他人");
  } catch (error) {
    console.error("导出失败:", error);
    MessagePlugin.error("导出失败");
  }
};

const openImportStringDialog = () => {
  importString.value = "";
  showImportStringDialog.value = true;
};

const handleImportFromString = () => {
  const str = importString.value.trim();
  if (!str) {
    MessagePlugin.warning("请输入配置字符串");
    return;
  }

  try {
    // 解密字符串
    const decrypted = window.services.decryptString(str);
    const decompressed = window.services.decompressConfigs(decrypted);

    if (!decompressed || !Array.isArray(decompressed)) {
      MessagePlugin.error("配置字符串格式不正确");
      return;
    }

    // 解析带数字后缀的字段和引用
    const configs = [];
    const keyMap = new Map(); // 存储每个索引对应的 key 值
    const urlMap = new Map(); // 存储每个索引对应的 url 值

    for (let i = 0; i < decompressed.length; i++) {
      const rawCfg = decompressed[i];
      const idx = i + 1;

      // 获取字段值（处理引用）
      let key = rawCfg[`k${idx}`];
      let url = rawCfg[`u${idx}`];

      // 如果 key 是引用格式 "k数字"，从 keyMap 查找
      if (typeof key === 'string' && /^k\d+$/.test(key)) {
        const refIdx = parseInt(key.substring(1));
        key = keyMap.get(refIdx);
      } else {
        keyMap.set(idx, key);
      }

      // 如果 url 是引用格式 "u数字"，从 urlMap 查找
      if (typeof url === 'string' && /^u\d+$/.test(url)) {
        const refIdx = parseInt(url.substring(1));
        url = urlMap.get(refIdx);
      } else {
        urlMap.set(idx, url);
      }

      configs.push({
        name: rawCfg[`n${idx}`],
        key: key,
        baseUrl: url,
        model: rawCfg[`m${idx}`]
      });
    }

    let successCount = 0;
    let failCount = 0;

    for (const config of configs) {
      if (!config.name || !config.key) {
        failCount++;
        continue;
      }

      try {
        const now = Date.now();
        const doc = {
          _id: DB_PREFIX + now + "_" + Math.random().toString(36).substr(2, 9),
          name: config.name.trim(),
          key: window.services.encryptKey(config.key),
          baseUrl: config.baseUrl?.trim() || "",
          model: config.model?.trim() || "",
          updatedAt: now
        };

        const result = window.utools.db.put(doc);
        if (result.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error("导入配置失败:", err);
        failCount++;
      }
    }

    loadSavedConfigs();
    showImportStringDialog.value = false;

    if (successCount > 0 && failCount === 0) {
      MessagePlugin.success(`成功导入 ${successCount} 个配置`);
    } else if (successCount > 0 && failCount > 0) {
      MessagePlugin.warning(`成功导入 ${successCount} 个，失败 ${failCount} 个`);
    } else {
      MessagePlugin.error("导入失败，请检查配置字符串");
    }
  } catch (error) {
    console.error("导入失败:", error);
    MessagePlugin.error("配置字符串格式不正确");
  }
};

onMounted(() => {
  loadCurrentConfig();
  loadSavedConfigs();
});
</script>

<template>
  <div class="container">
    <div class="header">
      <img src="/logo.png" alt="logo" class="logo" />
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
      <Space>
        <Dropdown>
          <template #dropdown>
            <DropdownMenu>
              <DropdownItem @click="handleExport">导出到文件</DropdownItem>
              <DropdownItem @click="handleExportAsString">复制配置字符串</DropdownItem>
            </DropdownMenu>
          </template>
          <Button variant="outline">
            <template #icon><DownloadIcon /></template>
            导出
          </Button>
        </Dropdown>
        <Dropdown>
          <template #dropdown>
            <DropdownMenu>
              <DropdownItem @click="handleImport">从文件导入</DropdownItem>
              <DropdownItem @click="openImportStringDialog">从字符串导入</DropdownItem>
            </DropdownMenu>
          </template>
          <Button variant="outline">
            <template #icon><UploadIcon /></template>
            导入
          </Button>
        </Dropdown>
        <Button theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template>
          新建配置
        </Button>
      </Space>
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
            <Popconfirm
              theme="danger"
              content="确定要删除这个配置吗？"
              @confirm="deleteConfig(config)"
            >
              <Button
                size="small"
                theme="danger"
                variant="base"
              >
                删除
              </Button>
            </Popconfirm>
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
            <template #icon><RefreshIcon /></template>
            读取当前配置
          </Button>
          <div class="dialog-footer-right">
            <Button variant="outline" @click="showDialog = false">取消</Button>
            <Button theme="primary" @click="saveConfig">保存</Button>
          </div>
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showImportStringDialog"
      header="从字符串导入"
      @confirm="handleImportFromString"
      width="480px"
    >
      <div class="form">
        <div class="form-item">
          <label>配置字符串</label>
          <Textarea
            v-model="importString"
            placeholder="粘贴配置字符串"
            :autosize="{ minRows: 4, maxRows: 8 }"
          />
        </div>
      </div>
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
  display: flex;
  align-items: center;
  gap: 12px;
}

.header .logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.config-card {
  margin-bottom: 0;
}

.config-card :deep(.t-card__body) {
  padding: 12px 16px;
}

.config-card :deep(.t-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--td-component-stroke);
}

.config-card :deep(.t-card__actions) {
  padding: 12px 16px;
}

.config-card .config-info {
  gap: 4px;
}

.config-card .config-item {
  font-size: 13px;
}

.config-card .config-item .label {
  min-width: 50px;
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
