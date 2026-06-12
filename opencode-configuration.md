# CC Switch - OpenCode Configuration Guide

## Overview

OpenCode is a first-class supported application in CC Switch, on par with Claude, Codex, Gemini, and Hermes. It uses a **JSON-based configuration model** with `opencode.json` as the single config file. CC Switch provides comprehensive management covering provider configuration with multiple AI SDK backends, bidirectional MCP synchronization, session management across legacy JSON and modern SQLite storage, and plugin management with mutual exclusion logic.

---

## 1. Configuration File Structure

OpenCode's native configuration lives in `~/.config/opencode/` (customizable via `settings.opencodeConfigDir`):

```
~/.config/opencode/
  opencode.json      # Main configuration file (JSON5 format)
  .env               # Environment variables (defined but not yet actively used)
```

Session data is stored separately at `$XDG_DATA_HOME/opencode/` (defaults to `~/.local/share/opencode/`):

```
~/.local/share/opencode/
  storage/           # Legacy JSON flat-file session storage
    session/
    message/
    part/
  opencode.db        # Modern SQLite session database
```

### 1.1 opencode.json Structure

The main config file contains three top-level sections:

```json5
{
  "provider": {
    "provider-id": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Provider Name",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "sk-...",
        "setCacheKey": true
      },
      "models": {
        "model-id": {
          "name": "Model Display Name",
          "limit": { "context": 200000, "output": 64000 },
          "options": {},
          "variants": {},
          "modalities": { "input": ["text"], "output": ["text"] }
        }
      }
    }
  },
  "mcp": {
    "server-id": {
      "type": "local",
      "command": ["npx", "-y", "package-name"],
      "environment": { "KEY": "value" },
      "enabled": true
    }
  },
  "plugin": ["oh-my-openagent"]
}
```

---

## 2. Provider Configuration

### 2.1 Provider Data Model

Each OpenCode provider stores its configuration in `Provider.settingsConfig` as a JSON object:

```typescript
interface OpenCodeProviderConfig {
  npm: string;                          // AI SDK package name
  name?: string;                        // Provider display name
  options: OpenCodeProviderOptions;      // Provider-level options
  models: Record<string, OpenCodeModel>; // Model definitions
}
```

### 2.2 AI SDK Packages (NPM)

OpenCode supports 5 AI SDK backends, each providing different capabilities:

| NPM Package | Description | Use Case |
|-------------|-------------|----------|
| `@ai-sdk/openai` | OpenAI Responses API | Native OpenAI models (GPT-5.x series) |
| `@ai-sdk/openai-compatible` | OpenAI Compatible | Any provider with OpenAI-compatible API (most third-party providers) |
| `@ai-sdk/anthropic` | Anthropic SDK | Claude models (Opus, Sonnet, Haiku) |
| `@ai-sdk/amazon-bedrock` | AWS Bedrock SDK | Cloud-hosted models (Claude, Nova, Llama, DeepSeek via AWS) |
| `@ai-sdk/google` | Google AI SDK | Gemini models with native thinking/variant support |

### 2.3 Provider Options (`OpenCodeProviderOptions`)

```typescript
interface OpenCodeProviderOptions {
  baseURL?: string;                    // API endpoint URL
  apiKey?: string;                     // API key
  headers?: Record<string, string>;    // Custom request headers
  setCacheKey?: boolean;               // Enable cache key
  [key: string]: unknown;              // Arbitrary extra options (timeout, etc.)
}
```

**Known option keys** (recognized by the UI): `baseURL`, `apiKey`, `headers`. Any other keys are treated as "extra options" and displayed in a dynamic key-value editor.

### 2.4 Model Configuration (`OpenCodeModel`)

```typescript
interface OpenCodeModel {
  name: string;                        // Display name
  limit?: {
    context?: number;                  // Context window size in tokens
    output?: number;                   // Max output tokens
  };
  options?: Record<string, unknown>;   // Model-level SDK options (provider routing, etc.)
  [key: string]: unknown;              // Arbitrary extra fields
}
```

**Known model keys** (recognized by the UI): `name`, `limit`, `options`. Any other keys are treated as "extra fields" and displayed in a separate section.

**Common extra fields:**

| Field | Type | Description |
|-------|------|-------------|
| `modalities` | `{ input: string[], output: string[] }` | Supported input/output modalities |
| `variants` | `Record<string, Record<string, unknown>>` | Model variants with different configs |
| `cost` | object | Pricing information |

