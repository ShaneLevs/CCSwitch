# MCP 配置开关功能设计

日期：2026-04-13

## 功能概述

为每个 MCP 配置添加独立开关。关闭的 MCP 配置从 `.claude.json` 移除，存储到 uTools DB（按电脑 ID 隔离）；开启时自动从 DB 恢复到 `.claude.json`。

## 用户需求

1. 每个 MCP 有独立开关，可单独启用/禁用
2. 关闭的 MCP 配置保存到 uTools DB
3. 按电脑 ID (`utools.getNativeId()`) 完全隔离存储
4. 开启时自动从 DB 恢复配置
5. 新增 MCP 默认开启状态
6. 关闭状态仍完整显示配置内容

## 数据存储设计

### uTools DB 键格式

```
ccswitch_mcp_disabled_<nativeId>_<mcpName>
```

- `nativeId`: 通过 `utools.getNativeId()` 获取的电脑唯一标识
- `mcpName`: MCP 服务器名称

### 存储内容结构

```json
{
  "_id": "ccswitch_mcp_disabled_abc123_my-mcp-server",
  "name": "my-mcp-server",
  "config": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"],
    "env": {}
  },
  "nativeId": "abc123",
  "updatedAt": 1715000000000
}
```

### 状态判断逻辑

一个 MCP 的状态由两个因素决定：
1. 是否存在于 `.claude.json` 的 `mcpServers` 中 → 开启
2. 是否存在于 uTools DB（且 nativeId 匹配）→ 关闭

**状态定义**：
- **开启**：配置在 `.claude.json` 中，不在 DB 中
- **关闭**：配置在 uTools DB 中（nativeId 匹配），不在 `.claude.json` 中
- **不存在**：两个地方都没有

## services.js 新增方法

### 1. `getNativeId()`

获取当前电脑的唯一标识。

```javascript
getNativeId() {
  return window.utools.getNativeId()
}
```

### 2. `getDisabledMcpServers()`

获取当前电脑关闭的 MCP 配置列表。

```javascript
getDisabledMcpServers() {
  const nativeId = this.getNativeId()
  const prefix = `ccswitch_mcp_disabled_${nativeId}_`
  const docs = window.utools.db.allDocs()
    .filter(d => d._id.startsWith(prefix))
    .map(d => ({
      name: d.name,
      config: d.config,
      updatedAt: d.updatedAt
    }))
  return docs.sort((a, b) => b.updatedAt - a.updatedAt)
}
```

### 3. `disableMcpServer(name)`

关闭 MCP：从 `.claude.json` 移除，保存到 uTools DB。

```javascript
disableMcpServer(name) {
  // 1. 读取当前配置
  const config = this.getMcpServers()
  if (!config[name]) {
    return { success: false, error: 'MCP 配置不存在' }
  }

  // 2. 保存到 DB
  const nativeId = this.getNativeId()
  const docId = `ccswitch_mcp_disabled_${nativeId}_${name}`
  const existingDoc = window.utools.db.get(docId)
  
  const doc = {
    _id: docId,
    name: name,
    config: config[name],
    nativeId: nativeId,
    updatedAt: Date.now()
  }
  if (existingDoc) doc._rev = existingDoc._rev

  const result = window.utools.db.put(doc)
  if (!result.ok) {
    return { success: false, error: '保存到 DB 失败' }
  }

  // 3. 从 .claude.json 删除
  this.deleteMcpServer(name)

  return { success: true }
}
```

### 4. `enableMcpServer(name)`

开启 MCP：从 DB 恢复，写入 `.claude.json`。

```javascript
enableMcpServer(name) {
  const nativeId = this.getNativeId()
  const docId = `ccswitch_mcp_disabled_${nativeId}_${name}`
  const doc = window.utools.db.get(docId)

  if (!doc) {
    return { success: false, error: 'DB 中未找到该 MCP 配置' }
  }

  // 写入 .claude.json
  const success = this.upsertMcpServer(name, doc.config)
  if (!success) {
    return { success: false, error: '写入配置文件失败' }
  }

  // 删除 DB 记录
  window.utools.db.remove(docId)

  return { success: true }
}
```

### 5. `deleteDisabledMcpServer(name)`

删除关闭状态的 MCP 配置（从 DB 删除）。

```javascript
deleteDisabledMcpServer(name) {
  const nativeId = this.getNativeId()
  const docId = `ccswitch_mcp_disabled_${nativeId}_${name}`
  const doc = window.utools.db.get(docId)

  if (!doc) {
    return { success: false, error: '配置不存在' }
  }

  const result = window.utools.db.remove(docId)
  return { success: result.ok, error: result.ok ? null : '删除失败' }
}
```

### 6. `getAllMcpServersWithStatus()`

获取所有 MCP 配置及其状态（合并开启和关闭的）。

```javascript
getAllMcpServersWithStatus() {
  const enabledServers = this.getMcpServers()
  const disabledServers = this.getDisabledMcpServers()
  const result = []

  // 开启的 MCP
  for (const [name, config] of Object.entries(enabledServers)) {
    result.push({
      name,
      config,
      enabled: true
    })
  }

  // 关闭的 MCP（排除已在开启列表中的同名配置）
  for (const server of disabledServers) {
    if (!enabledServers[server.name]) {
      result.push({
        name: server.name,
        config: server.config,
        enabled: false,
        updatedAt: server.updatedAt
      })
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}
```

## UI 设计

### MCP 卡片组件修改

在 `McpView.vue` 中，修改 MCP 卡片的操作区域：

**布局结构**：
```
[ MCP 名称 ]                    [开关] [类型标签] [编辑] [删除]
[ 配置摘要内容... ]
```

