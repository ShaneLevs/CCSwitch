# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **Project Name**: CCSwitch (uTools plugin name: CCConfig)
- **Type**: uTools Plugin (Multi-app Config Switcher)
- **Core Functionality**: 管理 Claude Code / OpenCode CLI / Pi Agent / omp / Reasonix / Codex 六应用的 API 配置切换、MCP/Skill/Plugin 管理、使用统计分析；另有「通用配置」应用（跨 agent 供应商/模型主数据 + 通用 MCP + 通用 Skill）
- **Target Users**: 使用 Claude Code / OpenCode / Pi Agent / omp / Reasonix / Codex 的开发者

## Tech Stack

- **Framework**: Vue 3 (Composition API + `<script setup>`)
- **Build Tool**: Vite + esbuild (preload bundling)
- **UI Library**: TDesign Vue Next (+ tdesign-icons-vue-next)
- **Icons**: @lucide/vue
- **Platform**: uTools (Electron-based desktop tool platform)
- **MCP SDK**: @modelcontextprotocol/sdk (tool discovery, lazy-loaded in preload)
- **Config Parsing**: json5 (OpenCode json/jsonc), js-yaml (omp models.yml / config.yml), smol-toml (Reasonix config.toml)
- **WebGL Effects**: ogl (深色背景特效组件 PrismaticBurst / FaultyTerminal / Aurora / Galaxy)

## Commands

```bash
npm run dev     # Development mode (localhost:5173)
npm run build   # Build for production (includes esbuild preload bundling)
```

## Git Workflow

- `origin` = 主仓库（ShaneLevs/CCSwitch），`upstream-pr3` = 个人 fork（xiaoxiao-svg/CCSwitch，跨 fork PR 来源）
- 当前开发直接在 `main` 分支提交并推送 `origin/main`（git log 可验证；早期「fork 分支 + 跨 fork PR」流程已不再使用）
- 提交信息按现有约定（`feat:` / `fix:` / `style:` / `docs:` / `refactor:` 等前缀，中文描述）

## Architecture