### 2.5 Model Variants

Models can define variants that alter their behavior. Each variant is a set of SDK options merged into the request:

**OpenAI (GPT-5.4) variants:**
```json5
{
  "variants": {
    "low": { "reasoningEffort": "low", "reasoningSummary": "auto", "textVerbosity": "medium" },
    "medium": { "reasoningEffort": "medium", "reasoningSummary": "auto", "textVerbosity": "medium" },
    "high": { "reasoningEffort": "high", "reasoningSummary": "auto", "textVerbosity": "medium" },
    "xhigh": { "reasoningEffort": "xhigh", "reasoningSummary": "auto", "textVerbosity": "medium" }
  }
}
```

**Anthropic (Claude Opus 4.7) variants:**
```json5
{
  "variants": {
    "low": { "effort": "low" },
    "medium": { "effort": "medium" },
    "high": { "effort": "high" },
    "max": { "effort": "max" }
  }
}
```

**Anthropic (Claude Opus 4.5) variants (thinking):**
```json5
{
  "variants": {
    "low": { "thinking": { "budgetTokens": 5000, "type": "enabled" } },
    "medium": { "thinking": { "budgetTokens": 13000, "type": "enabled" } },
    "high": { "thinking": { "budgetTokens": 18000, "type": "enabled" } }
  }
}
```

**Google (Gemini 3 Flash Preview) variants:**
```json5
{
  "variants": {
    "minimal": { "thinkingConfig": { "includeThoughts": true, "thinkingLevel": "minimal" } },
    "low": { "thinkingConfig": { "includeThoughts": true, "thinkingLevel": "low" } },
    "medium": { "thinkingConfig": { "includeThoughts": true, "thinkingLevel": "medium" } },
    "high": { "thinkingConfig": { "includeThoughts": true, "thinkingLevel": "high" } }
  }
}
```

**Google (Gemini 2.5 Flash Lite) variants:**
```json5
{
  "variants": {
    "auto": { "thinkingConfig": { "includeThoughts": true, "thinkingBudget": -1 } },
    "no-thinking": { "thinkingConfig": { "thinkingBudget": 0 } }
  }
}
```

### 2.6 Preset Model Metadata

CC Switch includes rich preset metadata for models across all SDK packages:

**`@ai-sdk/openai`:**
| Model | Context | Output | Modalities |
|-------|---------|--------|------------|
| GPT-5.4 | 400,000 | 128,000 | text, image → text |

**`@ai-sdk/anthropic`:**
| Model | Context | Output | Modalities |
|-------|---------|--------|------------|
| Claude Sonnet 4.5 | 200,000 | 64,000 | text, image, pdf → text |
| Claude Opus 4.5 | 200,000 | 64,000 | text, image, pdf → text |
| Claude Opus 4.7 | 1,000,000 | 128,000 | text, image, pdf → text |
| Claude Haiku 4.5 | 200,000 | 64,000 | text, image, pdf → text |

**`@ai-sdk/google`:**
| Model | Context | Output | Modalities |
|-------|---------|--------|------------|
| Gemini 2.5 Flash Lite | 1,048,576 | 65,536 | text, image, pdf, video, audio → text |
| Gemini 3 Flash Preview | 1,048,576 | 65,536 | text, image, pdf, video, audio → text |
| Gemini 3 Pro Preview | 1,048,576 | 65,536 | text, image, pdf, video, audio → text |

**`@ai-sdk/amazon-bedrock`:**
| Model | Context | Output | Modalities |
|-------|---------|--------|------------|
| Claude Opus 4.7 | 1,000,000 | 128,000 | text, image, pdf → text |
| Claude Sonnet 4.6 | 1,000,000 | 64,000 | text, image, pdf → text |
| Claude Haiku 4.5 | 200,000 | 64,000 | text, image, pdf → text |
| Amazon Nova Pro | 300,000 | 5,000 | text, image → text |
| Meta Llama 4 Maverick | 131,072 | 131,072 | text → text |
| DeepSeek R1 | 131,072 | 131,072 | text → text |