**操作区组件顺序**：
1. Switch 开关组件（新增）
2. Tag 类型标签
3. Button 编辑按钮
4. Popconfirm + Button 删除按钮

### 开关组件行为

**开启状态**：
- Switch 显示为 ON
- 点击开关 → 调用 `disableMcpServer(name)` → 刷新列表

**关闭状态**：
- Switch 显示为 OFF
- Tag 区域显示额外的"已关闭"标签（灰色）
- 点击开关 → 调用 `enableMcpServer(name)` → 刷新列表
- 点击编辑 → 提示"请先开启 MCP 后再编辑"
- 点击删除 → 调用 `deleteDisabledMcpServer(name)`

### 状态判断

使用 `getAllMcpServersWithStatus()` 方法获取带状态的 MCP 列表，替代原有的 `getMcpServers()`。

### 示例代码结构

```vue
<template>
  <Card v-for="server in mcpServerList" :key="server.name">
    <template #actions>
      <Space>
        <!-- 开关 -->
        <Switch 
          :value="server.enabled" 
          @change="toggleMcpStatus(server)"
        />
        <!-- 类型标签 -->
        <Tag :theme="getTypeTagTheme(server.config.type)">
          {{ getTypeTag(server.config.type) }}
        </Tag>
        <!-- 已关闭标签 -->
        <Tag v-if="!server.enabled" theme="default" variant="light">
          已关闭
        </Tag>
        <!-- 编辑 -->
        <Button 
          size="small" 
          :disabled="!server.enabled"
          @click="openEditDialog(server)"
        >
          <EditIcon />
        </Button>
        <!-- 删除 -->
        <Popconfirm @confirm="deleteMcpServer(server)">
          <Button size="small" theme="danger">
            <DeleteIcon />
          </Button>
        </Popconfirm>
      </Space>
    </template>
    ...
  </Card>
</template>

<script setup>
const toggleMcpStatus = (server) => {
  if (server.enabled) {
    // 关闭
    const result = window.services.disableMcpServer(server.name)
    if (result.success) {
      MessagePlugin.success('MCP 已关闭')
      loadMcpServers()
    } else {
      MessagePlugin.error(result.error)
    }
  } else {
    // 开启
    const result = window.services.enableMcpServer(server.name)
    if (result.success) {
      MessagePlugin.success('MCP 已开启')
      loadMcpServers()
    } else {
      MessagePlugin.error(result.error)
    }
  }
}

const deleteMcpServer = (server) => {
  let result
  if (server.enabled) {
    result = window.services.deleteMcpServer(server.name)
  } else {
    result = window.services.deleteDisabledMcpServer(server.name)
  }
  if (result.success) {
    MessagePlugin.success('MCP 配置已删除')
    loadMcpServers()
  } else {
    MessagePlugin.error(result.error)
  }
}
</script>
```

## 交互流程

### 关闭 MCP

1. 用户点击 MCP 卡片上的开关（从 ON 切换到 OFF）
2. 调用 `disableMcpServer(name)`
3. 系统将配置保存到 uTools DB（带 nativeId）
4. 系统从 `.claude.json` 删除该 MCP
5. 刷新 MCP 列表，卡片显示"已关闭"状态

### 开启 MCP

1. 用户点击 MCP 卡片上的开关（从 OFF 切换到 ON）
2. 调用 `enableMcpServer(name)`
3. 系统从 uTools DB 读取配置（匹配 nativeId）
4. 系统将配置写入 `.claude.json`
5. 系统从 DB 删除该记录
6. 刷新 MCP 列表，卡片恢复正常状态

### 新增 MCP

1. 用户点击"添加 MCP"
2. 填写配置内容并保存
3. 直接写入 `.claude.json`（默认开启状态）
4. 刷新列表

### 编辑 MCP

1. 只允许编辑开启状态的 MCP
2. 关闭状态的 MCP：点击编辑按钮提示"请先开启 MCP 后再编辑"
3. 编辑后直接更新 `.claude.json`

### 删除 MCP

1. 开启状态：从 `.claude.json` 删除
2. 关闭状态：从 uTools DB 删除
3. 删除后刷新列表

## 边界情况处理

### 同名 MCP 冲突

**场景**：DB 中有一个关闭的 MCP "foo"，用户手动在 `.claude.json` 中添加同名 MCP。

**处理**：`getAllMcpServersWithStatus()` 合并时，优先显示 `.claude.json` 中的配置（开启状态），DB 中的同名配置被忽略。如果用户再次关闭该 MCP，会覆盖 DB 中的旧记录。

### 跨电脑操作

**场景**：用户在电脑 A 关闭 MCP，切换到电脑 B。

**处理**：电脑 B 无法看到电脑 A 的关闭记录（完全隔离）。如果电脑 B 的 `.claude.json` 中有同名 MCP，则显示为开启状态。

### DB 记录清理

**场景**：开启 MCP 后，DB 记录是否删除？

**处理**：是的，`enableMcpServer()` 成功后会删除 DB 记录，避免冗余存储。

### 配置文件不存在

**场景**：`.claude.json` 文件不存在。

**处理**：`getMcpServers()` 返回空对象，`getDisabledMcpServers()` 正常返回 DB 中的数据。

## 实现步骤

1. **services.js** — 新增 6 个方法（getNativeId、getDisabledMcpServers、disableMcpServer、enableMcpServer、deleteDisabledMcpServer、getAllMcpServersWithStatus）
2. **McpView.vue** — 引入 Switch 组件，修改卡片布局，实现状态切换逻辑
3. **测试** — 验证开关切换、跨电脑隔离、边界情况