```
src/
├── main.js                    # Entry: theme detection, TDesign registration
├── App.vue                    # Root: uTools route dispatch (commonConfig / claudeConfig / opencodeConfig / piConfig / ompConfig / reasonixConfig / codexConfig / install*Skill / installPiExtension) + dark background effects
├── constants.js               # Managed env fields list
├── main.css / theme.css       # Global styles & CSS variables
├── components/                # 跨应用共享组件（Claude 与通用配置视图复用）
│   ├── ApiKeyInput.vue        # Password input with visibility toggle
│   ├── DynamicKvEditor.vue    # Reusable K/V pair editor with autocomplete
│   ├── PresetCustomInput.vue  # 预设 + 自定义输入
│   ├── McpServerCard.vue      # 通用 MCP 卡片（#tags 插槽，本地/云端 tag）
│   ├── McpServerDialog.vue    # 通用 MCP 添加/编辑弹窗（表单 ↔ JSON 切换，可选 showTarget）
│   ├── McpToolDrawer.vue      # MCP 工具发现抽屉
│   ├── SkillCard.vue          # 通用 Skill 卡片
│   ├── SkillInstallDialog.vue # Skill 链接安装弹窗
│   ├── PrismaticBurst.vue     # 深色背景特效：棱镜光谱爆裂 (ogl)
│   ├── FaultyTerminal.vue     # 深色背景特效：故障像素终端 (ogl)
│   ├── Aurora.vue             # 深色背景特效：流动极光 (ogl)
│   └── Galaxy.vue             # 深色背景特效：星河漫游 (ogl)
├── composables/
│   ├── useAppContext.js       # Multi-app switching state (claude / opencode / pi / omp / reasonix / codex / common)
│   ├── useConfigColumns.js    # Two-column draggable masonry layout
│   ├── useConfigImportExport.js  # Compressed string export/import
│   ├── useConfigSwitch.js     # Apply config to settings.json
│   ├── useExtraFields.js      # Global vs config-specific env extra fields
│   ├── useDarkBackground.js   # 深色背景开关 + 效果选择（DB 持久化）
│   └── useSkillInstall.js     # SkillHub / ModelScope install workflow
├── utils/
│   └── time.js                # Time formatting utils
└── Switch/                    # 每个应用一个子目录（views + styles）
    ├── index.vue              # Main shell: app switcher + tab bar + settings dialog
    ├── shared/
    │   ├── ContributionGrid.vue   # GitHub-style contribution heatmap
    │   └── styles/
    ├── claude/                # Claude Code
    │   ├── ConfigView.vue     # Config CRUD + two-column layout
    │   ├── McpView.vue        # MCP 管理（读写 ~/.claude.json 顶层 mcpServers）
    │   ├── SkillView.vue      # Skill list/management/install
    │   ├── PluginView.vue     # Marketplace repos + plugin lifecycle
    │   ├── UsageView.vue      # Usage stats (DB cache + heatmap history merge)
    │   └── styles/
    ├── opencode/              # OpenCode CLI
    │   ├── ConfigView.vue     # Provider CRUD（Provider Collapse + 卡片内模型管理，已移除 models.dev 预设）
    │   ├── McpView.vue        # MCP management (LOCAL/REMOTE)
    │   ├── SkillView.vue      # Skill management
    │   ├── PluginView.vue     # plugin array management
    │   ├── UsageView.vue      # Usage stats (opencode.db SQLite + JSON fallback)
    │   └── styles/
    ├── pi/                    # Pi Agent
    │   ├── ConfigView.vue     # Provider/model CRUD + auto-fetch + default model auto-switch provider
    │   ├── McpView.vue        # MCP servers (from extensions)
    │   ├── SkillView.vue      # Skills (from extensions)
    │   ├── PluginView.vue     # Extensions (npm/git + pi.dev market browser)
    │   ├── UsageView.vue      # Usage stats (JSONL sessions)
    │   └── styles/
    ├── omp/                   # omp CLI（目前仅配置视图）
    │   ├── ConfigView.vue     # modelRoles + providers/models CRUD (js-yaml)
    │   └── styles/
    ├── reasonix/              # Reasonix（目前仅配置视图）
    │   ├── ConfigView.vue     # 供应商/模型/默认模型 CRUD + .env 密钥管理
    │   └── styles/
    ├── codex/                 # Codex（Desktop / CLI，目前仅模型配置视图）
    │   ├── ConfigView.vue     # 当前模型/思考强度/跳过登录 + 供应商(model_providers)与模型 CRUD + models.json 目录同步
    │   └── styles/
    └── common/                # 通用配置（跨 agent 主数据）
        ├── ConfigView.vue     # 供应商/模型主数据库 CRUD（四协议）
        ├── McpView.vue        # MCP：本地 ~/.mcp.json + 云端 uTools DB 合并单一列表
        ├── SkillView.vue      # Skill：只读扫描 ~/.agents/skills + 链接安装 + .disabled 启停
        ├── AutoRouteView.vue  # 自动路由：本地模型网关（开关/端口/key/模型勾选/下发/请求日志）
        └── styles/

public/
├── plugin.json                # uTools plugin manifest (keywords, features)
├── logo.png                   # 插件主 logo（45° 彩虹星芒）
├── gen.svg                    # 通用配置功能图标
├── claudecode.png             # Claude Code 专属图标（原 logo 更名）
├── icon-opencode.png / icon-pi.png / omp-icon.svg / reasonix.svg / icon-codex.png
└── preload/
    ├── services.js            # Main service entry → window.services
    ├── package.json           # Preload 依赖清单（json5 / js-yaml / smol-toml）
    └── services/
        ├── config.js          # Claude settings.json / ~/.claude.json I/O（含顶层 mcpServers）、压缩、持久化
        ├── common.js          # 通用配置：供应商/模型主数据 + 本地/云端 MCP + ~/.agents/skills Skill
        ├── crypto.js          # AES-256-CBC encryption + substitution cipher
        ├── mcp.js             # MCP enable/disable + SDK tool discovery (STDIO/HTTP/SSE)
        ├── opencode.js        # OpenCode config CRUD (json5/jsonc) + SQLite/JSON usage stats
        ├── pi.js              # Pi Agent provider/model/extension CRUD, auto-fetch via /models API
        ├── omp.js             # omp modelRoles + models.yml providers CRUD（js-yaml 纯文件读写）
        ├── reasonix.js        # Reasonix config.toml + .env 读写（smol-toml）
        ├── codex.js           # Codex ~/.codex/config.toml（smol-toml）+ models.json 目录 + DB 模型列表
        ├── plugins.js         # Claude plugin Marketplace / component discovery
        ├── dispatch.js        # 通用库 → 各 agent 模型配置下发（dispatchCommonModel / dispatchAutoRoute）
        ├── autoroute.js       # 自动路由本地网关（uTools DB 配置、http server 启停、路由、请求日志）
        ├── autoroute-convert/ # 协议转换层：canonical.js 标准格式 + source.js/target.js 入出站适配 + stream.js 流式管道
        └── usage.js           # Shared JSONL parsing / stats aggregation (Claude + Pi)
```