**`@ai-sdk/openai-compatible`:**
| Model | Context | Output | Modalities |
|-------|---------|--------|------------|
| MiniMax M2.7 | 204,800 | 131,072 | text → text |
| GLM 5 | 204,800 | 131,072 | text → text |
| Kimi K2.6 | 262,144 | 262,144 | text, image, video → text |
| Step 3.5 Flash 2603 | 262,144 | — | — |
| Step 3.5 Flash | 262,144 | — | — |

### 2.7 Provider Presets

CC Switch includes 40+ built-in OpenCode provider presets organized by category:

| Category | Providers |
|----------|-----------|
| **cn_official** | DeepSeek, Zhipu GLM (CN/EN), Bailian, Kimi K2.6, Kimi For Coding, StepFun (CN/EN/Step Plan), MiniMax (CN/EN), DouBaoSeed, 火山Agentplan, BytePlus, ModelScope, KAT-Coder, Longcat, BaiLing, Xiaomi MiMo (API/Token Plan) |
| **aggregator** | OpenRouter, TheRouter, AiHubMix, DMXAPI, Novita AI, Nvidia, PIPELLM, RunAPI |
| **third_party** | PackyCode, Cubence, AIGoCode, RightCode, AICodeMirror, ClaudeCN, AICoding, CrazyRouter, SSSAiCode, Micu, CTok.ai, E-FlowCode, LemonData |
| **cloud_provider** | AWS Bedrock |
| **custom** | OpenAI Compatible (generic template) |
| **omo** | Oh My OpenCode |
| **omo-slim** | Oh My OpenCode Slim |

Each preset defines:
- `name` / `nameKey` — Display name (with optional i18n key)
- `websiteUrl` — Provider website
- `apiKeyUrl` — Direct link to get API keys
- `settingsConfig` — Full provider config (`npm`, `options`, `models`)
- `isOfficial` / `isPartner` — Provider classification
- `category` — Provider category
- `templateValues` — Form field templates (label, placeholder, default value)
- `theme` — Visual theme
- `icon` / `iconColor` — Provider icon

---

## 3. Frontend UI Components

### 3.1 OpenCodeFormFields (`src/components/providers/forms/OpenCodeFormFields.tsx`)

The main form for editing an OpenCode provider (873 lines). Renders all editable fields:

**NPM Package Selector:**
- `<Select>` dropdown populated from `opencodeNpmPackages`
- Choices: OpenAI Responses, OpenAI Compatible, Anthropic, Amazon Bedrock, Google (Gemini)
- Changing the package resets model-related state

**API Key:**
- Shared `<ApiKeySection>` component
- Shows partner-specific links when applicable (based on `category`, `isPartner`, `partnerPromotionKey`)

**Base URL:**
- Plain `<Input>` for the API endpoint URL
- Trailing slashes are automatically stripped on blur

**Extra Options Editor:**
- Dynamic key-value pair editor for arbitrary SDK options
- New options get placeholder key `option-<timestamp>`
- Key input uses local state with `onBlur` commit to prevent focus loss during typing
- Auto-parses JSON values where possible

**Models Editor:**
- Dynamic list of models, each with:
  - **Collapsible expand/collapse toggle** (ChevronRight icon)
  - **Model ID input** (local state + onBlur pattern to avoid React key-based remounting)
  - **ModelDropdown** (shown when `fetchedModels` is populated from "Fetch Models")
  - **Display Name input**
  - **Expanded model details** with two sub-sections:
    - **Model Properties (extra fields)** — Arbitrary top-level fields (e.g., `variants`, `cost`, `modalities`). Uses `getModelExtraFields()` to filter out known keys.
    - **SDK Options** — Nested `model.options` key-value pairs
  - **Fetch Models** button — Calls `fetchModelsForConfig(baseUrl, apiKey)` to auto-populate from API
  - **Add Model** button

**Internal helper components:**
- `ModelIdInput` — Local state with onBlur commit
- `ExtraOptionKeyInput` — Local state with onBlur commit
- `ModelOptionKeyInput` — Local state with onBlur commit

### 3.2 useOpencodeFormState (`src/components/providers/forms/hooks/useOpencodeFormState.ts`)

State management hook (193 lines):

**State managed:**
- `opencodeProviderKey` — Selected provider ID
- `opencodeNpm` — Selected NPM package (default: `@ai-sdk/openai-compatible`)
- `opencodeApiKey` — API key string
- `opencodeBaseUrl` — Base URL string
- `opencodeModels` — `Record<string, OpenCodeModel>` map
- `opencodeExtraOptions` — `Record<string, string>` map for arbitrary SDK options

