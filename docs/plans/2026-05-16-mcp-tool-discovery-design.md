# MCP 工具发现功能设计

## 目标

在 MCP 配置页中，用户点击已启用的 MCP 服务器卡片上的"查看工具"按钮后，通过 MCP 协议连接服务器获取 `tools/list`，在 Drawer 中展示工具名称、描述和参数信息。

## 技术方案

### 依赖

添加 `@modelcontextprotocol/sdk` 到 dependencies。

### 后端服务 (`public/preload/services.js`)

新增 `getMcpServerTools(config)` 函数：

- 接收 MCP 服务器配置对象 `{ type, command, url, args, env }`
- 根据 type 创建对应的 MCP Client + Transport：
  - STDIO: `StdioClientTransport` — spawn 进程，通过 stdin/stdout 通信
  - HTTP: `StreamableHTTPClientTransport` — HTTP POST 请求
- 调用 `client.listTools()` 获取工具列表
- 返回 `[{ name, description, inputSchema }]`
- 超时 5 秒，完成后关闭连接

### 前端 UI (`src/Switch/McpView.vue`)

- 每个 MCP 卡片右上角增加工具箱图标按钮（仅启用状态可用）
- 点击后右侧滑出 Drawer，标题为服务器名
- 每个工具展示为 Card：工具名（Tag）、描述（灰色文字）、参数（折叠 JSON Schema）
- Loading 状态用 TDesign Spin 组件
- 错误状态用 Message 提示

## 数据流

```
用户点击按钮 → McpView 调用 window.services.getMcpServerTools(config)
→ preload 创建 MCP Client，连接服务器 → 发送 tools/list
→ 返回工具列表 → Drawer 中渲染
```
