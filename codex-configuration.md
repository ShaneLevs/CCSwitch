# CC Switch - Codex Configuration Guide

## Overview

Codex (OpenAI Codex CLI) is one of the core applications supported by CC Switch. It uses a **dual-file configuration model**: `auth.json` for authentication and `config.toml` for runtime settings. CC Switch provides a complete management layer covering provider configuration, OAuth authentication, MCP server synchronization, proxy routing, and session management.

---

## 1. Configuration File Structure

Codex's native configuration lives in `~/.codex/` (customizable via `settings.codexConfigDir`):

```
~/.codex/
  auth.json          # Authentication credentials
  config.toml        # Runtime configuration (TOML format)
```

### 1.1 auth.json

Stores the API key used by Codex to authenticate with the model provider:

```json
{
  "OPENAI_API_KEY": "sk-..."
}
```

For official OpenAI providers, this may be empty (OAuth handles auth instead).

### 1.2 config.toml

The main runtime configuration file. Key fields:

```toml
model_provider = "custom"          # Active provider identifier
model = "gpt-5.4"                  # Model name to use
model_reasoning_effort = "high"    # Reasoning effort level
disable_response_storage = true    # Disable response storage for privacy
personality = "pragmatic"          # Optional: agent personality

[model_providers.custom]           # Provider definition section
name = "custom"
base_url = "https://api.example.com/v1"
wire_api = "responses"             # API protocol: "responses" or "chat"
requires_openai_auth = true        # Whether OpenAI auth is required
model_context_window = 1000000             # Optional: context window size
model_auto_compact_token_limit = 9000000   # Optional: auto-compact threshold
```

#### TOML Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `model_provider` | string | Active provider identifier, must match a key in `[model_providers.*]` |
| `model` | string | Model name (e.g., `"gpt-5.4"`, `"gpt-5.5"`) |
| `model_reasoning_effort` | string | `"low"`, `"medium"`, `"high"` |
| `disable_response_storage` | bool | Whether to disable response storage |
| `personality` | string | Optional agent personality setting |
| `wire_api` | string | `"responses"` (native OpenAI Responses API) or `"chat"` (Chat Completions) |
| `base_url` | string | Provider API endpoint URL |
| `requires_openai_auth` | bool | Whether OpenAI-style auth is required |
| `model_context_window` | int | Optional context window size in tokens |
| `model_auto_compact_token_limit` | int | Optional auto-compact token threshold |

---

## 2. Provider Configuration

### 2.1 Provider Data Model

Each Codex provider in CC Switch stores its configuration in `Provider.settingsConfig`:

```typescript
{
  auth: { OPENAI_API_KEY: "sk-..." },  // Maps to auth.json
  config: "TOML string"                 // Maps to config.toml
}
```

### 2.2 API Format (`CodexApiFormat`)

CC Switch supports two API formats for Codex providers:

| Format | Value | Description |
|--------|-------|-------------|
| OpenAI Responses API | `"openai_responses"` | Native Responses API (direct connection) |
| OpenAI Chat Completions | `"openai_chat"` | Chat Completions format (requires local routing/conversion) |

When `openai_chat` is selected, CC Switch's proxy automatically converts Responses API requests from the Codex client into Chat Completions requests for the upstream provider, and converts responses back.

### 2.3 FAST Mode (`codexFastMode`)

For ChatGPT Plus/Pro OAuth providers, an optional FAST mode can be enabled. This injects `service_tier="priority"` into Codex requests for lower latency. Can be toggled off if the ChatGPT Codex backend rejects the parameter.

### 2.4 Provider Presets

CC Switch includes 25+ built-in Codex provider presets organized by category:

| Category | Providers |
|----------|-----------|
| **Official** | OpenAI Official, Azure OpenAI |
| **Aggregator** | Shengsuanyun, AiHubMix, DMXAPI, Compshare, OpenRouter, TheRouter, PIPELLM, RunAPI |
| **Third Party** | PatewayAI, PackyCode, ClaudeCN, Cubence, AIGoCode, RightCode, AICodeMirror, AICoding, CrazyRouter, SSSAiCode, Micu, CTok.ai, E-FlowCode, LemonData, RelaxyCode |
| **Custom** | User-created custom providers |