**Key behaviors:**
- On initialization (when `appId === "opencode"`), parses existing `settingsConfig` via `parseOpencodeConfig()`
- Every handler updates local React state AND calls `updateOpencodeSettings()` which reads the full config JSON, applies the mutation, and writes it back via `onSettingsConfigChange`
- `handleOpencodeBaseUrlChange` strips trailing slashes
- `handleOpencodeExtraOptionsChange` removes all non-known option keys, then inserts new extra options with auto JSON parsing
- `resetOpencodeState(config?)` resets all state to defaults or provided config

### 3.3 opencodeFormUtils (`src/components/providers/forms/helpers/opencodeFormUtils.ts`)

Pure utility functions and constants (161 lines):

**Constants:**
- `OPENCODE_DEFAULT_NPM` = `"@ai-sdk/openai-compatible"`
- `OPENCODE_DEFAULT_CONFIG` — JSON string with `npm`, `options: { baseURL, apiKey, setCacheKey: true }`, empty `models`
- `OPENCODE_KNOWN_OPTION_KEYS` = `["baseURL", "apiKey", "headers"]`
- `OPENCODE_KNOWN_MODEL_KEYS` = `["name", "limit", "options"]`

**Functions:**
- `isKnownOpencodeOptionKey(key)` — Checks if key is in known option keys
- `parseOpencodeConfig(settingsConfig?)` — Safely parses config, normalizes missing fields, returns defaults on failure
- `parseOpencodeConfigStrict(settingsConfig?)` — Same but throws on failure
- `isKnownModelKey(key)` — Checks if key is in known model keys
- `getModelExtraFields(model)` — Extracts all key-value pairs that are NOT `name`, `limit`, or `options`
- `toOpencodeExtraOptions(options)` — Extracts all key-value pairs that are NOT `baseURL`, `apiKey`, or `headers`
- `buildOmoProfilePreview()` — Re-exported from `@/types/omo`
- `normalizePricingSource(value?)` — Normalizes pricing source strings

---

## 4. Type Definitions (`src/types.ts`)

### 4.1 Core Types

```typescript
// Model configuration
interface OpenCodeModel {
  name: string;
  limit?: { context?: number; output?: number };
  options?: Record<string, unknown>;
  [key: string]: unknown;  // cost, modalities, thinking, variants, etc.
}

// Provider-level options
interface OpenCodeProviderOptions {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;  // timeout, setCacheKey, etc.
}

// Full provider config
interface OpenCodeProviderConfig {
  npm: string;
  name?: string;
  options: OpenCodeProviderOptions;
  models: Record<string, OpenCodeModel>;
}

// MCP server spec (OpenCode-specific format)
interface OpenCodeMcpServerSpec {
  type: "local" | "remote";
  command?: string[];                    // Merged command+args array
  environment?: Record<string, string>;  // Uses "environment" not "env"
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}
```

### 4.2 App Integration Types

```typescript
// Provider category includes OMO variants
type ProviderCategory = ... | "omo" | "omo-slim";

// App visibility toggles
interface VisibleApps { opencode: boolean; }
interface McpApps { opencode: boolean; }
interface ProviderApps { opencode: boolean; }

// Settings
interface Settings {
  opencodeConfigDir?: string;  // Override OpenCode config directory
}
```

---

## 5. Backend Implementation

### 5.1 Config File Management (`src-tauri/src/opencode_config.rs`)

Rust backend module (234 lines) for reading/writing `opencode.json`.

**Config directory resolution:**
- `get_opencode_dir()` — Returns OpenCode config directory, preferring override from `settings.opencodeConfigDir`, defaulting to `~/.config/opencode`
- `get_opencode_config_path()` — Returns `~/.config/opencode/opencode.json`

**Provider management:**

| Function | Description |
|----------|-------------|
| `read_opencode_config()` | Reads and parses JSON5 config. Returns default schema if file doesn't exist. |
| `write_opencode_config(config)` | Writes full config back to disk. |
| `get_providers()` | Returns `"provider"` object from config. |
| `set_provider(id, config)` | Sets a provider by ID. |
| `remove_provider(id)` | Removes a provider by ID. |
| `get_typed_providers()` | Returns providers as `IndexMap<String, OpenCodeProviderConfig>` (ordered). |
| `set_typed_provider(id, config)` | Serializes and sets a typed provider config. |

