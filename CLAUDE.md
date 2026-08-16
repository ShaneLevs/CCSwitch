# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **Project Name**: CCSwitch (uTools plugin name: CCConfig)
- **Type**: uTools Plugin (Multi-app Config Switcher)
- **Core Functionality**: 管理 Claude Code / OpenCode CLI / Pi Agent / omp / Reasonix 五应用的 API 配置切换、MCP/Skill/Plugin 管理、使用统计分析；另有「通用配置」应用（跨 agent 供应商/模型主数据 + 通用 MCP + 通用 Skill）
- **Target Users**: 使用 Claude Code / OpenCode / Pi Agent / omp / Reasonix 的开发者

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
├── App.vue                    # Root: uTools route dispatch (commonConfig / claudeConfig / opencodeConfig / piConfig / ompConfig / reasonixConfig / install*Skill / installPiExtension) + dark background effects
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
│   ├── useAppContext.js       # Multi-app switching state (claude / opencode / pi / omp / reasonix / common)
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
    └── common/                # 通用配置（跨 agent 主数据）
        ├── ConfigView.vue     # 供应商/模型主数据库 CRUD（四协议）
        ├── McpView.vue        # MCP：本地 ~/.mcp.json + 云端 uTools DB 合并单一列表
        ├── SkillView.vue      # Skill：只读扫描 ~/.agents/skills + 链接安装 + .disabled 启停
        └── styles/

public/
├── plugin.json                # uTools plugin manifest (keywords, features)
├── logo.png                   # 插件主 logo（45° 彩虹星芒）
├── gen.svg                    # 通用配置功能图标
├── claudecode.png             # Claude Code 专属图标（原 logo 更名）
├── icon-opencode.png / icon-pi.png / omp-icon.svg / reasonix.svg
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
        ├── plugins.js         # Claude plugin Marketplace / component discovery
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
- **Skill Install**: SkillHub / ModelScope URL → fetch metadata → download zip → extract → find SKILL.md（安装目录按目标区分：Claude → `~/.claude/skills`，OpenCode → `~/.config/opencode/skills`，通用 → `~/.agents/skills`）

**Key Architecture Pattern — "Fat Preload":**
All Node.js-sensitive operations (file I/O, network requests, child process execution) run in the preload script and are exposed to the Vue renderer via `window.services`. The preload is bundled by esbuild via a custom Vite plugin (`bundlePreloadPlugin` in `vite.config.js`).

**App Context Singleton:**
`useAppContext` uses module-level refs (not provide/inject) — shared reactive state between `index.vue` and all sub-views.

## Key Features

1. **配置管理**: 五应用（Claude / OpenCode / Pi / omp / Reasonix）+ 通用配置（跨 agent 主数据）各自的配置 CRUD 与一键切换
2. **多应用支持**: 每个应用独立配置/MCP/Skill/Plugin/Usage 视图（omp / reasonix 目前仅配置视图；通用配置有 Config/MCP/Skill 三 tab）
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

## Managed Env Fields (constants.js)

```
ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL,
ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL,
ANTHROPIC_DEFAULT_OPUS_MODEL, CLAUDE_CODE_SUBAGENT_MODEL
```

These are explicitly managed during config switch — set, cleared, and not preserved from previous state.

Claude 配置支持「认证方式」（`authVar`）：每个配置可选择 `ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`，切换时写入所选变量并清除另一个（互斥）。OpenCode Go 套餐用 `ANTHROPIC_API_KEY` + baseUrl `https://opencode.ai/zen/go`（注意不带 `/v1`），内置预设一键填充，模型候选实时从 `/v1/models` 获取。

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

1. **commonConfig** — Triggered by keyword "通用配置"
2. **claudeConfig** — Triggered by keyword "Claude Code配置"
3. **opencodeConfig** — Triggered by keyword "OpenCode配置"
4. **piConfig** — Triggered by keyword "Pi Agents配置"
5. **ompConfig** — Triggered by keyword "omp配置"
6. **reasonixConfig** — Triggered by keyword "Reasonix配置"
7. **installCommonSkill** — URL regex (SkillHub / ModelScope) → 安装到 `~/.agents/skills`
8. **installClaudeSkill** — URL regex → 安装到 Claude skills
9. **installOpencodeSkill** — URL regex → 安装到 OpenCode skills
10. **installPiExtension** — Regex `pi install <包名>` → Pi Extension 安装

## Build Notes

- Vite config includes custom `bundlePreloadPlugin` (`vite.config.js`) that runs esbuild on `public/preload/services.js` during `buildStart` + `closeBundle`; dev server watches `public/preload/**` and rebuilds on change
- esbuild options: `bundle: true`, `platform: 'node'`, `target: 'node18'`, `format: 'cjs'` → 输出 `dist/preload/services.js`
- 全部 require 依赖（json5 / js-yaml / smol-toml / @modelcontextprotocol/sdk）被 bundle 进 services.js；构建后清理 Vite 复制到 `dist/preload` 的 node_modules（js-yaml 的 .map 调试文件会导致 uTools 打包拒绝），并清理 .DS_Store
- `@modelcontextprotocol/sdk` 在 `mcp.js` 中 try/catch 懒加载，缺失时工具发现自动降级禁用
- Preload 依赖清单在 `public/preload/package.json`（dev 模式下 uTools 加载源码 preload 时直接 require 需要）
- Base path: `./` (relative, for uTools `file://` loading)
- Root `package.json` 另有 `@lucide/vue`（图标）、`ogl`（背景特效 WebGL）