**Data Flow:**

- **Claude Config**: `~/.claude/settings.json` ↔ uTools DB (AES-256-CBC encrypted)
  - Switch: `useConfigSwitch` writes managed env fields → clears non-managed → merges global + config extra fields
  - Active config ID persisted as `ccswitch_active_config_id` in uTools DB
- **Claude MCP**: 读写 `~/.claude.json` 顶层 `mcpServers`（Claude Code 官方位置，单一来源，全局生效）；已移除旧来源（`~/.mcp.json` / `~/.claude/.mcp.json`）的读取/合并/迁移逻辑。禁用状态存 uTools DB（`ccswitch_mcp_disabled_*`）
  - Tool discovery via MCP SDK (StreamableHTTP → SSE fallback for HTTP; StdioClientTransport for STDIO)
- **Claude Skills**: `~/.claude/skills/` (global + project-level) + `.disabled` 目录机制
- **Usage Stats (Claude)**: `~/.claude/projects/**/*.jsonl` → parsed & aggregated
  - **DB 缓存层**：UsageView 读 `readClaudeUsage()` 时按 `signature = file_count:max_mtimeMs` 做轻量校验；命中缓存直接返回 summary/modelStats/contributions，跳过 JSONL 解析；未命中全量解析后写缓存；"刷新" 按钮强制重算
  - **热力图历史合并**：全量解析后，将实时 contributions 与 uTools DB 中 `ccswitch_heatmap_*` 历史按日期合并（同日取 tokens 较大者，历史有而实时没有的日期保留），合并后重算 summary/modelStats 确保与热力图口径一致；`readPersistedUsage` 作为 JSONL 读取失败时的兜底（直接从历史重建统计）
  - **已知限制**：`readClaudeUsage` 返回的 summary/modelStats 基于合并后的 contributions（含历史保留的更高 token 数），而 `messageRecords` 仅含当前 JSONL 明细，二者口径不同；UI 当前只展示 summary/modelStats/contributions，不直接消费 messageRecords，故不影响显示