**MCP server management:**

| Function | Description |
|----------|-------------|
| `get_mcp_servers()` | Returns `"mcp"` object from config. |
| `set_mcp_server(id, config)` | Sets an MCP server by ID. |
| `remove_mcp_server(id)` | Removes an MCP server by ID. |

**Plugin management:**

| Function | Description |
|----------|-------------|
| `add_plugin(plugin_name)` | Adds plugin to `"plugin"` array with mutual exclusion logic. |
| `remove_plugins_by_prefixes(prefixes)` | Removes all plugins matching given prefixes. |
| `canonicalize_plugin_name(name)` | Renames `oh-my-opencode*` to `oh-my-openagent*`. |

**Plugin mutual exclusion:**
- Standard OMO prefixes: `["oh-my-openagent", "oh-my-opencode"]`
- Slim OMO prefixes: `["oh-my-opencode-slim"]`
- Adding one type automatically removes the other

**Environment:**
- `get_opencode_env_path()` — Returns `~/.config/opencode/.env` (defined but currently `#[allow(dead_code)]`)

### 5.2 MCP Server Synchronization (`src-tauri/src/mcp/opencode.rs`)

Bidirectional MCP sync (356 lines) between CC Switch's unified format and OpenCode's native format.

**Format conversion:**

| CC Switch Unified | OpenCode | Notes |
|---|---|---|
| `type: "stdio"` | `type: "local"` | Type name mapping |
| `command` + `args` (separate) | `command: [cmd, ...args]` (merged) | Arrays merged into single array |
| `env` | `environment` | Key name differs |
| `type: "sse"/"http"` | `type: "remote"` | Both map to remote |
| `url` | `url` | Preserved as-is |

**Key functions:**

| Function | Description |
|----------|-------------|
| `convert_to_opencode_format(spec)` | Converts unified MCP spec → OpenCode format. Adds `enabled: true`. |
| `convert_from_opencode_format(spec)` | Converts OpenCode format → unified. Splits command arrays. Converts `remote` → `sse`. |
| `sync_single_server_to_opencode(config, id, spec)` | Syncs one MCP server to live OpenCode config. Skips if config dir doesn't exist. |
| `remove_server_from_opencode(id)` | Removes one MCP server from live OpenCode config. |
| `import_from_opencode(config)` | Bulk imports all MCP servers from OpenCode config into unified structure. For existing servers: enables `opencode` app flag. For new servers: creates with only `opencode: true`. Validates and skips invalid specs. |

**Guard condition:** `should_sync_opencode_mcp()` checks if the OpenCode config directory exists before any sync.

### 5.3 Session Management (`src-tauri/src/session_manager/providers/opencode.rs`)

Session scanning and parsing from two storage backends:

**Storage locations:**
- Legacy JSON: `$XDG_DATA_HOME/opencode/storage/` (session/message/part directories)
- Modern SQLite: `$XDG_DATA_HOME/opencode/opencode.db` (tables: session, message, part)

**Key functions:**

| Function | Description |
|----------|-------------|
| `scan_sessions()` | Merges sessions from both JSON and SQLite. SQLite takes precedence on ID conflicts. |
| `scan_sessions_json()` | Recursively collects `.json` files from `storage/session/` directory. |
| `scan_sessions_sqlite()` | Reads from `opencode.db`. |
| `parse_sqlite_source(source)` | Parses source references in format `sqlite:<db_path>:<session_id>`. Uses `rfind(":ses_")` to handle Windows paths with colons. |

**Session resume:** Provides `resume_command` formatted as `opencode session resume {session_id}`.

**Session deletion:** Cleans up parts, diffs, and session files from both storage backends.

---

## 6. Oh My OpenCode (OMO) Plugin System

### 6.1 OMO Data Types (`src/types/omo.ts`)

```typescript
interface OmoLocalFileData { /* ... */ }
interface OmoAgentDef { /* agent definition */ }
interface OmoCategoryDef { /* category definition */ }
```

### 6.2 OMO Standard Agents (11 agents)

**Main group:**
- `sisyphus` — Primary coding agent
- `hephaestus` — Build/tooling agent
- `prometheus` — Planning agent
- `atlas` — Heavy-lifting agent

