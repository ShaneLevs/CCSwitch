# MCP 工具发现功能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 MCP 配置页中，用户点击已启用的 MCP 服务器卡片上的"查看工具"按钮，通过 MCP SDK 连接服务器获取工具列表，在 Drawer 中展示工具名称、描述和参数信息。

**Architecture:** 在 preload/services.js 中新增 `getMcpServerTools(config)` 函数，使用 `@modelcontextprotocol/sdk` 的 Client 连接 MCP 服务器并调用 `listTools()`。前端 McpView.vue 增加 Drawer 组件展示工具列表。

**Tech Stack:** Vue 3, TDesign Vue Next, @modelcontextprotocol/sdk, Node.js (preload)

---

### Task 1: 安装 MCP SDK 依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装依赖**

Run: `npm install @modelcontextprotocol/sdk`

Expected: package.json dependencies 中新增 `@modelcontextprotocol/sdk`

**Step 2: 验证安装**

Run: `ls node_modules/@modelcontextprotocol/sdk/package.json`
Expected: 文件存在

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @modelcontextprotocol/sdk for MCP tool discovery"
```

---

### Task 2: 添加 getMcpServerTools 服务函数

**Files:**
- Modify: `public/preload/services.js` (在 `deleteMcpServer` 方法之后，约 L292 处添加)

**Step 1: 添加服务函数**

在 `window.services` 对象中，`deleteMcpServer` 方法之后添加：

```javascript
// 获取 MCP 服务器的工具列表
async getMcpServerTools(config) {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')

  let client = null
  let transport = null

  try {
    if (config.type === 'http') {
      // HTTP 传输
      transport = new StreamableHTTPClientTransport(new URL(config.url))
    } else {
      // STDIO 传输（默认）
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...(config.env || {}) }
      })
    }

    client = new Client({ name: 'ccswitch', version: '1.0.0' })
    await client.connect(transport)

    const result = await client.listTools()
    return { success: true, tools: result.tools || [] }
  } catch (error) {
    console.error('获取 MCP 工具列表失败:', error)
    return { success: false, error: error.message }
  } finally {
    // 关闭连接
    try {
      if (client) await client.close()
    } catch (e) {
      // 忽略关闭错误
    }
  }
}
```

**Step 2: 验证语法**

Run: `node -c public/preload/services.js`
Expected: 无输出（语法正确）

**Step 3: Commit**

```bash
git add public/preload/services.js
git commit -m "feat: add getMcpServerTools service for MCP tool discovery"
```

---

### Task 3: 在 McpView.vue 中添加工具查看 UI

**Files:**
- Modify: `src/Switch/McpView.vue`

**Step 1: 添加 import 和状态变量**

在 `<script setup>` 的 import 中添加 `Drawer, Spin, Collapse, CollapsePanel` 组件：

```javascript
import {
  Card, Button, Input, Dialog, MessagePlugin, Tag, Space, Empty,
  Textarea, Popconfirm, Switch, Drawer, Spin, Collapse, CollapsePanel,
} from "tdesign-vue-next";
```

添加图标 import：
```javascript
import {
  AddIcon, EditIcon, DeleteIcon, ViewListIcon,
} from "tdesign-icons-vue-next";
```

添加状态变量（在 `mcpName` 之后）：
```javascript
// 工具查看相关
const showToolDrawer = ref(false);
const toolDrawerTitle = ref("");
const toolList = ref([]);
const toolLoading = ref(false);
const toolError = ref("");
```

**Step 2: 添加查看工具方法**

在 `getConfigSummary` 方法之后添加：

```javascript
// 打开工具查看抽屉
const openToolDrawer = async (server) => {
  if (!server.enabled) {
    return MessagePlugin.warning("请先开启 MCP 后再查看工具");
  }
  showToolDrawer.value = true;
  toolDrawerTitle.value = server.name;
  toolList.value = [];
  toolLoading.value = true;
  toolError.value = "";

  try {
    const result = await window.services.getMcpServerTools(server.config);
    if (result.success) {
      toolList.value = result.tools;
      if (result.tools.length === 0) {
        MessagePlugin.info("该 MCP 服务器未提供任何工具");
      }
    } else {
      toolError.value = result.error;
      MessagePlugin.error("获取工具列表失败: " + result.error);
    }
  } catch (e) {
    toolError.value = e.message;
    MessagePlugin.error("获取工具列表失败: " + e.message);
  } finally {
    toolLoading.value = false;
  }
};