- **MCP Usage**: Parsed from JSONL `tool_use` messages matching `mcp__{server}__{tool}` pattern
- **Common（通用配置，跨 agent 主数据）**:
  - 供应商/模型主数据 → uTools DB `ccswitch_common_providers`（API Key 加密）；支持 OpenAI Chat Completions / OpenAI Responses / Anthropic Messages / Google Generative AI 四类协议
  - 通用 MCP → uTools DB `ccswitch_common_mcp`（格式同 ~/.mcp.json 的 `{ mcpServers }`）与本地 `~/.mcp.json` 双存储；McpView 按名称合并为单一列表，卡片标「本地/云端」tag，支持双端复制/移除，同名配置不同时显示警告
  - 通用 Skill → 只读扫描 `~/.agents/skills`（SKILL.md 元数据）；启停 = 物理移动目录到 `.disabled/`（与 Claude Code 机制一致）
  - `writeDoc` 捕获 uTools 结构化克隆失败：递归定位函数/Symbol 等非 JSON 字段并净化（丢弃）后重试写入（兼容历史脏数据）；失败时抛带原始错误信息的异常供 UI 展示
  - **模型下发到 Agent**（`services/dispatch.js`）：把主数据的 provider + model 写入各 agent 模型配置——Claude → uTools DB 保存配置（`ccswitch_config_dispatch_<provider>`，一个 provider 一份，Claude 配置页可见；key 加密、authVar 默认 AUTH_TOKEN，模型自动填入空闲槽位 默认/Haiku/Sonnet/Opus/Subagent，已有同模型跳过、5 槽位满报错，不直接改 settings.json；**仅接受 anthropic-messages 协议供应商**，其余协议 UI 禁用 Claude 选项、preload 直接报错）；OpenCode → `opencode.json` provider[id]（options.baseURL/apiKey + models[id]）；Pi → `models.json` providers[name]（可选默认 provider/model）；omp → `models.yml` providers[name]（无默认概念）；Reasonix → `config.toml` providers[] + `.env` key（可选 `default_model`）；Codex → `~/.codex/config.toml` [model_providers.<id>]（**仅接受 OpenAI Chat/Responses 协议**，wire_api 映射 chat/responses；可选 setDefault 写顶层 model_provider+model，模型同时进 DB 列表）。每个目标独立 try/catch，单个失败不影响其他目标
  - **自动路由**（`services/autoroute.js` + `autoroute-convert/`）：本地模型网关，把通用库勾选的供应商+模型经 `http://127.0.0.1:<port>`（默认 17877）暴露给本机 agent——入站支持 Anthropic Messages（`POST /v1/messages`）/ OpenAI Chat（`/v1/chat/completions`）/ OpenAI Responses（`/v1/responses`），出站支持 anthropic-messages / openai-completions / openai-responses（google-generative-ai 不支持，明确 400）；入站与出站协议一致时透传（仅重写 model，保留图片等字段），否则经 canonical 中间格式转换（含流式 SSE：canonical 事件流 ↔ 各协议帧）；`GET /v1/models` 返回启用模型（去重）；model 直查按勾选顺序，兼容「供应商/模型ID」消歧；随机 key（`sk-ccr-*`，Authorization Bearer / x-api-key 均可）校验防本机滥用。配置存 uTools DB `ccswitch_autoroute_config`；onPluginReady/onPluginEnter 幂等自启动（enabled=true 时），uTools 退出即停。请求日志存内存（最近 50 条）
  - **自动路由下发**（`dispatchAutoRoute(targets)`）：虚拟供应商「自动路由」按目标 agent 构造——Claude 目标 `api='anthropic-messages'`（通过协议守卫），Codex 目标 `api='openai-responses'`（Responses 为 Codex 原生 wire_api，base_url 追加 `/v1` 指向网关），其余 `api='openai-completions'`；baseUrl 指向网关、key 为网关随机 key，模型为全部启用模型，复用各目标既有写入实现
