<script setup>
import { ref, onMounted } from "vue";
import { Card, Button, Input, Dialog, Empty, Popconfirm, Tag, Space, MessagePlugin, Tooltip } from "tdesign-vue-next";
import { AddIcon, DeleteIcon } from "tdesign-icons-vue-next";
import "./styles/OpenCodeSkillView.css";

const plugins = ref([]);
const showDialog = ref(false);
const newPluginName = ref("");

const KNOWN_PLUGINS = {
  "oh-my-openagent": "Oh My OpenCode (标准版)",
  "oh-my-opencode": "Oh My OpenCode (旧名)",
  "oh-my-opencode-slim": "Oh My OpenCode Slim (精简版)",
};

const loadPlugins = () => {
  plugins.value = window.services.getOpencodePlugins();
};

const openConfigFile = () => {
  const filePath = window.services.getOpencodeConfigPath();
  window.utools.shellOpenPath(filePath);
};

const openAddDialog = () => {
  newPluginName.value = "";
  showDialog.value = true;
};

const confirmAdd = () => {
  const name = newPluginName.value.trim();
  if (!name) {
    return MessagePlugin.error("插件名称不能为空");
  }
  if (plugins.value.includes(name)) {
    return MessagePlugin.warning("该插件已存在");
  }
  const success = window.services.addOpencodePlugin(name);
  if (success) {
    MessagePlugin.success(`已添加插件 "${name}"`);
    showDialog.value = false;
    loadPlugins();
  } else {
    MessagePlugin.error("添加插件失败");
  }
};

const removePlugin = (name) => {
  const success = window.services.removeOpencodePlugin(name);
  if (success) {
    MessagePlugin.success(`已移除插件 "${name}"`);
    loadPlugins();
  } else {
    MessagePlugin.error("移除插件失败");
  }
};

const getKnownLabel = (name) => {
  return KNOWN_PLUGINS[name] || null;
};

onMounted(() => loadPlugins());
</script>

<template>
  <div class="opencode-skill-container">
    <div class="section-header">
      <span class="opencode-skill-tip">管理 <span class="hint-link" @click="openConfigFile">opencode.json</span> 中的插件配置</span>
      <Button size="small" theme="primary" @click="openAddDialog">
        <template #icon><AddIcon /></template> 添加插件
      </Button>
    </div>

    <div v-if="!plugins.length" class="empty-state">
      <Empty description="暂无插件配置" />
    </div>

    <div v-else class="plugin-list">
      <Card
        v-for="plugin in plugins"
        :key="plugin"
        :bordered="true"
        class="plugin-card"
      >
        <template #header>
          <div class="plugin-header-wrapper">
            <div class="plugin-header-left">
              <span class="plugin-name">{{ plugin }}</span>
              <Tag v-if="getKnownLabel(plugin)" size="small" variant="light" theme="primary">
                {{ getKnownLabel(plugin) }}
              </Tag>
            </div>
            <Space size="small">
              <Popconfirm theme="danger" content="确定要移除该插件吗？" @confirm="removePlugin(plugin)">
                <Tooltip content="移除" placement="top">
                  <Button size="small" theme="danger" variant="text"><DeleteIcon /></Button>
                </Tooltip>
              </Popconfirm>
            </Space>
          </div>
        </template>
      </Card>
    </div>

    <Dialog
      v-model:visible="showDialog"
      header="添加插件"
      width="420px"
      @confirm="confirmAdd"
    >
      <div class="add-form">
        <div class="form-item">
          <label>插件名称</label>
          <Input
            v-model="newPluginName"
            placeholder="例如: oh-my-openagent"
            @keydown.enter="confirmAdd"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>
