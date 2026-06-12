# OpenCode App Switching Feature Design

## Overview

Add multi-app support to CC Switch, allowing users to toggle between "Claude Code" and "Open Code" modes. When switched to Open Code, the UI renders OpenCode-specific views for Provider config, MCP, and Skill management, reading/writing directly to `~/.config/opencode/opencode.json`.

## Requirements

- **App Selector**: Dropdown between "Claude Code" and the page title suffix, switching the entire page context
- **Open Code Config View**: Provider + Model management for opencode.json
- **Open Code MCP View**: MCP management with local/remote format
- **Open Code Skill View**: Plugin/skill configuration management
- **Usage tab hidden** when Open Code is active
- **Import/Export** follows Claude Code pattern (compress/decompress)
- **Preset providers**: A few common presets (DeepSeek, OpenRouter, Anthropic, Google, AWS Bedrock)
- **Reusable components** extracted from existing code

## Architecture

```
index.vue
├── activeApp: ref<'claude' | 'opencode'>
├── AppSelector (Dropdown component)
├── Tab buttons (conditional on activeApp)
├── Claude Code views (existing, unchanged)
│   ├── ConfigView
│   ├── McpView
│   ├── SkillView
│   └── UsageView
└── Open Code views (new)
    ├── OpenCodeConfigView
    ├── OpenCodeMcpView
    └── OpenCodeSkillView
```

## Component Details

### 1. AppSelector

- **Location**: In `index.vue` header, between logo/title and tab buttons
- **Component**: TDesign `Dropdown` with `DropdownMenu` / `DropdownItem`
- **Display**: Current app name as trigger button, with ChevronDownIcon
- **Options**: "Claude Code", "Open Code"
- **Behavior**: On switch, reset `activeTab` to `'config'`

### 2. OpenCodeConfigView

**Data source**: `opencode.json` → `provider` section

**Layout**:
- Section header: link to open opencode.json, export/import buttons, "New Provider" button
- Provider list: Cards grouped/stacked, each showing:
  - Provider ID, npm package tag, baseURL (masked), model count
  - Edit / Delete buttons, "Active" indicator if currently in use
- Current provider summary card (reads active provider from config)

**Create/Edit Dialog**:
- **NPM Package selector**: Dropdown with 5 options (openai, openai-compatible, anthropic, amazon-bedrock, google)
- **Provider ID**: Text input (unique key in provider map)
- **Base URL**: Text input
- **API Key**: Password input with visibility toggle
- **Extra Options**: Dynamic KV editor (for headers, setCacheKey, timeout, etc.)
- **Models**: Dynamic list, each with:
  - Model ID input
  - Display name input
  - Context limit / Output limit inputs
  - Model options (dynamic KV)
  - Extra fields (dynamic KV for variants, modalities, cost, etc.)
  - Remove button
- "Add Model" button
- Preset quick-fill button (select from built-in presets)

**Provider Presets** (built-in, limited set):

| Preset | NPM | Base URL |
|--------|-----|----------|
| DeepSeek | @ai-sdk/openai-compatible | https://api.deepseek.com/v1 |
| OpenRouter | @ai-sdk/openai-compatible | https://openrouter.ai/api/v1 |
| Anthropic | @ai-sdk/anthropic | https://api.anthropic.com/v1 |
| Google Gemini | @ai-sdk/google | https://generativelanguage.googleapis.com/v1beta |
| AWS Bedrock | @ai-sdk/amazon-bedrock | — |

**Switch logic**: Writes the selected provider's config into opencode.json. The "active" concept maps to which provider is listed in the config file (OpenCode reads all providers from the file; the first/default one is used).

**Import/Export**: Compress all providers to base64 string (reuse zlib), or export as JSON file.

### 3. OpenCodeMcpView

**Data source**: `opencode.json` → `mcp` section

**Layout**:
- Section header: link to opencode.json, "Add MCP" button
- MCP server list: Cards showing:
  - Server ID, type tag (LOCAL/REMOTE), enabled status
  - Config summary (command or URL)
  - Switch toggle, view tools, edit, delete buttons

**Create/Edit Dialog**:
- Server ID input
- Type selector: LOCAL / REMOTE
- LOCAL fields: Command (merged array input), Environment (dynamic KV)
- REMOTE fields: URL input, Headers (dynamic KV)
- Enabled checkbox