- **OpenCode Config**: `~/.config/opencode.json` / `opencode.jsonc`（json5/jsonc 解析，优先 `.json`，不存在自动检测 `.jsonc`）↔ uTools DB
- **OpenCode Usage**:
  - 数据目录（Windows/macOS/Linux 通用 XDG 风格）：`~/.local/share/opencode/opencode.db`
  - 多候选回退：`%LOCALAPPDATA%\opencode\` → 以上 XDG 路径 → Windows 专有 `~/AppLocal/Local/opencode/`
  - 读取路径：`node:sqlite`（原生）→ 子进程 `--experimental-sqlite` 回退（Electron 沙箱）
  - 数据兜底：SQLite 优先，其次 `storage/*.json`
  - 模型名：`session.model` 列存 JSON `{"id":"...","providerID":"..."}`，需 `JSON.parse` 取 `id` 字段，否则显示 `unknown`
  - `usage.calculateStats` 汇总 session tokens_* 列（input/output/reasoning/cache_read/cache_write）
- **Pi Agent Config**: `~/.pi/agent/settings.json` + `models.json` + `~/.pi/agent/sessions/**/*.jsonl`
  - Provider/model CRUD via `pi.js`；供应商名称和模型 ID 均可编辑（重命名 = 删除旧键 + 创建新键 + 同步更新默认指向）
  - `setPiDefaultProvider` 设置默认供应商；`setPiDefaultModel` 设置默认模型；设置默认模型前会自动切换到该模型所属供应商
  - `fetchProviderModels` calls `{baseUrl}/models` (OpenAI-compatible) for auto-fetch
  - Pi schema rules: `cost` must be `{input, output, cacheRead, cacheWrite}` object; `contextWindow: 0` is invalid (omit instead)
- **omp CLI Config**: `~/.omp/agent/models.yml` + `config.yml`
  - `modelRoles`（config.yml）用 js-yaml 直接读写文件（load → 改 modelRoles → dump 写回，保留其他配置键）；值格式 `provider/model[:thinkingLevel]`，无前缀引用会显示为 provider 空，编辑时自动补全带前缀
  - `models.yml` providers 用 js-yaml 直接读写，结构同 Pi 的 models.json，模型额外支持 `thinking: {minLevel, maxLevel, mode}`
  - 删除供应商/模型前检查 modelRoles 引用，被引用时拒绝删除并提示先修改角色
  - 纯文件读写，不依赖 omp 二进制 / bun 运行时
- **Reasonix Config**: `~/.reasonix/config.toml`（Windows: `%APPDATA%\reasonix\config.toml`）用 smol-toml 读写（保留未知扩展字段；smol-toml 整数解析为 BigInt，需转 Number）+ `~/.reasonix/.env` 密钥管理（掩码编辑，`ENV_KEY_RE` 校验变量名合法性）
- **Codex Config**: `~/.codex/config.toml`（Codex Desktop / CLI / VS Code 插件共用）用 smol-toml 读写（解析失败抛错阻断写回，防覆盖 mcp_servers 等配置节；保留 provider 未知扩展字段如 env_key/http_headers）
  - 接入方式参照 DeepSeek 官方文档：`[model_providers.<id>]`（name / base_url / wire_api: responses|chat / experimental_bearer_token）+ 顶层 `model` / `model_provider` / `model_reasoning_effort` / `preferred_auth_method` / `forced_login_method` / `model_catalog_json`
  - 仅管理模型相关字段，其余配置读改写原样保留；切换默认模型（`setCodexDefaultModel`）时只补缺失的 `preferred_auth_method=apikey` + `forced_login_method=api`（跳过 ChatGPT 登录），不覆盖用户已有值
  - 每供应商模型列表存 uTools DB `ccswitch_codex_provider_models`（config.toml 原生无此概念），供卡片快捷切换与目录生成；供应商重命名/删除自动同步
  - 「同步模型目录」：把各供应商模型合并写入 `~/.codex/models.json`（桌面端模型列表由该文件驱动，已有条目原样保留，只补缺失 slug，instructions_template=null 用内置模板）并设置 `model_catalog_json`；纯手动触发，下发不自动写该文件
- **Skill Install**: SkillHub / ModelScope URL → fetch metadata → download zip → extract → find SKILL.md（安装目录按目标区分：Claude → `~/.claude/skills`，OpenCode → `~/.config/opencode/skills`，通用 → `~/.agents/skills`）

**Key Architecture Pattern — "Fat Preload":**
All Node.js-sensitive operations (file I/O, network requests, child process execution) run in the preload script and are exposed to the Vue renderer via `window.services`. The preload is bundled by esbuild via a custom Vite plugin (`bundlePreloadPlugin` in `vite.config.js`).

**App Context Singleton:**
`useAppContext` uses module-level refs (not provide/inject) — shared reactive state between `index.vue` and all sub-views.

## Key Features

1. **配置管理**: 六应用（Claude / OpenCode / Pi / omp / Reasonix / Codex）+ 通用配置（跨 agent 主数据）各自的配置 CRUD 与一键切换
2. **多应用支持**: 每个应用独立配置/MCP/Skill/Plugin/Usage 视图（omp / reasonix / codex 目前仅配置视图；通用配置有 Config/MCP/Skill 三 tab）
3. **MCP 管理**: MCP 服务器启用/禁用、JSON 编辑、实时工具发现画布；通用 MCP 本地/云端双存储合并管理
4. **Skill 管理**: 全局/项目级 Skill 列表、启用/禁用（`.disabled` 目录机制）、从 SkillHub/ModelScope 安装（Claude / OpenCode / 通用）
5. **Plugin/Extension 管理**: Claude Marketplace 仓库 + 插件生命周期；OpenCode plugin 数组；Pi Extension (npm/git) + pi.dev 包市场浏览
6. **导入导出**: 文件方式(JSON) 或 字符串方式(zlib 压缩 + 替换加密)
7. **使用统计**: Token 用量、模型分布、贡献墙热力图(持久化)、MCP 使用追踪（Claude DB 缓存 / OpenCode SQLite / Pi JSONL）
8. **模型后缀**: `[1m]` 后缀标记百万上下文模型，切换时自动处理
9. **Env 额外字段**: 全局基准 + 配置特定覆盖的 env 字段合并机制
10. **首次打开跳过老用户**: 非首次访问时跳过引导，直接展示功能界面
11. **清除配置按钮**: 提供一键清除已保存的配置项
12. **模型 CRUD**: Pi / omp / Reasonix / 通用 供应商与模型增删改，模型 ID 可编辑，Pi 支持从 `/models` API 自动拉取模型列表、设置默认模型自动切换供应商
13. **通用配置主数据**: 跨 agent 供应商/模型主数据库（四协议），API Key 加密存 uTools DB，MCP/Skill 双端管理
14. **刷新按钮**: 所有配置页面工具栏统一刷新按钮（纯图标，置于按钮组最右）
15. **深色背景特效**: 可配置的动态背景（棱镜光谱爆裂 / 故障像素终端 / 流动极光 / 星河漫游，ogl WebGL）
16. **模型下发到 Agent**: 通用配置页用级联选择器多选主数据供应商 + 模型（勾选供应商 = 全选其模型），一键批量写入 6 个 agent（Claude / OpenCode / Pi / omp / Reasonix / Codex）的模型配置；Claude 仅接受 Anthropic Messages 协议供应商、Codex 仅接受 OpenAI 系协议供应商（UI 禁用选项 + preload 报错双重拦截）
17. **自动路由**: 通用配置页 tab，本地模型网关总开关——勾选主数据供应商+模型经本地端点暴露给任意 agent，三种入站协议（Anthropic Messages / OpenAI Chat / OpenAI Responses）跨协议自动转换（含流式），页内一键下发虚拟供应商「自动路由」到各 agent，含端口/key 管理与最近请求日志
18. **Codex 模型配置**: Codex（Desktop / CLI / VS Code 插件共用 `~/.codex/config.toml`）仅模型配置视图——当前模型/供应商（顶层 model + model_provider 配对切换）、思考强度（model_reasoning_effort）、跳过 ChatGPT 登录（preferred_auth_method/forced_login_method 成对写删）、供应商 CRUD（[model_providers.<id>]，密钥 experimental_bearer_token 明文写入）、每供应商模型列表（DB）+ 从 /models 接口拉取、「同步模型目录」生成 models.json

## Managed Env Fields (constants.js)

```
ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL,
ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL,
ANTHROPIC_DEFAULT_OPUS_MODEL, CLAUDE_CODE_SUBAGENT_MODEL
```

These are explicitly managed during config switch — set, cleared, and not preserved from previous state.

Claude 配置支持「认证方式」（`authVar`）：每个配置可选择 `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`，切换时写入所选变量并清除另一个（互斥）。OpenCode Go 套餐用 `ANTHROPIC_API_KEY` + baseUrl `https://opencode.ai/zen/go`（注意不带 `/v1`），URL 填入该地址时自动切换认证方式为 API_KEY，模型候选实时从 `/v1/models` 获取（不写死）。

