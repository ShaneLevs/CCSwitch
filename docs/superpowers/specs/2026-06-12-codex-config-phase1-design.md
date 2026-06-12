# Codex Configuration Support - Phase 1 Design

## Overview

Add Codex (OpenAI Codex CLI) as a first-class supported application in CC Switch, on par with Claude Code and Open Code. Phase 1 covers: Provider switching with API Key/Base URL/Model management, Provider presets (built-in + models.dev), and Fetch Models.

Codex uses a **dual-file configuration model**: `auth.json` for authentication and `config.toml` for runtime settings. This is fundamentally different from OpenCode's single-file JSON5 model, so we implement an independent view (方案 A).

---

## 1. Configuration File Structure

Codex's native configuration lives in `~/.codex/`:

```
~/.codex/
  auth.json          # { "OPENAI_API_KEY": "sk-..." }
  config.toml        # Runtime configuration (TOML format)
```

### 1.1 config.toml Key Fields

```toml
model_provider = "custom"          # Active provider identifier
model = "gpt-5.4"                  # Model name to use
model_reasoning_effort = "high"    # low / medium / high
disable_response_storage = true    # Privacy toggle

[model_providers.custom]           # Provider definition
name = "custom"
base_url = "https://api.example.com/v1"
wire_api = "responses"             # responses | chat
requires_openai_auth = true
model_context_window = 1000000     # Optional
model_auto_compact_token_limit = 9000000  # Optional
```

---

## 2. Data Model

### 2.1 Provider in CC Switch

Each Codex provider stores its full configuration as a pair of strings:

```typescript
interface CodexProvider {
  id: string;                        // Provider unique ID
  auth: { OPENAI_API_KEY: string };  // → writes to auth.json
  config: string;                    // → writes to config.toml (raw TOML string)
}
```

Storage: `window.services.getCodexProviders()` returns `Record<string, { auth, config }>`. Persisted via uTools DB (keyed by `ccswitch_codex_provider_<id>`), similar to how Claude Code providers are stored. The `~/.codex/` directory only ever contains the **currently active** provider's files — all other provider configs live only in the DB.

### 2.2 Current Active Provider

The "current" provider is determined by which one was last activated via the "切换" button. Track in uTools DB: `ccswitch_codex_current_provider`.

When a provider is activated:
1. Write its `auth` to `~/.codex/auth.json`
2. Write its `config` to `~/.codex/config.toml`

---

## 3. Backend Service (`public/preload/services/codex.js`)

### 3.1 File I/O Functions

| Function | Description |
|----------|-------------|
| `readCodexAuth()` | Read `~/.codex/auth.json`, return parsed object or default `{ OPENAI_API_KEY: "" }` |
| `writeCodexAuth(auth)` | Write object to `~/.codex/auth.json` |
| `readCodexConfig()` | Read `~/.codex/config.toml`, return raw string or default template |
| `writeCodexConfig(configText)` | Write string to `~/.codex/config.toml` |

### 3.2 TOML Field Extraction (line-level regex)

| Function | Description |
|----------|-------------|
| `extractCodexBaseUrl(tomlText)` | Extract `base_url` from `[model_providers.<active>]` section |
| `extractCodexModelName(tomlText)` | Extract top-level `model` value |
| `extractCodexWireApi(tomlText)` | Extract `wire_api` from provider section |
| `extractCodexReasoningEffort(tomlText)` | Extract `model_reasoning_effort` value |
| `extractCodexProviderName(tomlText)` | Extract `name` from provider section |
| `setCodexBaseUrlInConfig(tomlText, url)` | Replace `base_url` value in TOML |
| `setCodexModelNameInConfig(tomlText, model)` | Replace `model` value in TOML |
| `setCodexWireApiInConfig(tomlText, wireApi)` | Replace `wire_api` value in TOML |
| `setCodexReasoningEffortInConfig(tomlText, effort)` | Replace `model_reasoning_effort` value |

All TOML extraction uses line-level string processing (regex on known key patterns), not a full TOML parser. This avoids adding a dependency and is sufficient for the known field set.

### 3.3 Network Functions

| Function | Description |
|----------|-------------|
| `fetchModelsForCodex(baseUrl, apiKey)` | GET `baseUrl/v1/models` with Bearer auth, return model ID array |

### 3.4 Provider CRUD Functions

| Function | Description |
|----------|-------------|
| `getCodexProviders()` | Get all saved providers from uTools DB |
| `setCodexProvider(id, providerData)` | Save/create a provider |
| `removeCodexProvider(id)` | Delete a provider |
| `getCodexCurrentProvider()` | Get currently active provider ID |
| `setCodexCurrentProvider(id)` | Set active provider and write files to disk |

---

## 4. UI Component: `CodexConfigView.vue`

### 4.1 Main View Layout

Card grid layout, same style as OpenCodeConfigView:

```
┌──────────────────────────────────────────────┐
│  [+ 新建] [预设] [导入] [导出]    [打开配置目录] │
├──────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│ │ Provider │ │ Provider │ │ Provider │      │
│ │  Card    │ │  Card    │ │  Card    │      │
│ │ name     │ │ name     │ │ name     │      │
│ │ model    │ │ model    │ │ model    │      │
│ │ wire_api │ │ wire_api │ │ wire_api │      │
│ │ [切换][✏][🗑]│ │ [切换][✏][🗑]│ │ [切换][✏][🗑]│ │
│ └──────────┘ └──────────┘ └──────────┘      │
└──────────────────────────────────────────────┘
```

