# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **Project Name**: CCSwitch (uTools plugin name: CCConfig)
- **Type**: uTools Plugin (Multi-app Config Switcher)
- **Core Functionality**: 管理 Claude Code / OpenCode / Pi Agent 的 API 配置切换、MCP/Skill/Plugin 管理、使用统计分析
- **Target Users**: 使用 Claude Code / OpenCode / Pi Agent 的开发者

## Tech Stack

- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite + esbuild (preload bundling)
- **UI Library**: TDesign Vue Next
- **Icons**: @lucide/vue
- **Platform**: uTools (Electron-based desktop tool platform)
- **MCP SDK**: @modelcontextprotocol/sdk (tool discovery)
- **Config Parsing**: json5 (OpenCode config)

## Commands

```bash
npm run dev     # Development mode (localhost:5173)
npm run build   # Build for production (includes esbuild preload bundling)
```

## Git Workflow

- **所有操作直接在 `main` 主分支进行**，不要单独建 feature 分支，不要用 git worktree 隔离。新建分支、PR 流程一律跳过。
- 提交信息按现有约定（`feat:` / `style:` / `docs:` 等前缀，中文描述）。

## Architecture

```
src/
├── main.js                    # Entry: theme detection, TDesign registration
├── App.vue                    # Root: uTools route dispatch (claudeConfig / opencodeConfig / piConfig / installSkill)
├── constants.js               # Managed env fields list
├── main.css / theme.css       # Global styles & CSS variables
├── components/
│   ├── ApiKeyInput.vue        # Password input with visibility toggle
│   └── DynamicKvEditor.vue   # Reusable K/V pair editor with autocomplete
├── composables/
│   ├── useAppContext.js       # Multi-app switching state (Claude / OpenCode)
│   ├── useConfigColumns.js   # Two-column draggable masonry layout
│   ├── useConfigImportExport.js  # Compressed string export/import
│   ├── useConfigSwitch.js    # Apply config to settings.json
│   ├── useExtraFields.js     # Global vs config-specific env extra fields
│   └── useSkillInstall.js    # SkillHub / ModelScope install workflow
└── Switch/
    ├── index.vue              # Main shell: app switcher + tab bar
    ├── ConfigView.vue         # Claude config CRUD + two-column layout
    ├── McpView.vue            # Claude MCP server management + tool discovery
    ├── SkillView.vue          # Claude Skill list/management/install
    ├── UsageView.vue          # Usage statistics dashboard
    ├── ContributionGrid.vue   # GitHub-style contribution heatmap
    ├── OpenCodeConfigView.vue # OpenCode provider CRUD + models.dev presets
    ├── OpenCodeMcpView.vue    # OpenCode MCP server management (LOCAL/REMOTE)
    ├── OpenCodePluginView.vue # OpenCode plugin management (opencode.json/plugin array)
    ├── OpenCodeUsageView.vue  # OpenCode usage stats (opencode.db SQLite + JSON storage fallback)
    ├── PiConfigView.vue       # Pi Agent provider/model CRUD + auto-fetch
    ├── PiMcpView.vue          # Pi MCP servers (from extensions)
    ├── PiSkillView.vue        # Pi Skills (from extensions)
    ├── PiPluginView.vue       # Pi Extensions (npm/git packages)
    ├── PiUsageView.vue        # Pi usage statistics (JSONL sessions)
    └── styles/                # Per-view CSS files

public/
├── plugin.json                # uTools plugin manifest (keywords, features)
├── logo.png / icon-opencode.png
└── preload/
    ├── services.js            # Main service entry → window.services
    └── services/
        ├── config.js          # settings.json / .claude.json I/O, compression, persistence
        ├── crypto.js          # AES-256-CBC encryption + substitution cipher
        ├── mcp.js             # MCP enable/disable + SDK tool discovery (STDIO/HTTP/SSE)
        ├── opencode.js        # OpenCode config CRUD (json5) + models.dev presets
        ├── pi.js              # Pi Agent provider/model/extension CRUD, auto-fetch via /models API
        └── usage.js           # Shared JSONL parsing (used by Claude + Pi)
```

**Data Flow:**

- **Claude Config**: `~/.claude/settings.json` ↔ uTools DB (AES-256-CBC encrypted)
  - Switch: `useConfigSwitch` writes managed env fields → clears non-managed → merges global + config extra fields
  - Active config ID persisted as `ccswitch_active_config_id` in uTools DB
- **Claude MCP**: `~/.claude.json` (server definitions) + uTools DB (disabled state)
  - Tool discovery via MCP SDK (StreamableHTTP → SSE fallback for HTTP; StdioClientTransport for STDIO)
- **Claude Skills**: `~/.claude/skills/` (global + project-level) + `.claude.json` (usage data)
- **Usage Stats (Claude)**: `~/.claude/projects/**/*.jsonl` → parsed & aggregated；heatmap 持久化到 uTools DB
  - **DB 缓存层**：UsageView 读 `readClaudeUsage()` 时按 `signature = file_count:max_mtimeMs` 做轻量校验；命中缓存直接返回 summary/modelStats/contributions，跳过 JSONL 解析；未命中全量解析后写缓存；"刷新" 按钮强制重算