## Dark Mode Implementation

- **Control**: TDesign dark mode via `document.documentElement.setAttribute('theme-mode', 'dark')`
- **Auto-switch**: System preference detection with `window.matchMedia('(prefers-color-scheme: dark)')`
- **Location**: `src/main.js` - initializes and monitors system theme changes

## Styling Patterns

- **Text colors**: Always use TDesign CSS variables for dark mode support
  - Primary text: `var(--td-text-color-primary)`
  - Secondary text: `var(--td-text-color-secondary)`
  - Placeholder: `var(--td-text-color-placeholder)`
- **Backgrounds**: Use `var(--td-bg-color-container)`, `var(--td-bg-color-container-hover)`
- **Dark mode overrides**: `:root[theme-mode="dark"] .class-name { ... }`
- **Per-view CSS**: 每个视图对应 `src/Switch/<app>/styles/` 下同名 CSS 文件；共享组件样式写在组件内部（`src/components/`）
- **Checkbox 绿色主题**: 所有 Checkbox 统一使用绿色主题色，通过 `--td-brand-color: var(--td-success-color)` 覆盖。已用于跳过登录(`.skip-login-checkbox`)、模型1m标记(`.model-1m-checkbox`)、预设区复选框(`.preset-checkboxes`)等所有复选框场景

## UI Components Used

- Card, Button, Input, Dialog, Tag, Space, Divider, Empty, Popconfirm
- Dropdown, DropdownMenu, DropdownItem, Textarea, List, ListItem, ListItemMeta
- Statistic, Tooltip, Switch, RadioGroup, RadioButton, Collapse, CollapsePanel, Alert, AutoComplete, Select, InputNumber, CheckboxGroup, Checkbox, MessagePlugin
- Icons from `tdesign-icons-vue-next` and `@lucide/vue`