Each preset defines:
- `name` / `nameKey` — Display name (with optional i18n key)
- `websiteUrl` — Provider website
- `apiKeyUrl` — Direct link to get API keys
- `auth` — Default auth.json content
- `config` — Default config.toml content
- `isOfficial` / `isPartner` — Provider classification
- `category` — Provider category
- `endpointCandidates` — Array of base URLs for speed testing
- `theme` — Visual theme (background color, text color, icon)
- `icon` / `iconColor` — Provider icon configuration
- `apiFormat` — Optional API format override

### 2.5 Custom Provider Template

When creating a custom provider, the default template is:

```toml
model_provider = "custom"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
```

Auth defaults to `{ OPENAI_API_KEY: "" }`.

### 2.6 Common Config Snippet

CC Switch supports a **shared TOML configuration snippet** that can be applied across all Codex providers:

- **Storage**: Backed by `config.json` via `configApi.getCommonConfigSnippet("codex")`
- **Default**: `"# Common Codex config\n# Add your common TOML configuration here"`
- **Toggle**: A "Write Common Config" checkbox injects/removes the snippet from each provider's TOML
- **Extract**: Can extract common portions from an existing provider's TOML
- **Edit**: Full-screen modal editor with TOML syntax validation
- **Legacy migration**: Automatically migrates from localStorage key `cc-switch:codex-common-config-snippet`

---

## 3. Frontend UI Components

### 3.1 CodexFormFields (`src/components/providers/forms/CodexFormFields.tsx`)

The main form for editing a Codex provider's connection settings:

- **API Key** — Text input rendered via shared `ApiKeySection` component. Supports official providers (no key needed) vs third-party providers. Shows partner-specific links when applicable.
- **Base URL** — Endpoint field with "full URL" toggle. When full URL is enabled, the proxy uses the URL as-is without path appending. Includes endpoint management modal and custom endpoints callback.
- **API Format** — Dropdown with two options:
  - `openai_responses` — "OpenAI Responses API (native)"
  - `openai_chat` — "OpenAI Chat Completions (requires local routing)"
  - Hint explains that Chat Completions will be auto-converted to Responses format via local routing.
- **Model Name** — Text input with "Fetch Models" button. Calls `fetchModelsForConfig(baseURL, apiKey, isFullUrl)` to discover available models. Placeholder: "e.g. gpt-5.4". Leaving blank uses the provider's default model.
- **Endpoint Speed Test** — Modal for testing endpoint latency with auto-select.

### 3.2 CodexConfigSections (`src/components/providers/forms/CodexConfigSections.tsx`)

Two sub-sections for advanced raw configuration editing:

- **CodexAuthSection** — JSON editor for `auth.json` content. Auto-detects dark mode via `MutationObserver`.
- **CodexConfigSection** — TOML editor for `config.toml` (uses `language="javascript"` as TOML approximation). Includes:
  - "Write Common Config" checkbox toggle
  - "Edit Common Config" link to open the common config modal
  - Commented-out 1M context window toggle UI (hidden because the model no longer supports it; restoration instructions in comments)

### 3.3 CodexCommonConfigModal (`src/components/providers/forms/CodexCommonConfigModal.tsx`)

Full-screen modal for editing the shared TOML configuration snippet:

- `FullScreenPanel` with `JsonEditor` (16 rows)
- Blue info box with usage guide
- Empty state with `Package` icon when no content exists
- Footer buttons: "Extract from current", Cancel, Save

### 3.4 CodexOAuthSection (`src/components/providers/forms/CodexOAuthSection.tsx`)

Complete OAuth authentication UI for ChatGPT Plus/Pro accounts:

- **Auth status badge** — Shows "N accounts" (green) or "Not authenticated"
- **Account selector** — Dropdown listing all logged-in accounts by login name, with "Use default account" option
- **FAST mode toggle** — Switch that injects `service_tier="priority"` for lower latency
- **Account list** — Each account shows username, Default badge, Selected badge, Set as default button, remove button
- **Login flow** — "Login with ChatGPT" button triggers OpenAI Device Code flow. Displays user code in large monospace font with copy button, verification URI link, and cancel button
- **Error state** — Error message with Retry and Cancel buttons
- **Logout all** — Shown when 2+ accounts exist
- **Multi-account support** — "Add another account" button for additional ChatGPT accounts

### 3.5 CodexOauthQuotaFooter (`src/components/CodexOauthQuotaFooter.tsx`)