**Sub group:**
- `oracle` — Knowledge/reasoning agent
- `librarian` — Documentation agent
- `explore` — Code exploration agent
- `multimodal-looker` — Visual analysis agent
- `metis` — Strategy agent
- `momus` — Review/critique agent
- `sisyphus-junior` — Junior coding agent

Each agent has recommended model associations.

### 6.3 OMO Slim Agents (7 agents)

- `orchestrator` — Task coordination
- `oracle` — Knowledge/reasoning
- `librarian` — Documentation
- `explorer` — Code exploration
- `designer` — UI/UX design
- `fixer` — Bug fixing
- `council` — Decision making

### 6.4 OMO Categories (8 categories)

`visual-engineering`, `ultrabrain`, `deep`, `artistry`, `quick`, `unspecified-low`, `unspecified-high`, `writing`

### 6.5 Disableable Items

Both OMO variants support toggling off specific:
- Agents
- MCPs
- Hooks
- Skills

### 6.6 OMO API (`src/lib/api/omo.ts`)

```typescript
omoApi.readLocalFile()          // Read OMO local file
omoApi.getCurrentOmoProviderId() // Get current OMO provider ID
omoApi.disableCurrentOmo()      // Disable current OMO config
omoSlimApi.*                    // Parallel API for slim variant
```

### 6.7 Plugin Mutual Exclusion

Backend enforces mutual exclusion between OMO variants:
- Standard (`oh-my-openagent`, `oh-my-opencode`) and Slim (`oh-my-opencode-slim`) cannot coexist
- Adding one type automatically removes the other
- Plugin names are canonicalized: `oh-my-opencode*` → `oh-my-openagent*`

---

## 7. Skills & MCP Support

OpenCode is included in both `SKILLS_APP_IDS` and `MCP_APP_IDS`, supporting:
- **Skills** — Individually enabled/disabled per app
- **MCP Servers** — Full bidirectional synchronization with OpenCode's native format

---

## 8. Fetch Models

The "Fetch Models" button in the form calls `fetchModelsForConfig(baseUrl, apiKey)` to query the provider's `/v1/models` endpoint. Results populate a dropdown (`ModelDropdown`) for easy model selection. This works with any provider that exposes a standard OpenAI-compatible models endpoint.

---

## 9. Data Flow Summary

### Editing an OpenCode Provider

```
User edits form field
    → OpenCodeFormFields (UI)
    → useOpencodeFormState (state management)
        → Updates local React state
        → Calls updateOpencodeSettings()
        → Reads full config JSON, applies mutation
        → Writes back via onSettingsConfigChange
    → Tauri IPC call
    → opencode_config.rs
        → read_opencode_config() → modify → write_opencode_config()
        → Writes to ~/.config/opencode/opencode.json
```

### MCP Server Sync

```
User toggles MCP server for OpenCode
    → CC Switch unified config updated
    → mcp/opencode.rs::sync_single_server_to_opencode()
    → Converts unified format → OpenCode format
        - stdio → local (command+args merged)
        - sse/http → remote
        - env → environment
    → Writes to ~/.config/opencode/opencode.json
```

### Importing MCP from OpenCode

```
User clicks "Import from OpenCode"
    → mcp/opencode.rs::import_from_opencode()
    → Reads all MCP servers from opencode.json
    → Converts OpenCode format → unified format
        - local → stdio (command array split)
        - remote → sse
        - environment → env
    → For existing servers: enables opencode app flag
    → For new servers: creates entry with only opencode: true
    → Validates converted specs, skips invalid with warnings
```

### Plugin Management

```
User enables OMO plugin
    → opencode_config.rs::add_plugin("oh-my-openagent")
    → Reads current plugin list
    → Checks mutual exclusion:
        - If adding standard: removes slim prefixes
        - If adding slim: removes standard prefixes
    → Canonicalizes name (oh-my-opencode → oh-my-openagent)
    → Writes updated plugin list to opencode.json
```

### Session Management

```
Session list requested
    → session_manager/providers/opencode.rs::scan_sessions()
    → Parallel scan:
        - scan_sessions_json(): reads legacy JSON files from storage/
        - scan_sessions_sqlite(): reads from opencode.db
    → Merge results (SQLite takes precedence on ID conflicts)
    → Return unified session list

Session resume requested
    → Generates command: "opencode session resume {session_id}"
    → User executes in terminal

Session deletion requested
    → Deletes from both JSON and SQLite backends
    → Cleans up parts, diffs, and session files
```