### 4.2 Provider Card

Each card displays:
- **Provider name** (from TOML `name` field or fallback to ID)
- **Model name** (from `model` field)
- **Base URL** (truncated)
- **wire_api tag** — colored tag: `responses` (blue) / `chat` (orange)
- **Active indicator** — border highlight or badge for the currently active provider
- **Action buttons**: 切换 (activate), 编辑 (edit dialog), 删除 (confirm + delete)

### 4.3 Edit/Create Dialog

Structured form at top, raw TOML/auth editors at bottom (collapsible):

**Top section (structured form fields):**
- **Provider ID** — text input (disabled in edit mode)
- **API Key** — ApiKeyInput component
- **Base URL** — text input
- **Model** — dropdown (populated by Fetch Models) + text input fallback + "Fetch Models" button
- **API Format** — dropdown: `responses` / `chat`
- **Reasoning Effort** — dropdown: `low` / `medium` / `high`

**Bottom section (collapsible raw editors):**
- **TOML Editor** — textarea showing full `config.toml` content. Edits here sync back to form fields above.
- **Auth JSON Editor** — textarea showing `auth.json` content.

**Bidirectional sync:**
- Changing form fields (API Key, Base URL, Model, API Format, Reasoning) → updates the TOML string and auth JSON in the raw editors
- Editing raw TOML directly → re-extracts fields back into the form fields above
- Use refs to prevent infinite update loops (same pattern as OpenCode's `isUpdatingRef`)

### 4.4 Preset Dialog

Two-level dialog:

1. **Preset list dialog** — search filter, shows:
   - Built-in presets (grouped by category: official / aggregator / third_party / custom)
   - models.dev dynamic presets (fetched on demand, shown under "更多" section)
2. **On preset select** — directly fills the form with the preset's `auth` and `config` templates. No second model-selection dialog needed (unlike OpenCode, Codex has one model per provider config).

### 4.5 Fetch Models

"Fetch Models" button next to the Model input:
1. Reads `baseURL` and `apiKey` from the form
2. Calls `window.services.fetchModelsForCodex(baseUrl, apiKey)`
3. Populates a dropdown of available model IDs
4. User selects one → fills the Model input field → syncs to TOML

### 4.6 Import/Export

- **Export**: `window.services.compressConfigs(providerList)` → copy to clipboard
- **Import**: paste compressed string → `window.services.decompressConfigs()` → batch `setCodexProvider()`. If provider ID already exists, overwrite entirely (not merge — Codex TOML is monolithic).

---

## 5. Built-in Presets

Core presets hardcoded in the component:

| Category | Presets |
|----------|---------|
| **official** | OpenAI Official, Azure OpenAI |
| **aggregator** | OpenRouter, AiHubMix, DMXAPI, TheRouter, PIPELLM, RunAPI |
| **third_party** | PackyCode, ClaudeCN, Cubence, AIGoCode, RightCode, AICodeMirror |
| **custom** | Custom (blank template) |

Each preset:
```js
{
  id: "openai-official",
  name: "OpenAI 官方",
  category: "official",
  auth: { OPENAI_API_KEY: "" },
  config: `model_provider = "openai"\nmodel = "gpt-5.4"\n...`,
  icon: "🤖",
  websiteUrl: "https://platform.openai.com",
  apiKeyUrl: "https://platform.openai.com/api-keys",
}
```

### Custom Template

Default blank provider:
```toml
model_provider = "custom"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "custom"
base_url = ""
wire_api = "responses"
requires_openai_auth = true
```

Auth: `{ OPENAI_API_KEY: "" }`

---

## 6. Application Integration

### 6.1 useAppContext

Add `isCodex` computed: `activeApp.value === 'codex'`

### 6.2 index.vue

- `appDropdownOptions` adds `{ content: 'Codex', value: 'codex' }`
- `appLabel` handles `'codex'` → `'Codex'`
- Logo: use `logo-codex.png` when `isCodex`
- Tab area: Codex shows only "配置管理" (same as Open Code for now)
- View: `<CodexConfigView v-if="isCodex" />`

### 6.3 services.js

Add `const codex = require('./services/codex')` and expose all codex functions to `window.services`.

---

## 7. File List

| File | Action | Description |
|------|--------|-------------|
| `public/preload/services/codex.js` | Create | Backend service for Codex config I/O |
| `public/preload/services.js` | Modify | Expose codex service functions |
| `src/Switch/CodexConfigView.vue` | Create | Main Codex config management view |
| `src/Switch/styles/CodexConfigView.css` | Create | Styles for CodexConfigView |
| `src/Switch/index.vue` | Modify | Add Codex app option, logo, tab, view |
| `src/composables/useAppContext.js` | Modify | Add `isCodex` computed |
| `public/icon-codex.png` | Create | Codex app icon (for header logo) |

---

## 8. Out of Scope (Phase 2+)

- Common Config Snippet
- MCP server synchronization
- TOML syntax validation
- OAuth / FAST Mode
- Proxy routing (Responses ↔ Chat conversion)
- Session management
- Custom config directory (`codexConfigDir`)