Subscription quota display footer:

- Uses `useCodexOauthQuota(meta, { enabled: true, autoQuery: isCurrent })` to fetch quota data
- Renders via shared `SubscriptionQuotaView` component
- Auto-queries only when the provider is currently active
- Shows usage, remaining quota, and plan details

---

## 4. State Management Hooks

### 4.1 useCodexConfigState (`src/components/providers/forms/hooks/useCodexConfigState.ts`)

Core state management hook for the dual-file Codex config model.

**State managed:**
- `codexAuth` — JSON string for auth.json
- `codexConfig` — TOML string for config.toml
- `codexApiKey` — Extracted from `auth.OPENAI_API_KEY`
- `codexBaseUrl` — Extracted from TOML via `extractCodexBaseUrl()`
- `codexModelName` — Extracted from TOML via `extractCodexModelName()`
- `codexAuthError` — JSON validation error

**Key behaviors:**
- **Initialization**: Parses `initialData.settingsConfig` as `{ auth: {...}, config: "..." }`. Extracts API key from `auth.OPENAI_API_KEY`, base URL and model name from the TOML.
- **Bidirectional sync**: When `codexConfig` changes (TOML edited directly), base URL and model name are re-extracted. Refs (`isUpdatingCodexBaseUrlRef`, `isUpdatingCodexModelNameRef`) prevent infinite update loops.
- **`handleCodexApiKeyChange`**: Updates API key and writes it back into auth JSON's `OPENAI_API_KEY` field.
- **`handleCodexBaseUrlChange`**: Updates base URL and injects it into TOML via `setCodexBaseUrlInConfig()`.
- **`handleCodexModelNameChange`**: Updates model name and injects it into TOML via `setCodexModelNameInConfig()`.
- **`handleCodexConfigChange`**: Normalizes TOML text (fixes Chinese/full-width/curly quotes), updates config, and re-syncs extracted values.
- **`resetCodexConfig`**: Complete reset for preset switching — sets auth, config, and re-extracts all derived values.
- **Auth validation**: Checks JSON parses to a non-array object.

### 4.2 useCodexCommonConfig (`src/components/providers/forms/hooks/useCodexCommonConfig.ts`)

Manages the shared TOML configuration snippet:

- **Storage**: Loads from `configApi.getCommonConfigSnippet("codex")`. Falls back to localStorage for legacy migration.
- **Edit mode initialization**: Uses `hasTomlCommonConfigSnippet()` to detect whether the current provider's TOML already contains the common snippet. If should be enabled but not present, auto-injects.
- **New mode initialization**: If snippet has parseable content, auto-enables for new providers.
- **Toggle handler**: Validates TOML, then calls `updateTomlCommonConfigSnippet()` to inject/remove.
- **Snippet change handler**: When snippet is edited and currently active, removes old snippet and inserts new one. Saves to backend.
- **Extract handler**: Calls `configApi.extractCommonConfigSnippet("codex", { settingsConfig })` to extract common portions from current provider's TOML.
- **Sync detection**: Monitors `codexConfig` changes and updates `useCommonConfig` based on whether the snippet is present, using ref to avoid circular updates.

### 4.3 useCodexTomlValidation (`src/components/providers/forms/hooks/useCodexTomlValidation.ts`)

Real-time TOML syntax validation:

- Uses `smol-toml` library for parsing
- Empty strings are treated as valid
- Provides both immediate `validateToml(text)` and debounced `debouncedValidate(text)` (500ms delay)
- Returns: `{ configError, validateToml, debouncedValidate, clearError }`
- Cleans up debounce timer on unmount

### 4.4 useCodexOauth (`src/components/providers/forms/hooks/useCodexOauth.ts`)

Thin wrapper around `useManagedAuth("codex_oauth")`:

Returns all managed auth capabilities scoped to the `"codex_oauth"` provider:
- `accounts`, `defaultAccountId`, `hasAnyAccount`
- `pollingState`, `deviceCode`, `error`
- `isPolling`, `isAddingAccount`, `isRemovingAccount`, `isSettingDefaultAccount`
- `addAccount`, `removeAccount`, `setDefaultAccount`, `cancelAuth`, `logout`

---

## 5. Type Definitions

### 5.1 Core Types (`src/types.ts`)