// 格式化 JSON Schema 参数为可读文本
const formatSchema = (schema) => {
  if (!schema || !schema.properties) return null;
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) return null;
  return entries.map(([name, prop]) => ({
    name,
    type: prop.type || "any",
    description: prop.description || "",
    required: schema.required?.includes(name) || false,
  }));
};
```

**Step 3: 在卡片 actions 中添加查看工具按钮**

在 `<template>` 的 `<Space>` 中，Switch 之后、Tag 之前添加：

```html
<Button
  size="small"
  theme="default"
  variant="text"
  :disabled="!server.enabled"
  @click="openToolDrawer(server)"
  title="查看工具"
>
  <ViewListIcon />
</Button>
```

**Step 4: 在 Dialog 之后添加 Drawer 组件**

在 `</Dialog>` 之后、`</div>` 之前添加：

```html
<Drawer
  v-model:visible="showToolDrawer"
  :header="toolDrawerTitle + ' - 工具列表'"
  size="500px"
  :footer="false"
>
  <Spin :loading="toolLoading" style="width: 100%">
    <div v-if="toolError" class="tool-error">
      <Tag theme="danger" variant="light">连接失败</Tag>
      <span class="tool-error-msg">{{ toolError }}</span>
    </div>
    <div v-else-if="!toolList.length && !toolLoading" class="tool-empty">
      <Empty description="暂无工具" />
    </div>
    <div v-else class="tool-list">
      <div v-for="tool in toolList" :key="tool.name" class="tool-item">
        <div class="tool-header">
          <Tag theme="primary" variant="light">{{ tool.name }}</Tag>
        </div>
        <div v-if="tool.description" class="tool-desc">{{ tool.description }}</div>
        <div v-if="formatSchema(tool.inputSchema)" class="tool-params">
          <Collapse>
            <CollapsePanel header="输入参数">
              <div class="param-list">
                <div v-for="param in formatSchema(tool.inputSchema)" :key="param.name" class="param-item">
                  <span class="param-name">{{ param.name }}</span>
                  <Tag size="small" theme="default" variant="light">{{ param.type }}</Tag>
                  <Tag v-if="param.required" size="small" theme="danger" variant="light">必填</Tag>
                  <span v-if="param.description" class="param-desc">{{ param.description }}</span>
                </div>
              </div>
            </CollapsePanel>
          </Collapse>
        </div>
      </div>
    </div>
  </Spin>
</Drawer>
```

**Step 5: 添加样式**

在 `<style scoped>` 中添加：

```css
.tool-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
}

.tool-error-msg {
  color: var(--td-text-color-secondary);
  font-size: 13px;
  word-break: break-all;
}

.tool-empty {
  padding: 40px 0;
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-item {
  padding: 12px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tool-desc {
  color: var(--td-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 8px;
}

.tool-params {
  margin-top: 8px;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.param-name {
  font-family: monospace;
  font-size: 13px;
  color: var(--td-text-color-primary);
}

.param-desc {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
```

**Step 6: 验证构建**

Run: `npm run build`
Expected: 构建成功，无错误

**Step 7: Commit**

```bash
git add src/Switch/McpView.vue
git commit -m "feat: add MCP tool discovery drawer in McpView"
```

---

### Task 4: 测试验证

**Step 1: 启动开发服务器**

Run: `npm run dev`

**Step 2: 手动测试**

1. 打开 MCP 配置页
2. 确保有一个已启用的 MCP 服务器
3. 点击卡片上的"查看工具"图标按钮
4. 验证 Drawer 弹出，显示加载状态
5. 验证工具列表正确展示（名称、描述、参数）
6. 测试禁用状态的服务器点击时显示警告
7. 测试连接失败时显示错误信息

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete MCP tool discovery feature"
```