- **MCP Usage**: Parsed from JSONL `tool_use` messages matching `mcp__{server}__{tool}` pattern
- **OpenCode Config**: `~/.config/opencode.json` (json5 format) ↔ uTools DB
- **OpenCode Usage**:
  - 数据目录（Windows/macOS/Linux 通用 XDG 风格）：`~/.local/share/opencode/opencode.db`
  - 多候选回退：`%LOCALAPPDATA%\opencode\` → 以上 XDG 路径 → Windows 专有 `~/AppLocal/Local/opencode/`
  - 读取路径：`node:sqlite`（原生）→ 子进程 `--experimental-sqlite` 回退（Electron 沙箱）
  - 数据兜底：SQLite 优先，其次 `storage/*.json`
  - 模型名：`session.model` 列存 JSON `{"id":"...","providerID":"..."}`，需 `JSON.parse` 取 `id` 字段，否则显示 `unknown`
  - `usage.calculateStats` 汇总 session tokens_* 列（input/output/reasoning/cache_read/cache_write）
- **Pi Agent Config**: `~/.pi/agent/settings.json` + `models.json` + `~/.pi/agent/sessions/**/*.jsonl`
  - Provider/model CRUD via `pi.js`; `setPiDefaultProvider` auto-syncs `defaultModel` to first model of new provider
  - `fetchProviderModels` calls `{baseUrl}/models` (OpenAI-compatible) for auto-fetch
  - Pi schema rules: `cost` must be `{input, output, cacheRead, cacheWrite}` object; `contextWindow: 0` is invalid (omit instead)
- **Skill Install**: SkillHub / ModelScope URL → fetch metadata → download zip → extract → find SKILL.md

**Key Architecture Pattern — "Fat Preload":**
All Node.js-sensitive operations (file I/O, network requests, child process execution) run in the preload script and are exposed to the Vue renderer via `window.services`. The preload is bundled by esbuild via a custom Vite plugin (`bundlePreloadPlugin` in `vite.config.js`).

**App Context Singleton:**
`useAppContext` uses module-level refs (not provide/inject) — shared reactive state between `index.vue` and all sub-views.

## Key Features

1. **配置管理**: 读取/保存/切换 Claude API 配置 (7 managed env fields + variable extra fields)
2. **多应用支持**: Claude Code / OpenCode / Pi Agent 三路切换，各自独立的配置/MCP/Skill/Plugin/Usage 视图
3. **MCP 管理**: MCP 服务器启用/禁用、JSON 编辑、实时工具发现画布
4. **Skill 管理**: 全局/项目级 Skill 列表、启用/禁用、从 SkillHub/ModelScope 安装
5. **Plugin/Extension 管理**: Claude Marketplace 仓库 + 插件生命周期；OpenCode plugin 数组；Pi Extension (npm/git)
6. **导入导出**: 文件方式(JSON) 或 字符串方式(zlib 压缩 + 替换加密)
7. **使用统计**: Token 用量、模型分布、贡献墙热力图(持久化)、MCP 使用追踪
8. **模型后缀**: `[1m]` 后缀标记百万上下文模型，切换时自动处理
9. **Env 额外字段**: 全局基准 + 配置特定覆盖的 env 字段合并机制
10. **首次打开跳过老用户**: 非首次访问时跳过引导，直接展示功能界面
11. **清除配置按钮**: 提供一键清除已保存的配置项
12. **Pi 供应商-模型 CRUD**: 添加/删除供应商和模型，自动从 `/models` API 拉取模型列表，切换供应商自动同步默认模型

## Managed Env Fields (constants.js)

```
ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL,
ANTHROPIC_DEFAULT_HAIKU_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL,
ANTHROPIC_DEFAULT_OPUS_MODEL, CLAUDE_CODE_SUBAGENT_MODEL
```

These are explicitly managed during config switch — set, cleared, and not preserved from previous state.

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
- **Per-view CSS**: Each view has a corresponding CSS file in `src/Switch/styles/`
- **Checkbox 绿色主题**: 所有 Checkbox 统一使用绿色主题色，通过 `--td-brand-color: var(--td-success-color)` 覆盖。已用于跳过登录(`.skip-login-checkbox`)、模型1m标记(`.model-1m-checkbox`)、预设区复选框(`.preset-checkboxes`)等所有复选框场景

## UI Components Used

- Card, Button, Input, Dialog, Tag, Space, Divider, Empty, Popconfirm
- Dropdown, DropdownMenu, DropdownItem, Textarea, List, ListItem, ListItemMeta
- Statistic, Tooltip, Switch, RadioGroup, RadioButton
- Icons from `tdesign-icons-vue-next` and `@lucide/vue`

## uTools Plugin Features (plugin.json)

1. **claudeConfig** — Triggered by keyword "Claude Code配置"
2. **opencodeConfig** — Triggered by keyword "OpenCode配置"
3. **piConfig** — Triggered by keyword "Pi Agents配置"
4. **installSkill** — Triggered by URL regex matching SkillHub / ModelScope skill URLs

## Build Notes

- Vite config includes custom `bundlePreloadPlugin` that runs esbuild on `public/preload/services.js` during `closeBundle` hook
- Preload bundle target: `node18`, format: `cjs`
- Base path: `./` (relative, for uTools `file://` loading)
- Preload dependencies (`json5`, `@modelcontextprotocol/sdk`) must be in `public/preload/package.json`