```typescript
// API format for Codex providers
type CodexApiFormat = "openai_responses" | "openai_chat";

// Model configuration for Universal Providers
interface CodexModelConfig {
  model?: string;
  reasoningEffort?: string;
}

// Provider metadata (on ProviderMeta)
codexFastMode?: boolean;  // Injects service_tier="priority" for lower latency
apiFormat?: "anthropic" | "openai_chat" | "openai_responses" | "gemini_native";

// Provider config (on Provider)
settingsConfig: Record<string, any>;  // Codex: { auth, config }

// App visibility (on VisibleApps, McpApps, UniversalProviderApps)
codex: boolean;

// Settings
codexConfigDir?: string;          // Override Codex config directory
currentProviderCodex?: string;    // Currently active Codex provider ID
```

### 5.2 Constants (`src/config/constants.ts`)

```typescript
const PROVIDER_TYPES = {
  GITHUB_COPILOT: "github_copilot",
  CODEX_OAUTH: "codex_oauth",
} as const;

const TEMPLATE_TYPES = {
  CUSTOM: "custom",
  GENERAL: "general",
  NEW_API: "newapi",
  GITHUB_COPILOT: "github_copilot",
  TOKEN_PLAN: "token_plan",
  BALANCE: "balance",
} as const;
```

---

## 6. Backend Implementation

### 6.1 Config File Management (`src-tauri/src/codex_config.rs`)

Rust backend module for reading/writing Codex configuration files.

**Constants:**
- `CC_SWITCH_CODEX_MODEL_PROVIDER_ID = "ccswitch"` — The provider ID CC Switch injects into Codex's model-provider catalog
- `CODEX_RESERVED_MODEL_PROVIDER_IDS` — `"amazon-bedrock"`, `"openai"`, `"ollama"`, `"lmstudio"`, `"oss"`, `"ollama-chat"` (cannot be overwritten)

**Key functions:**
- `get_codex_config_dir()` — Returns `~/.codex` or custom override from settings
- `get_codex_auth_path()` — Returns `~/.codex/auth.json`
- `get_codex_config_path()` — Returns `~/.codex/config.toml`
- `get_codex_provider_paths(provider_id, provider_name)` — Returns per-provider paths: `auth-{sanitized-name}.json` and `config-{sanitized-name}.toml`
- `delete_codex_provider_config(provider_id, provider_name)` — Deletes per-provider auth/config files
- `write_codex_live_atomic(auth, config_text_opt)` — Atomically writes auth.json and config.toml with rollback support if the second write fails

### 6.2 MCP Server Synchronization (`src-tauri/src/mcp/codex.rs`)

Bidirectional MCP server synchronization between CC Switch's unified config and Codex's `config.toml`.

**Codex MCP TOML format:**
```toml
[mcp_servers.my-server]
type = "stdio"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
env = { KEY = "value" }
cwd = "/working/dir"

[mcp_servers.my-http-server]
type = "http"
url = "https://example.com/mcp"
http_headers = { Authorization = "Bearer token" }
```

**Key functions:**

| Function | Description |
|----------|-------------|
| `import_from_codex(config)` | Reads `~/.codex/config.toml`, parses MCP entries from both `[mcp_servers.*]` (correct) and `[mcp.servers.*]` (legacy). Extracts type, command, args, env, cwd, url, headers, and extended fields. Creates/updates unified config entries. |
| `sync_enabled_to_codex(config)` | Writes enabled MCP servers back to `config.toml` under `[mcp_servers]`. Cleans up erroneous `[mcp.servers]` sections. Uses `toml_edit` to preserve comments/formatting. Removes the table entirely if no servers are enabled. |
| `sync_single_server_to_codex(config, id, spec)` | Syncs one MCP server to Codex config. Tolerates parse failures. |
| `remove_server_from_codex(id)` | Removes one MCP server from both `[mcp_servers]` and `[mcp.servers]`. |

**Extended field whitelist:** `timeout`, `shell`, `encoding`, `restart_on_exit`, `verify_ssl`, `proxy`, and others are auto-converted.

**Helper functions:**
- `json_value_to_toml_item()` — Generic JSON-to-TOML conversion (string, number, bool, array, shallow object)
- `json_server_to_toml_table()` — Structured MCP server spec conversion

### 6.3 OAuth Commands (`src-tauri/src/commands/codex_oauth.rs`)

Tauri commands for Codex OAuth authentication:

