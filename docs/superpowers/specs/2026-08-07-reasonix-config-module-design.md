# Reasonix Config Module Design

## Overview

Add a fifth managed app — **Reasonix** — to CCSwitch, mirroring the existing `omp` module. Scope is config-view only: manage `[[providers]]` + `default_model` in `~/.reasonix/config.toml` (or `%APPDATA%\reasonix\config.toml` on Windows), plus provider API keys in `<Reasonix home>/.env`.

Reasonix config model (from official docs, see `reasonix.io/docs/#configfile` and repo `SPEC.md §5`):

- **Global user config**: `<Reasonix home>/config.toml` (macOS/Linux `~/.reasonix`, Windows `%APPDATA%\reasonix`). Resolution order: flags > project `./reasonix.toml` > user config > legacy > defaults.
- **Secrets**: stored in `<Reasonix home>/.env` as `KEY=value` lines; each `[[providers]]` block references its key name via `api_key_env`. Never inline in TOML.
- **Provider fields**: `name`, `kind` (`openai`), `base_url`, optional `chat_url`/`models_url`, `models[]` (or single `model`), optional `default`, `api_key_env`, optional `context_window`, `max_output_tokens`, `model_overrides`.
- **Top-level**: `default_model` = provider name (→ its default model) or `provider/model`.

## Requirements

- **App Selector**: Add "Reasonix" to the app dropdown in `index.vue`; switching resets `activeTab` to `'config'`.
- **Reasonix Config View**: provider/model CRUD + default model selection + API key management.
- **Config file**: read/write `<Reasonix home>/config.toml`; preserve all other TOML sections (`[agent]`, `[ui]`, `[permissions]`, `[sandbox]`, `[serve]`, `[[plugins]]`) untouched.
- **API keys**: read/write `<Reasonix home>/.env`; keys stored by `api_key_env` name.
- **uTools route**: `reasonixConfig` feature with command `Reasonix配置`.

## Architecture

```
index.vue
├── activeApp: ref<'claude' | 'opencode' | 'pi' | 'omp' | 'reasonix'>
├── AppSelector (Dropdown)
├── Tab buttons (conditional on activeApp)
└── Reasonix views (new)
    └── ReasonixConfigView  (config only)
```

Data flow:

```
ReasonixConfigView
  → window.services.readReasonixConfig() / getReasonixProviderList() / readReasonixEnv()
  → services/reasonix.js (smol-toml parse/stringify + .env line editor)
  → ~/.reasonix/config.toml + ~/.reasonix/.env
```

## Component Details

### ReasonixConfigView

**Data source**: `readReasonixConfig()` → `{ default_model, providers: [] }`, plus `readReasonixEnv()` for key values.

**Layout** (aligned with `OmpConfigView`):

- Section header: open config dir button, "Add Provider" button
- Default model selector (top-level `default_model`): Select with options = provider names (→ their default model) and `provider/model` explicit entries
- Provider card list: name, kind tag, base_url, `api_key_env`, model chips (with default marker); edit/delete buttons
- Empty state: "未检测到 Reasonix 配置，请在终端运行 reasonix setup 或手动编辑 config.toml"

**Provider Create/Edit Dialog**:

- `name` (unique key; readonly when editing)
- `kind` (Select, only `openai` for now)
- `base_url` (text)
- `chat_url` / `models_url` (optional text)
- `api_key_env` (text; auto-suggest generated name from provider name when empty)
- `api_key` (ApiKeyInput; on save writes `api_key_env=value` into `.env`, never into TOML)
- `context_window` (optional InputNumber, 0 = unset)
- `max_output_tokens` (optional InputNumber, 0 = unset)

**Model Dialog** (add/edit model within a provider):

- Model id (text)
- `default` checkbox (marks this provider's default model; clearing provider `default` field)
- Per-model edit is limited; `model_overrides` not managed this round (preserved in TOML)

**Write behavior**: read full TOML doc → mutate `doc.providers` / `doc.default_model` → serialize with smol-toml → write whole file. Comments/formatting are lost (accepted trade-off, consistent with omp's YAML dump).

### API key storage (`.env`)

- `readReasonixEnv()` → `{ key: value }` map, line-based parse; accepts `KEY=value`, `export KEY=value`, quoted values; blank lines/comments ignored for the map.
- `writeReasonixEnvKey(key, value)` → update existing line or append; preserves unrelated lines and comments.
- `deleteReasonixEnvKey(key)` → remove line.
- File written with restricted permissions where supported.

## Backend: preload/services/reasonix.js

Mirrors `omp.js` structure. All paths platform-aware:

```
getReasonixHome()          → ~/.reasonix (macOS/Linux) | %APPDATA%\reasonix (Windows)
getReasonixConfigPath()    → <home>/config.toml
readReasonixConfig()       → parsed TOML object or default
writeReasonixConfig(doc)   → serialize + write
getReasonixProviderList()  → normalized providers (models always array)
addReasonixProvider(cfg)   → name-conflict check
updateReasonixProvider(name, updates)
deleteReasonixProvider(name) → block if referenced by default_model
getReasonixDefaultModel() / setReasonixDefaultModel(ref)
readReasonixEnv() / writeReasonixEnvKey(key, value) / deleteReasonixEnvKey(key)
openReasonixDir() / isReasonixInstalled()
```

**TOML dependency**: add `smol-toml` (v1.7.x, CJS build available) to `public/preload/package.json`, `npm install` in that directory. esbuild bundles it into `dist/preload/services.js` (node18/cjs), matching js-yaml/json5 today.

## File Changes Summary

### New files

- `public/preload/services/reasonix.js`
- `src/Switch/ReasonixConfigView.vue`
- `src/Switch/styles/ReasonixConfigView.css`
- `public/icon-reasonix.png` (placeholder asset)

### Modified files

- `public/preload/package.json` — add `smol-toml`
- `public/preload/services.js` — require + expose `reasonix` service on `window.services`
- `src/composables/useAppContext.js` — add `isReasonix`
- `src/Switch/index.vue` — dropdown option, tab button, `pageTitleSuffix` map, `appMap` route, logo
- `src/App.vue` — route whitelist add `'reasonixConfig'`
- `public/plugin.json` — feature `{ code: "reasonixConfig", cmds: ["Reasonix配置"] }`

## Out of Scope (this round)

- MCP (`[[plugins]]`) and Usage views — later iterations
- Project-local `./reasonix.toml` — global config only
- `model_overrides`, `[agent]`, `[permissions]`, `[sandbox]`, `[serve]` form editing — preserved in TOML, not edited
- Comment/format preservation on write

## Verification

- `npm run build` passes (esbuild bundles smol-toml; no `.map`/node_modules leak in dist)
- Manual smoke test against a temp `~/.reasonix/config.toml` + `.env`:
  - add/edit/delete provider round-trips correctly
  - `default_model` set/update and provider-reference guard
  - API key written to `.env`, `api_key_env` referenced in TOML, key never inlined
  - unrelated TOML sections survive a write