## uTools Plugin Features (plugin.json)

plugin.json **仅静态声明「通用配置」两个入口**（保证插件永远可被打开）：

1. **commonConfig** — Triggered by keyword "通用配置"
2. **installCommonSkill** — URL regex (SkillHub / ModelScope) → 安装到 `~/.agents/skills`

各 agent 的指令（功能指令 + 匹配指令）**不做静态声明**，规范定义内置在 `public/preload/services/commands.js` 的 `FEATURE_DEFINITIONS`（与原静态声明逐字段一致），由启停同步逻辑在插件装载/进入/勾选时按启停状态动态注册（`utools.setFeature`）：

- **claudeConfig / installClaudeSkill** — 关键词 "Claude Code配置" / URL regex 安装 Skill
- **opencodeConfig / installOpencodeSkill** — "OpenCode配置" / URL regex
- **piConfig / installPiExtension** — "Pi Agents配置" / regex `pi install <包名>`
- **ompConfig** — "omp配置"；**reasonixConfig** — "Reasonix配置"；**codexConfig** — "Codex配置"

> **为什么不做静态声明**：静态 features 会在 uTools 重启 / 插件更新 / 开发者工具重新导入后全部回归指令注册表，已停用 agent 的指令无法清除。动态指令不受此影响——默认（未打开过插件）搜索框没有 agent 指令，首次打开插件后按启停状态生成。

> **Agent 启停 ↔ 启动指令同步**：设置 →「Agent 启停管理」勾选状态存 uTools DB（`ccswitch_visible_agents`，首次默认全部启用）。停用某 agent 时，preload 通过 uTools 动态指令 API（`utools.removeFeature`）从指令注册表移除其 features（固定命令 + 匹配命令，映射见 `public/preload/services/commands.js` 的 `AGENT_FEATURES`：claude → claudeConfig/installClaudeSkill，opencode → opencodeConfig/installOpencodeSkill，pi → piConfig/installPiExtension，omp → ompConfig，reasonix → reasonixConfig，codex → codexConfig）；启用时 `utools.setFeature` 按内置规范定义（`FEATURE_DEFINITIONS`，agent 指令已不写入 plugin.json）恢复。**preload 装载（顶层执行）+ `onPluginEnter` 每次**进入时从 DB 重放同步（幂等自愈重启/更新后的回归；注意 uTools **没有 onPluginReady API**，误用会抛 TypeError 中断后续注册、令同步链路失效），渲染进程勾选变化时即时调用 `window.services.syncAgentCommands`。「通用配置」（commonConfig / installCommonSkill）为静态声明，永不参与启停。
> **背景与实现约束**：uTools 4.x 插件以 asar 只读打包，运行时**无法改写 plugin.json 文件**，动态指令 API（setFeature/removeFeature/getFeatures）是官方提供的唯一「对插件应用功能进行动态增减」机制。agent 指令的规范定义内置于 `commands.js`（不依赖运行时读取 plugin.json，dev/prod 无路径差异）。

## Build Notes

- Vite config includes custom `bundlePreloadPlugin` (`vite.config.js`) that runs esbuild on `public/preload/services.js` during `buildStart` + `closeBundle`; dev server watches `public/preload/**` and rebuilds on change
- esbuild options: `bundle: true`, `platform: 'node'`, `target: 'node18'`, `format: 'cjs'` → 输出 `dist/preload/services.js`
- 全部 require 依赖（json5 / js-yaml / smol-toml / @modelcontextprotocol/sdk）被 bundle 进 services.js；构建后清理 Vite 复制到 `dist/preload` 的 node_modules（js-yaml 的 .map 调试文件会导致 uTools 打包拒绝），并清理 .DS_Store
- `@modelcontextprotocol/sdk` 在 `mcp.js` 中 try/catch 懒加载，缺失时工具发现自动降级禁用
- Preload 依赖清单在 `public/preload/package.json`（dev 模式下 uTools 加载源码 preload 时直接 require 需要）
- Base path: `./` (relative, for uTools `file://` loading)
- Root `package.json` 另有 `@lucide/vue`（图标）、`ogl`（背景特效 WebGL）