| Command | Description |
|---------|-------------|
| `get_codex_oauth_quota(account_id?)` | Queries subscription quota. Resolves account: explicit ID > default > not_found. Gets auto-refreshed access token from `CodexOAuthManager`. |
| `get_codex_oauth_models(account_id?)` | Fetches available models from Codex backend via `chatgpt.com/backend-api/codex/*` (not standard `/v1/models`). |

**State:** `CodexOAuthState` wraps `Arc<RwLock<CodexOAuthManager>>`.

Most auth commands (login, logout, list accounts, etc.) are exposed via the generic `commands::auth` module.

### 6.4 Proxy Routing (`src-tauri/src/proxy/providers/codex.rs`)

Proxy adapter that intercepts and routes Codex client requests.

**Client detection:** Detects official Codex clients via User-Agent regex: `^(codex_vscode|codex_cli_rs)/[\d.]+`

**Wire API detection (`codex_provider_uses_chat_completions`):**

Checks (in priority order):
1. `provider.meta.api_format`
2. `provider.settings_config["api_format"]` or `["apiFormat"]`
3. TOML `wire_api` field from `model_providers.<active_provider>.wire_api` or top-level `wire_api`
4. Base URL ending in `/chat/completions`

**Wire API values recognized as Chat Completions:**
`"chat"`, `"chat_completions"`, `"chat-completions"`, `"openai_chat"`, `"openai-chat"`, `"openai_chat_completions"`

**Conversion trigger (`should_convert_codex_responses_to_chat`):**

Returns `true` when:
- Codex client sends a Responses API request (`/responses`, `/v1/responses`, `/responses/compact`, `/v1/responses/compact`)
- AND the upstream provider uses Chat Completions

This triggers automatic local conversion: Responses API → Chat Completions (request) and Chat Completions → Responses API (response).

**TOML extraction helpers:**
- `extract_codex_wire_api_from_toml(config_text)` — Parses TOML to extract `wire_api` from active provider
- `extract_codex_base_url_from_toml(config_text)` — Parses TOML to extract `base_url` from active provider

---

## 7. Skills & MCP Support

Codex is included in both `SKILLS_APP_IDS` and `MCP_APP_IDS`, meaning it supports:
- **Skills** — Can be individually enabled/disabled per app via `skillsApi.toggleApp()`
- **MCP Servers** — Full bidirectional synchronization with Codex's native format

---

## 8. Environment Variable Handling

- Codex is one of three apps (`"claude"`, `"codex"`, `"gemini"`) for environment variable conflict checking
- `checkAllEnvConflicts()` checks env conflicts across all three apps
- Codex API key is read from env var `CODEX_API_KEY`

---

## 9. Session Management

CC Switch tracks Codex session usage via `src-tauri/src/services/session_usage_codex.rs`. The `CodexOauthQuotaFooter` component displays subscription quota information including usage, remaining quota, and plan details.

---

## 10. Data Flow Summary

### Editing a Codex Provider

```
User edits form field
    → CodexFormFields (UI)
    → useCodexConfigState (state management)
        → Updates local React state
        → Syncs bidirectionally between form fields and TOML
        → Normalizes text (fixes Chinese/full-width/curly quotes)
    → onSettingsConfigChange (triggers Tauri IPC)
    → codex_config.rs (atomic file write to ~/.codex/)
```

### MCP Server Sync

```
User toggles MCP server for Codex
    → CC Switch unified config updated
    → mcp/codex.rs::sync_single_server_to_codex()
    → Converts unified format → Codex TOML format
    → Writes to ~/.codex/config.toml via toml_edit (preserves comments)
```

### Proxy Request Flow

```
Codex CLI/VSCode sends request
    → CC Switch proxy intercepts (User-Agent detection)
    → codex_provider_uses_chat_completions() checks API format
    → If Responses API + Chat Completions upstream:
        → Convert request format
        → Forward to upstream
        → Convert response format back
    → If Responses API + Responses API upstream:
        → Forward directly
    → Return response to Codex client
```

### OAuth Authentication Flow

```
User clicks "Login with ChatGPT"
    → useCodexOauth.addAccount()
    → OpenAI Device Code flow initiated
    → User code + verification URI displayed
    → User authorizes in browser
    → Polling completes → access token stored
    → Token used for quota queries and model fetching
    → FAST mode optionally injects service_tier="priority"
```