**Format mapping** (OpenCode native):
```json
{
  "type": "local",
  "command": ["npx", "-y", "package-name"],
  "environment": { "KEY": "value" },
  "enabled": true
}
```

**Tool discovery**: Reuse existing MCP SDK connection logic. For `local` type, construct `{ type: "stdio", command: cmd[0], args: cmd.slice(1), env: environment }` for the SDK.

### 4. OpenCodeSkillView

**Data source**: `opencode.json` → `plugin` section (array of plugin names)

**Layout**:
- Plugin list: Simple card list showing:
  - Plugin name
  - Enabled/disabled toggle
  - Remove button
- "Add Plugin" button (text input for plugin name)

**Behavior**:
- Plugin array is managed as a simple list of strings
- Toggling off removes from the array; toggling on adds back
- No install/download functionality

## Backend: preload/services/opencode.js

New module for all OpenCode file I/O:

**Path**: `~/.config/opencode/opencode.json` (JSON5 format)

**Functions**:
```
readOpencodeConfig()          → parsed JSON5 object or default
writeOpencodeConfig(config)   → writes to file
getOpencodeConfigPath()       → returns file path string
getOpencodeProviders()        → returns provider section
setOpencodeProvider(id, cfg)  → upsert provider
removeOpencodeProvider(id)    → delete provider
getOpencodeMcpServers()       → returns mcp section
setOpencodeMcpServer(id, cfg) → upsert mcp server
removeMcpServer(id)           → delete mcp server
getOpencodePlugins()          → returns plugin array
setOpencodePlugins(plugins)   → writes plugin array
```

**JSON5 parsing**: Use `json5` npm package for reading, `JSON.stringify` for writing (valid JSON5 is valid JSON).

## Reusable Components

Extract from existing code into `src/components/`:

### DynamicKvEditor
- Props: `modelValue` (array of {key, value}), `keyOptions` (autocomplete suggestions), `readonly` (boolean)
- Events: `update:modelValue`
- Used by: ConfigView extraFields, OpenCodeConfigView extraOptions/modelOptions, OpenCodeMcpView environment/headers

### JsonEditorDialog
- Props: `visible`, `title`, `jsonContent`, `readonly`
- Events: `update:visible`, `confirm` (with parsed JSON)
- Used by: McpView, OpenCodeMcpView

### ApiKeyInput
- Props: `modelValue`, `placeholder`
- Events: `update:modelValue`
- Password input with toggle visibility, mask display
- Used by: ConfigView, OpenCodeConfigView

## CSS / Theming

- OpenCode views use the same TDesign CSS variables as existing views
- New CSS files: `OpenCodeConfigView.css`, `OpenCodeMcpView.css`, `OpenCodeSkillView.css`
- Follow existing dark mode patterns with `:root[theme-mode="dark"]`

## Data Flow

### Editing an OpenCode Provider
```
User edits form → OpenCodeConfigView
  → readOpencodeConfig() → modify provider section → writeOpencodeConfig()
```

### MCP Server Toggle
```
User toggles MCP → OpenCodeMcpView
  → readOpencodeConfig() → modify mcp[id].enabled → writeOpencodeConfig()
```

### Plugin Toggle
```
User toggles plugin → OpenCodeSkillView
  → readOpencodeConfig() → modify plugin array → writeOpencodeConfig()
```

## File Changes Summary

### New files:
- `src/components/DynamicKvEditor.vue`
- `src/components/JsonEditorDialog.vue`
- `src/components/ApiKeyInput.vue`
- `src/Switch/OpenCodeConfigView.vue`
- `src/Switch/OpenCodeMcpView.vue`
- `src/Switch/OpenCodeSkillView.css`
- `src/Switch/styles/OpenCodeConfigView.css`
- `src/Switch/styles/OpenCodeMcpView.css`
- `src/Switch/styles/OpenCodeSkillView.css`
- `public/preload/services/opencode.js`
- `src/composables/useAppContext.js`

### Modified files:
- `src/Switch/index.vue` — Add AppSelector, conditional rendering
- `public/preload/services.js` — Import and expose opencode module
- `public/preload/package.json` — Add `json5` dependency
- `src/Switch/ConfigView.vue` — Refactor to use extracted components
- `src/Switch/McpView.vue` — Refactor to use extracted components
