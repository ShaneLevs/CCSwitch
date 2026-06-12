# Codex Configuration Support - Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Codex (OpenAI Codex CLI) as a first-class app in CC Switch with provider switching, presets, and fetch models.

**Architecture:** Independent view component (CodexConfigView.vue) following the same pattern as OpenCodeConfigView.vue. Backend service (codex.js) handles dual-file I/O (auth.json + config.toml) and TOML field extraction via regex. Provider configs stored in uTools DB, only the active one written to `~/.codex/`.

**Tech Stack:** Vue 3 Composition API, TDesign Vue Next, uTools DB, Node.js fs/path/https

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `public/preload/services/codex.js` | Create | Backend: file I/O, TOML extraction, provider CRUD, fetch models |
| `public/preload/services.js` | Modify | Expose codex service functions to `window.services` |
| `src/Switch/CodexConfigView.vue` | Create | Main Codex config management view |
| `src/Switch/styles/CodexConfigView.css` | Create | Styles for CodexConfigView |
| `src/Switch/index.vue` | Modify | Add Codex app option, logo, tab, view |
| `src/composables/useAppContext.js` | Modify | Add `isCodex` computed |
| `public/logo-codex.png` | Create | Copy from project root `logo-codex.png` |

---

### Task 1: Create backend service `public/preload/services/codex.js`

**Files:**
- Create: `public/preload/services/codex.js`

This file provides all Codex backend functions. It reads/writes `~/.codex/auth.json` and `~/.codex/config.toml`, extracts TOML fields via regex, manages provider CRUD in uTools DB, and fetches models from API.

- [ ] **Step 1: Create `codex.js` with all functions**

```js
const fs = require('node:fs')
const path = require('node:path')

const CODEX_DIR = path.join(window.utools.getPath('home'), '.codex')
const CODEX_AUTH_PATH = path.join(CODEX_DIR, 'auth.json')
const CODEX_CONFIG_PATH = path.join(CODEX_DIR, 'config.toml')

const DB_PREFIX = 'ccswitch_codex_provider_'
const DB_CURRENT_KEY = 'ccswitch_codex_current_provider'

const DEFAULT_TOML = `model_provider = "custom"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "custom"
base_url = ""
wire_api = "responses"
requires_openai_auth = true`

const DEFAULT_AUTH = { OPENAI_API_KEY: "" }

// ==================== File I/O ====================

const getCodexDir = () => CODEX_DIR

const readCodexAuth = () => {
  try {
    if (!fs.existsSync(CODEX_AUTH_PATH)) return { ...DEFAULT_AUTH }
    const content = fs.readFileSync(CODEX_AUTH_PATH, { encoding: 'utf-8' })
    const parsed = JSON.parse(content)
    if (!parsed.OPENAI_API_KEY && parsed.OPENAI_API_KEY !== '') parsed.OPENAI_API_KEY = ''
    return parsed
  } catch (error) {
    console.error('读取 Codex auth.json 失败:', error)
    return { ...DEFAULT_AUTH }
  }
}

const writeCodexAuth = (auth) => {
  try {
    if (!fs.existsSync(CODEX_DIR)) fs.mkdirSync(CODEX_DIR, { recursive: true })
    fs.writeFileSync(CODEX_AUTH_PATH, JSON.stringify(auth, null, 2), { encoding: 'utf-8' })
    return true
  } catch (error) {
    console.error('写入 Codex auth.json 失败:', error)
    return false
  }
}

const readCodexConfig = () => {
  try {
    if (!fs.existsSync(CODEX_CONFIG_PATH)) return DEFAULT_TOML
    return fs.readFileSync(CODEX_CONFIG_PATH, { encoding: 'utf-8' })
  } catch (error) {
    console.error('读取 Codex config.toml 失败:', error)
    return DEFAULT_TOML
  }
}

const writeCodexConfig = (configText) => {
  try {
    if (!fs.existsSync(CODEX_DIR)) fs.mkdirSync(CODEX_DIR, { recursive: true })
    fs.writeFileSync(CODEX_CONFIG_PATH, configText, { encoding: 'utf-8' })
    return true
  } catch (error) {
    console.error('写入 Codex config.toml 失败:', error)
    return false
  }
}

// ==================== TOML Field Extraction ====================

const extractCodexBaseUrl = (tomlText) => {
  const match = tomlText.match(/^base_url\s*=\s*"([^"]*)"/m)
  return match ? match[1] : ""
}

const extractCodexModelName = (tomlText) => {
  const match = tomlText.match(/^model\s*=\s*"([^"]*)"/m)
  return match ? match[1] : ""
}

const extractCodexWireApi = (tomlText) => {
  const match = tomlText.match(/^wire_api\s*=\s*"([^"]*)"/m)
  return match ? match[1] : ""
}

const extractCodexReasoningEffort = (tomlText) => {
  const match = tomlText.match(/^model_reasoning_effort\s*=\s*"([^"]*)"/m)
  return match ? match[1] : ""
}

const extractCodexProviderName = (tomlText) => {
  const match = tomlText.match(/^name\s*=\s*"([^"]*)"/m)
  return match ? match[1] : ""
}

const extractCodexModelProvider = (tomlText) => {
  const match = tomlText.match(/^model_provider\s*=\s*"([^"]*)"/m)
  return match ? match[1] : ""
}

// ==================== TOML Field Replacement ====================

const setCodexFieldInConfig = (tomlText, fieldName, value) => {
  const regex = new RegExp(`^((${fieldName})\\s*=\\s*)"[^"]*"`, 'm')
  if (regex.test(tomlText)) {
    return tomlText.replace(regex, `$1"${value}"`)
  }
  return tomlText
}

const setCodexBaseUrlInConfig = (tomlText, url) => setCodexFieldInConfig(tomlText, 'base_url', url)
const setCodexModelNameInConfig = (tomlText, model) => setCodexFieldInConfig(tomlText, 'model', model)
const setCodexWireApiInConfig = (tomlText, wireApi) => setCodexFieldInConfig(tomlText, 'wire_api', wireApi)
const setCodexReasoningEffortInConfig = (tomlText, effort) => setCodexFieldInConfig(tomlText, 'model_reasoning_effort', effort)

// ==================== Provider CRUD (uTools DB) ====================

const getCodexProviders = () => {
  const docs = window.utools.db.allDocs()
  return docs
    .filter(d => d._id.startsWith(DB_PREFIX))
    .map(d => ({
      id: d._id.replace(DB_PREFIX, ''),
      auth: d.auth || { ...DEFAULT_AUTH },
      config: d.config || DEFAULT_TOML,
      updatedAt: d.updatedAt,
    }))
}

const setCodexProvider = (id, providerData) => {
  try {
    const docId = DB_PREFIX + id
    const existing = window.utools.db.get(docId)
    const doc = {
      _id: docId,
      auth: providerData.auth || { ...DEFAULT_AUTH },
      config: providerData.config || DEFAULT_TOML,
      updatedAt: Date.now(),
    }
    if (existing) doc._rev = existing._rev
    const result = window.utools.db.put(doc)
    return !!result.ok
  } catch (error) {
    console.error('保存 Codex Provider 失败:', error)
    return false
  }
}

const removeCodexProvider = (id) => {
  try {
    const docId = DB_PREFIX + id
    const existing = window.utools.db.get(docId)
    if (!existing) return false
    const result = window.utools.db.remove(docId)
    return !!result.ok
  } catch (error) {
    console.error('删除 Codex Provider 失败:', error)
    return false
  }
}

const getCodexCurrentProvider = () => {
  try {
    const doc = window.utools.db.get(DB_CURRENT_KEY)
    return doc ? doc.providerId : null
  } catch (error) {
    return null
  }
}

const setCodexCurrentProvider = (id) => {
  try {
    const docId = DB_PREFIX + id
    const provider = window.utools.db.get(docId)
    if (!provider) return false

    // Write provider files to disk
    const authOk = writeCodexAuth(provider.auth || { ...DEFAULT_AUTH })
    const configOk = writeCodexConfig(provider.config || DEFAULT_TOML)
    if (!authOk || !configOk) return false

    // Track current provider
    const existing = window.utools.db.get(DB_CURRENT_KEY)
    const doc = { _id: DB_CURRENT_KEY, providerId: id, updatedAt: Date.now() }
    if (existing) doc._rev = existing._rev
    window.utools.db.put(doc)
    return true
  } catch (error) {
    console.error('激活 Codex Provider 失败:', error)
    return false
  }
}

// ==================== Fetch Models ====================

const fetchModelsForCodex = (baseUrl, apiKey) => {
  const https = require('node:https')
  const http = require('node:http')
  const urlMod = require('node:url')

  return new Promise((resolve, reject) => {
    try {
      let endpoint = baseUrl.replace(/\/+$/, '')
      if (!endpoint.endsWith('/v1/models') && !endpoint.endsWith('/v1/models/')) {
        endpoint += '/v1/models'
      }
      const parsed = urlMod.parse(endpoint)
      const isHttps = parsed.protocol === 'https:'
      const requester = isHttps ? https : http

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.path,
        method: 'GET',
        headers: {
          'user-agent': 'CCSwitch/1.0',
          'accept': 'application/json',
        },
        timeout: 10000,
      }
      if (apiKey) options.headers['authorization'] = `Bearer ${apiKey}`

      requester.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          const redirectParsed = urlMod.parse(res.headers.location)
          const redirectHttps = redirectParsed.protocol === 'https:'
          const redirectRequester = redirectHttps ? https : http
          const redirectOpts = {
            hostname: redirectParsed.hostname,
            port: redirectParsed.port || (redirectHttps ? 443 : 80),
            path: redirectParsed.path,
            method: 'GET',
            headers: { ...options.headers },
            timeout: 10000,
          }
          redirectRequester.get(redirectOpts, (res2) => {
            let data = ''
            res2.on('data', chunk => data += chunk)
            res2.on('end', () => {
              try {
                const json = JSON.parse(data)
                const models = (json.data || []).map(m => m.id || m.name).filter(Boolean)
                resolve(models)
              } catch (e) { reject(new Error('解析响应失败')) }
            })
          }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')) })
          return
        }
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const models = (json.data || []).map(m => m.id || m.name).filter(Boolean)
            resolve(models)
          } catch (e) { reject(new Error('解析响应失败')) }
        })
      }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')) })
    } catch (e) {
      reject(e)
    }
  })
}

module.exports = {
  getCodexDir,
  readCodexAuth, writeCodexAuth,
  readCodexConfig, writeCodexConfig,
  extractCodexBaseUrl, extractCodexModelName, extractCodexWireApi,
  extractCodexReasoningEffort, extractCodexProviderName, extractCodexModelProvider,
  setCodexBaseUrlInConfig, setCodexModelNameInConfig,
  setCodexWireApiInConfig, setCodexReasoningEffortInConfig,
  getCodexProviders, setCodexProvider, removeCodexProvider,
  getCodexCurrentProvider, setCodexCurrentProvider,
  fetchModelsForCodex,
}
```

- [ ] **Step 2: Verify the file was created correctly**

Run: `head -5 public/preload/services/codex.js`
Expected: Shows `const fs = require('node:fs')` etc.

- [ ] **Step 3: Commit**

```bash
git add public/preload/services/codex.js
git commit -m "feat: add Codex backend service (codex.js)"
```

---

### Task 2: Expose codex functions in `public/preload/services.js`

**Files:**
- Modify: `public/preload/services.js`

- [ ] **Step 1: Add codex require and expose functions**

After the existing `const opencode = require('./services/opencode')` line, add:

```js
const codex = require('./services/codex')
```

After the existing opencode destructuring block, add:

```js
const {
  getCodexDir,
  readCodexAuth, writeCodexAuth,
  readCodexConfig, writeCodexConfig,
  extractCodexBaseUrl, extractCodexModelName, extractCodexWireApi,
  extractCodexReasoningEffort, extractCodexProviderName, extractCodexModelProvider,
  setCodexBaseUrlInConfig, setCodexModelNameInConfig,
  setCodexWireApiInConfig, setCodexReasoningEffortInConfig,
  getCodexProviders, setCodexProvider, removeCodexProvider,
  getCodexCurrentProvider, setCodexCurrentProvider,
  fetchModelsForCodex,
} = codex
```

In `window.services`, after the OpenCode section and before the Skills section, add:

```js
  // ==================== Codex ====================
  getCodexDir,
  readCodexAuth, writeCodexAuth,
  readCodexConfig, writeCodexConfig,
  extractCodexBaseUrl, extractCodexModelName, extractCodexWireApi,
  extractCodexReasoningEffort, extractCodexProviderName, extractCodexModelProvider,
  setCodexBaseUrlInConfig, setCodexModelNameInConfig,
  setCodexWireApiInConfig, setCodexReasoningEffortInConfig,
  getCodexProviders, setCodexProvider, removeCodexProvider,
  getCodexCurrentProvider, setCodexCurrentProvider,
  fetchModelsForCodex,
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add public/preload/services.js
git commit -m "feat: expose Codex service functions in services.js"
```

---

### Task 3: Add `isCodex` to `useAppContext.js`

**Files:**
- Modify: `src/composables/useAppContext.js`

- [ ] **Step 1: Add isCodex computed**

Change the file to:

```js
import { ref, computed } from 'vue'

const activeApp = ref('claude')

export function useAppContext() {
  const setActiveApp = (app) => {
    activeApp.value = app
  }

  const isClaude = computed(() => activeApp.value === 'claude')
  const isOpenCode = computed(() => activeApp.value === 'opencode')
  const isCodex = computed(() => activeApp.value === 'codex')

  return { activeApp, setActiveApp, isClaude, isOpenCode, isCodex }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useAppContext.js
git commit -m "feat: add isCodex computed to useAppContext"
```

---

### Task 4: Copy Codex logo and update `index.vue` for Codex app

**Files:**
- Create: `public/logo-codex.png` (copy from project root)
- Modify: `src/Switch/index.vue`

- [ ] **Step 1: Copy logo**

```bash
cp logo-codex.png public/logo-codex.png
```

- [ ] **Step 2: Update index.vue — imports**

Add import after the OpenCode imports:

```js
import CodexConfigView from "./CodexConfigView.vue";
```

- [ ] **Step 3: Update index.vue — useAppContext destructure**

Change:
```js
const { activeApp, setActiveApp, isClaude, isOpenCode } = useAppContext();
```
to:
```js
const { activeApp, setActiveApp, isClaude, isOpenCode, isCodex } = useAppContext();
```

- [ ] **Step 4: Update index.vue — appLabel**

Change:
```js
const appLabel = computed(() => isClaude.value ? 'Claude Code' : 'Open Code');
```
to:
```js
const appLabel = computed(() => {
  if (isCodex.value) return 'Codex';
  if (isOpenCode.value) return 'Open Code';
  return 'Claude Code';
});
```

- [ ] **Step 5: Update index.vue — pageTitleSuffix**

Change:
```js
const pageTitleSuffix = computed(() => {
  if (isOpenCode.value) {
    if (activeTab.value === 'mcp') return 'MCP 配置';
    if (activeTab.value === 'skill') return 'Skill 配置';
    return '配置管理';
  }
  if (activeTab.value === 'usage') return '使用统计';
  if (activeTab.value === 'mcp') return 'MCP 配置';
  if (activeTab.value === 'skill') return 'Skill 配置';
  return '配置切换';
});
```
to:
```js
const pageTitleSuffix = computed(() => {
  if (isCodex.value) return '配置管理';
  if (isOpenCode.value) {
    if (activeTab.value === 'mcp') return 'MCP 配置';
    if (activeTab.value === 'skill') return 'Skill 配置';
    return '配置管理';
  }
  if (activeTab.value === 'usage') return '使用统计';
  if (activeTab.value === 'mcp') return 'MCP 配置';
  if (activeTab.value === 'skill') return 'Skill 配置';
  return '配置切换';
});
```

- [ ] **Step 6: Update index.vue — appDropdownOptions**

Change:
```js
const appDropdownOptions = [
  { content: 'Claude Code', value: 'claude' },
  { content: 'Open Code', value: 'opencode' },
];
```
to:
```js
const appDropdownOptions = [
  { content: 'Claude Code', value: 'claude' },
  { content: 'Open Code', value: 'opencode' },
  { content: 'Codex', value: 'codex' },
];
```

- [ ] **Step 7: Update index.vue — template logo section**

Change:
```html
<img v-if="showWaving && isClaude" :key="wavingKey" :src="wavingSrc" alt="logo" class="logo" @click="triggerWaving" />
<img v-else-if="isClaude" src="/logo.png" alt="logo" class="logo" @click="triggerWaving" />
<img v-else src="/icon-opencode.png" alt="logo" class="logo" />
```
to:
```html
<img v-if="showWaving && isClaude" :key="wavingKey" :src="wavingSrc" alt="logo" class="logo" @click="triggerWaving" />
<img v-else-if="isClaude" src="/logo.png" alt="logo" class="logo" @click="triggerWaving" />
<img v-else-if="isCodex" src="/logo-codex.png" alt="logo" class="logo" />
<img v-else src="/icon-opencode.png" alt="logo" class="logo" />
```

- [ ] **Step 8: Update index.vue — template tab area**

After the Open Code tabs section (the `v-else` div with class `tab-buttons`), add Codex tabs. The full header-right section should become:

```html
<div class="header-right">
  <!-- Claude Code tabs -->
  <div v-if="isClaude" class="tab-buttons">
    <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
      <template #icon><DashboardIcon /></template> 配置管理
    </Button>
    <Button size="small" :theme="activeTab === 'mcp' ? 'primary' : 'default'" :variant="activeTab === 'mcp' ? 'base' : 'outline'" @click="activeTab = 'mcp'">
      <template #icon><ServerIcon /></template> MCP
    </Button>
    <Button size="small" :theme="activeTab === 'skill' ? 'primary' : 'default'" :variant="activeTab === 'skill' ? 'base' : 'outline'" @click="activeTab = 'skill'">
      <template #icon><BookIcon /></template> Skill
    </Button>
    <Button size="small" :theme="activeTab === 'usage' ? 'primary' : 'default'" :variant="activeTab === 'usage' ? 'base' : 'outline'" @click="activeTab = 'usage'">
      <template #icon><ChartIcon /></template> 使用统计
    </Button>
  </div>
  <!-- Codex tabs -->
  <div v-else-if="isCodex" class="tab-buttons">
    <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
      <template #icon><DashboardIcon /></template> 配置管理
    </Button>
  </div>
  <!-- Open Code tabs -->
  <div v-else class="tab-buttons">
    <Button size="small" :theme="activeTab === 'config' ? 'primary' : 'default'" :variant="activeTab === 'config' ? 'base' : 'outline'" @click="activeTab = 'config'">
      <template #icon><DashboardIcon /></template> 配置管理
    </Button>
  </div>
</div>
```

- [ ] **Step 9: Update index.vue — template views section**

Change:
```html
<!-- Open Code views -->
<template v-else>
  <OpenCodeConfigView />
</template>
```
to:
```html
<!-- Codex views -->
<CodexConfigView v-else-if="isCodex" />

<!-- Open Code views -->
<OpenCodeConfigView v-else />
```

- [ ] **Step 10: Commit**

```bash
git add public/logo-codex.png src/Switch/index.vue
git commit -m "feat: add Codex app option to index.vue with logo and tab"
```

---

### Task 5: Create `CodexConfigView.vue` — main structure and provider list

**Files:**
- Create: `src/Switch/CodexConfigView.vue`
- Create: `src/Switch/styles/CodexConfigView.css`

This is the largest task. The component manages Codex provider CRUD with a dual-file config model (auth.json + config.toml). It follows the same visual pattern as OpenCodeConfigView but with Codex-specific form fields and TOML handling.

- [ ] **Step 1: Create the CSS file**

Create `src/Switch/styles/CodexConfigView.css`:

```css
.codex-config-view { display: flex; flex-direction: column; }

/* Section Header */
.codex-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.codex-section-tip { font-size: 12px; color: var(--td-text-color-placeholder); }
.codex-hint-link { color: var(--td-brand-color); cursor: pointer; text-decoration: underline; }
.codex-empty-state { padding: 40px 0; }

/* Provider List */
.codex-provider-list { display: flex; flex-direction: column; gap: 12px; }

.codex-provider-card {
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-component-border);
  overflow: hidden;
  transition: border-color 0.2s;
}
.codex-provider-card:hover { border-color: var(--td-brand-color); }
.codex-provider-card--active { border-color: var(--td-brand-color); box-shadow: 0 0 0 1px var(--td-brand-color); }

.codex-provider-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--td-component-border);
}

.codex-provider-card-info { display: flex; align-items: center; gap: 8px; }

.codex-provider-id {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  font-family: monospace;
}

.codex-provider-active-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--td-brand-color);
  color: #fff;
}

.codex-provider-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 16px 12px;
}

.codex-provider-name {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.codex-provider-url {
  font-size: 12px;
  color: var(--td-brand-color);
  font-family: monospace;
  word-break: break-all;
}

.codex-provider-tags { display: flex; gap: 4px; flex-wrap: wrap; }

/* Dialog Form */
.codex-form { display: flex; flex-direction: column; gap: 16px; }

.codex-form-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.codex-form-item label {
  font-size: 14px;
  color: var(--td-text-color-primary);
  flex-shrink: 0;
  width: 110px;
  text-align: right;
  white-space: nowrap;
}
.codex-form-item .required { color: var(--td-error-color); }

.codex-form-item-vertical { display: flex; flex-direction: column; gap: 8px; }
.codex-form-item-vertical label { font-size: 14px; color: var(--td-text-color-primary); }

.codex-form-item-row { display: flex; gap: 16px; align-items: center; }

/* Form Sections */
.codex-form-section {
  border-top: 1px solid var(--td-component-border);
  padding-top: 16px;
}

.codex-form-section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
}

/* Model Fetch */
.codex-model-row { display: flex; gap: 8px; align-items: center; flex: 1; }
.codex-fetch-btn { flex-shrink: 0; }

/* Raw editors */
.codex-raw-editor { font-family: monospace; font-size: 13px; }

/* Dialog Footer */
.codex-dialog-footer { display: flex; justify-content: space-between; align-items: center; }
.codex-dialog-footer-right { display: flex; gap: 8px; }

/* Preset List */
.codex-preset-toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.codex-preset-search { flex: 1; }
.codex-preset-loading { text-align: center; padding: 24px 0; color: var(--td-text-color-placeholder); font-size: 13px; }
.codex-preset-error { text-align: center; padding: 24px 0; color: var(--td-error-color); font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.codex-preset-empty { text-align: center; padding: 24px 0; color: var(--td-text-color-placeholder); font-size: 13px; }
.codex-preset-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }

.codex-preset-item {
  padding: 12px 16px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-component-border);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.codex-preset-item:hover {
  border-color: var(--td-brand-color);
  background: var(--td-bg-color-container-hover);
}

.codex-preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
  margin-bottom: 4px;
}

.codex-preset-desc {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.codex-preset-url {
  font-size: 12px;
  color: var(--td-brand-color);
  font-family: monospace;
}

.codex-preset-category {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--td-bg-color-container-hover);
  color: var(--td-text-color-secondary);
}

/* Import Dialog */
.codex-import-textarea { font-family: monospace; font-size: 12px; }

/* Dark mode */
:root[theme-mode="dark"] .codex-provider-card:hover { border-color: var(--td-brand-color); }
:root[theme-mode="dark"] .codex-preset-item:hover { border-color: var(--td-brand-color); }
```

- [ ] **Step 2: Commit CSS**

```bash
git add src/Switch/styles/CodexConfigView.css
git commit -m "feat: add CodexConfigView CSS styles"
```

- [ ] **Step 3: Create the Vue component — script section with constants, state, and presets**

Create `src/Switch/CodexConfigView.vue` with the `<script setup>` section. This is the full component. Due to size, it is presented in one block:

```vue
<script setup>
import { ref, onMounted, computed, watch, nextTick } from "vue";
import {
  Button,
  Input,
  Select,
  Dialog,
  MessagePlugin,
  Tag,
  Space,
  Empty,
  Popconfirm,
  Textarea,
  Tooltip,
  Loading,
} from "tdesign-vue-next";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  DownloadIcon,
  UploadIcon,
  RefreshIcon,
  SearchIcon,
  FolderIcon,
  ChevronDownIcon,
} from "tdesign-icons-vue-next";
import ApiKeyInput from "../components/ApiKeyInput.vue";
import "./styles/CodexConfigView.css";

// ==================== Constants ====================

const DEFAULT_TOML = `model_provider = "custom"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "custom"
base_url = ""
wire_api = "responses"
requires_openai_auth = true`;

const DEFAULT_AUTH = { OPENAI_API_KEY: "" };

const WIRE_API_OPTIONS = [
  { label: "Responses API", value: "responses" },
  { label: "Chat Completions", value: "chat" },
];

const REASONING_EFFORT_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const BUILT_IN_PRESETS = [
  {
    id: "openai-official",
    name: "OpenAI 官方",
    category: "official",
    icon: "🤖",
    websiteUrl: "https://platform.openai.com",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "openai"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.openai]\nname = "openai"\nbase_url = "https://api.openai.com/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    category: "official",
    icon: "☁️",
    websiteUrl: "https://azure.microsoft.com/en-us/products/ai-services/openai-service",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "azure"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.azure]\nname = "azure"\nbase_url = ""\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "aggregator",
    icon: "🌐",
    websiteUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/keys",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "openrouter"\nmodel = "openai/gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.openrouter]\nname = "openrouter"\nbase_url = "https://openrouter.ai/api/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "aihubmix",
    name: "AiHubMix",
    category: "aggregator",
    icon: "🔀",
    websiteUrl: "https://aihubmix.com",
    apiKeyUrl: "https://aihubmix.com/token",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "aihubmix"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.aihubmix]\nname = "aihubmix"\nbase_url = "https://aihubmix.com/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "dmxapi",
    name: "DMXAPI",
    category: "aggregator",
    icon: "⚡",
    websiteUrl: "https://www.dmxapi.com",
    apiKeyUrl: "https://www.dmxapi.com/register",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "dmxapi"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.dmxapi]\nname = "dmxapi"\nbase_url = "https://www.dmxapi.com/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "therouter",
    name: "TheRouter",
    category: "aggregator",
    icon: "🛤️",
    websiteUrl: "https://therouter.ai",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "therouter"\nmodel = "openai/gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.therouter]\nname = "therouter"\nbase_url = "https://router1.the-router.ai/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "pipellm",
    name: "PIPELLM",
    category: "aggregator",
    icon: "🔧",
    websiteUrl: "https://pipellm.com",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "pipellm"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.pipellm]\nname = "pipellm"\nbase_url = "https://api.pipellm.com/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "runapi",
    name: "RunAPI",
    category: "aggregator",
    icon: "🏃",
    websiteUrl: "https://runapi.pro",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "runapi"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.runapi]\nname = "runapi"\nbase_url = "https://api.runapi.pro/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "packycode",
    name: "PackyCode",
    category: "third_party",
    icon: "📦",
    websiteUrl: "https://packycode.com",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "packycode"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.packycode]\nname = "packycode"\nbase_url = "https://api.packycode.com/v1"\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "cluadecn",
    name: "ClaudeCN",
    category: "third_party",
    icon: "🇨🇳",
    websiteUrl: "",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "cluadecn"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.cluadecn]\nname = "cluadecn"\nbase_url = ""\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "cubence",
    name: "Cubence",
    category: "third_party",
    icon: "💎",
    websiteUrl: "https://cubence.com",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "cubence"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.cubence]\nname = "cubence"\nbase_url = ""\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "aigocode",
    name: "AIGoCode",
    category: "third_party",
    icon: "🚀",
    websiteUrl: "",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "aigocode"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.aigocode]\nname = "aigocode"\nbase_url = ""\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "rightcode",
    name: "RightCode",
    category: "third_party",
    icon: "✅",
    websiteUrl: "",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "rightcode"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.rightcode]\nname = "rightcode"\nbase_url = ""\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "aicodemirror",
    name: "AICodeMirror",
    category: "third_party",
    icon: "🪞",
    websiteUrl: "",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: `model_provider = "aicodemirror"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.aicodemirror]\nname = "aicodemirror"\nbase_url = ""\nwire_api = "responses"\nrequires_openai_auth = true`,
  },
  {
    id: "custom",
    name: "自定义",
    category: "custom",
    icon: "⚙️",
    websiteUrl: "",
    apiKeyUrl: "",
    auth: { OPENAI_API_KEY: "" },
    config: DEFAULT_TOML,
  },
];

const CATEGORY_LABELS = {
  official: "官方",
  aggregator: "聚合",
  third_party: "第三方",
  custom: "自定义",
  dynamic: "动态",
};

// ==================== State ====================

const providers = ref([]);
const currentProviderId = ref(null);
const showDialog = ref(false);
const dialogMode = ref("create");
const showPresetDialog = ref(false);
const showImportDialog = ref(false);
const importString = ref("");
const fetchedModels = ref([]);
const fetchingModels = ref(false);
const presets = ref([]);
const presetsLoading = ref(false);
const presetsError = ref("");
const presetSearch = ref("");
const showTomlEditor = ref(false);
const showAuthEditor = ref(false);

// Guard refs to prevent infinite sync loops
const isUpdatingFromForm = ref(false);
const isUpdatingFromToml = ref(false);

const formData = ref({
  id: "",
  apiKey: "",
  baseUrl: "",
  model: "",
  wireApi: "responses",
  reasoningEffort: "high",
  config: DEFAULT_TOML,
  authJson: JSON.stringify(DEFAULT_AUTH, null, 2),
});

// ==================== Computed ====================

const dialogTitle = computed(() => (dialogMode.value === "edit" ? "编辑 Provider" : "新建 Provider"));

const filteredPresets = computed(() => {
  const search = presetSearch.value.toLowerCase().trim();
  if (!search) return [...BUILT_IN_PRESETS, ...presets.value];
  const all = [...BUILT_IN_PRESETS, ...presets.value];
  return all.filter(p => p.name.toLowerCase().includes(search) || p.id.toLowerCase().includes(search));
});

// ==================== Helpers ====================

const maskUrl = (url) => {
  if (!url) return "";
  if (url.length <= 40) return url;
  return url.substring(0, 37) + "...";
};

const getWireApiTheme = (wireApi) => {
  return wireApi === "chat" ? "warning" : "primary";
};

const getWireApiLabel = (wireApi) => {
  return wireApi === "chat" ? "Chat" : "Responses";
};

const getCategoryLabel = (category) => {
  return CATEGORY_LABELS[category] || category;
};

// ==================== Data Loading ====================

const loadProviders = () => {
  providers.value = window.services.getCodexProviders();
  currentProviderId.value = window.services.getCodexCurrentProvider();
};

// ==================== Provider CRUD ====================

const openCreateDialog = () => {
  formData.value = {
    id: "",
    apiKey: "",
    baseUrl: "",
    model: "gpt-5.4",
    wireApi: "responses",
    reasoningEffort: "high",
    config: DEFAULT_TOML,
    authJson: JSON.stringify(DEFAULT_AUTH, null, 2),
  };
  dialogMode.value = "create";
  showDialog.value = true;
  showTomlEditor.value = false;
  showAuthEditor.value = false;
  fetchedModels.value = [];
};

const openEditDialog = (provider) => {
  const config = provider.config || DEFAULT_TOML;
  const auth = provider.auth || { ...DEFAULT_AUTH };
  const baseUrl = window.services.extractCodexBaseUrl(config);
  const model = window.services.extractCodexModelName(config);
  const wireApi = window.services.extractCodexWireApi(config);
  const reasoningEffort = window.services.extractCodexReasoningEffort(config);
  const apiKey = auth.OPENAI_API_KEY || "";

  formData.value = {
    id: provider.id,
    apiKey,
    baseUrl,
    model,
    wireApi: wireApi || "responses",
    reasoningEffort: reasoningEffort || "high",
    config,
    authJson: JSON.stringify(auth, null, 2),
  };
  dialogMode.value = "edit";
  showDialog.value = true;
  showTomlEditor.value = false;
  showAuthEditor.value = false;
  fetchedModels.value = [];
};

const saveProvider = () => {
  const { id, config, authJson } = formData.value;
  if (!id.trim()) {
    MessagePlugin.warning("请输入 Provider ID");
    return;
  }

  let auth;
  try {
    auth = JSON.parse(authJson);
  } catch (e) {
    MessagePlugin.warning("Auth JSON 格式错误");
    return;
  }

  const providerData = { auth, config };
  const success = window.services.setCodexProvider(id, providerData);
  if (success) {
    MessagePlugin.success(dialogMode.value === "edit" ? "保存成功" : "创建成功");
    showDialog.value = false;
    loadProviders();
  } else {
    MessagePlugin.error("保存失败");
  }
};

const deleteProvider = (id) => {
  const success = window.services.removeCodexProvider(id);
  if (success) {
    if (currentProviderId.value === id) currentProviderId.value = null;
    loadProviders();
    MessagePlugin.success("删除成功");
  } else {
    MessagePlugin.error("删除失败");
  }
};

const activateProvider = (id) => {
  const success = window.services.setCodexCurrentProvider(id);
  if (success) {
    currentProviderId.value = id;
    loadProviders();
    MessagePlugin.success("切换成功");
  } else {
    MessagePlugin.error("切换失败，请检查配置文件");
  }
};

// ==================== Form ↔ TOML Sync ====================

const syncFormToToml = () => {
  if (isUpdatingFromToml.value) return;
  isUpdatingFromForm.value = true;

  let toml = formData.value.config;
  const { baseUrl, model, wireApi, reasoningEffort } = formData.value;

  if (baseUrl !== undefined) toml = window.services.setCodexBaseUrlInConfig(toml, baseUrl);
  if (model !== undefined) toml = window.services.setCodexModelNameInConfig(toml, model);
  if (wireApi !== undefined) toml = window.services.setCodexWireApiInConfig(toml, wireApi);
  if (reasoningEffort !== undefined) toml = window.services.setCodexReasoningEffortInConfig(toml, reasoningEffort);

  formData.value.config = toml;

  // Also sync apiKey to authJson
  try {
    const auth = JSON.parse(formData.value.authJson);
    auth.OPENAI_API_KEY = formData.value.apiKey;
    formData.value.authJson = JSON.stringify(auth, null, 2);
  } catch (e) { /* ignore parse errors during typing */ }

  nextTick(() => { isUpdatingFromForm.value = false; });
};

const syncTomlToForm = () => {
  if (isUpdatingFromForm.value) return;
  isUpdatingFromToml.value = true;

  const config = formData.value.config;
  formData.value.baseUrl = window.services.extractCodexBaseUrl(config);
  formData.value.model = window.services.extractCodexModelName(config);
  formData.value.wireApi = window.services.extractCodexWireApi(config) || "responses";
  formData.value.reasoningEffort = window.services.extractCodexReasoningEffort(config) || "high";

  nextTick(() => { isUpdatingFromToml.value = false; });
};

const handleApiKeyChange = (val) => {
  formData.value.apiKey = val;
  syncFormToToml();
};

const handleBaseUrlChange = (val) => {
  formData.value.baseUrl = val;
  syncFormToToml();
};

const handleModelChange = (val) => {
  formData.value.model = val;
  syncFormToToml();
};

const handleWireApiChange = (val) => {
  formData.value.wireApi = val;
  syncFormToToml();
};

const handleReasoningEffortChange = (val) => {
  formData.value.reasoningEffort = val;
  syncFormToToml();
};

const handleTomlChange = (val) => {
  formData.value.config = val;
  syncTomlToForm();
};

const handleAuthJsonChange = (val) => {
  formData.value.authJson = val;
  try {
    const auth = JSON.parse(val);
    if (auth.OPENAI_API_KEY !== undefined) {
      formData.value.apiKey = auth.OPENAI_API_KEY;
    }
  } catch (e) { /* ignore */ }
};

// ==================== Fetch Models ====================

const fetchModels = async () => {
  const { baseUrl, apiKey } = formData.value;
  if (!baseUrl) {
    MessagePlugin.warning("请先填写 Base URL");
    return;
  }
  fetchingModels.value = true;
  fetchedModels.value = [];
  try {
    const models = await window.services.fetchModelsForCodex(baseUrl, apiKey);
    fetchedModels.value = models.map(m => ({ label: m, value: m }));
    if (models.length === 0) MessagePlugin.info("未找到可用模型");
  } catch (e) {
    MessagePlugin.error("获取模型列表失败: " + (e.message || "未知错误"));
  } finally {
    fetchingModels.value = false;
  }
};

// ==================== Presets ====================

const openPresetDialog = () => {
  showPresetDialog.value = true;
  presetSearch.value = "";
  if (presets.value.length === 0) fetchPresets();
};

const fetchPresets = async () => {
  presetsLoading.value = true;
  presetsError.value = "";
  try {
    const apiData = await window.services.fetchModelsDevPresets();
    const dynamicPresets = [];
    if (apiData && typeof apiData === 'object') {
      for (const [providerId, provider] of Object.entries(apiData)) {
        if (!provider.api_base_url || !provider.name) continue;
        const models = provider.models || {};
        const modelNames = Object.keys(models);
        if (modelNames.length === 0) continue;
        dynamicPresets.push({
          id: `dynamic-${providerId}`,
          name: provider.name,
          category: "dynamic",
          icon: "🔗",
          websiteUrl: provider.url || "",
          apiKeyUrl: "",
          auth: { OPENAI_API_KEY: "" },
          config: `model_provider = "${providerId}"\nmodel = "${modelNames[0]}"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.${providerId}]\nname = "${provider.name}"\nbase_url = "${provider.api_base_url}"\nwire_api = "responses"\nrequires_openai_auth = true`,
          _modelNames: modelNames,
        });
      }
    }
    presets.value = dynamicPresets;
  } catch (e) {
    presetsError.value = "加载预设失败: " + (e.message || "未知错误");
  } finally {
    presetsLoading.value = false;
  }
};

const applyPreset = (preset) => {
  const config = preset.config;
  const auth = preset.auth || { ...DEFAULT_AUTH };

  formData.value.id = preset.id;
  formData.value.apiKey = auth.OPENAI_API_KEY || "";
  formData.value.baseUrl = window.services.extractCodexBaseUrl(config);
  formData.value.model = window.services.extractCodexModelName(config);
  formData.value.wireApi = window.services.extractCodexWireApi(config) || "responses";
  formData.value.reasoningEffort = window.services.extractCodexReasoningEffort(config) || "high";
  formData.value.config = config;
  formData.value.authJson = JSON.stringify(auth, null, 2);
  fetchedModels.value = [];
  showPresetDialog.value = false;
};

// ==================== Import/Export ====================

const handleExport = () => {
  try {
    const list = providers.value.map(p => ({ id: p.id, auth: p.auth, config: p.config }));
    const compressed = window.services.compressConfigs(list);
    window.utools.copyText(compressed);
    MessagePlugin.success("已复制到剪贴板");
  } catch (e) {
    MessagePlugin.error("导出失败");
  }
};

const openImportDialog = () => {
  importString.value = "";
  showImportDialog.value = true;
};

const handleImport = () => {
  if (!importString.value.trim()) {
    MessagePlugin.warning("请粘贴配置字符串");
    return;
  }
  try {
    const list = window.services.decompressConfigs(importString.value.trim());
    if (!Array.isArray(list)) {
      MessagePlugin.error("配置格式错误");
      return;
    }
    let count = 0;
    for (const item of list) {
      if (!item.id) continue;
      const success = window.services.setCodexProvider(item.id, { auth: item.auth, config: item.config });
      if (success) count++;
    }
    showImportDialog.value = false;
    loadProviders();
    MessagePlugin.success(`成功导入 ${count} 个配置`);
  } catch (e) {
    MessagePlugin.error("导入失败: " + (e.message || "格式错误"));
  }
};

// ==================== Misc ====================

const openConfigDir = () => {
  window.utools.shellOpenPath(window.services.getCodexDir());
};

onMounted(() => {
  loadProviders();
});
</script>
```

- [ ] **Step 4: Add the template section**

Append the `<template>` section to `CodexConfigView.vue`:

```html

<template>
  <div class="codex-config-view">
    <!-- Header -->
    <div class="codex-section-header">
      <div style="display: flex; gap: 8px;">
        <Button size="small" theme="primary" @click="openCreateDialog">
          <template #icon><AddIcon /></template> 新建
        </Button>
        <Button size="small" variant="outline" @click="openPresetDialog">
          预设
        </Button>
        <Button size="small" variant="outline" @click="openImportDialog">
          <template #icon><UploadIcon /></template> 导入
        </Button>
        <Button size="small" variant="outline" @click="handleExport">
          <template #icon><DownloadIcon /></template> 导出
        </Button>
      </div>
      <Button size="small" variant="text" @click="openConfigDir">
        <template #icon><FolderIcon /></template> 打开配置目录
      </Button>
    </div>

    <!-- Provider List -->
    <div v-if="providers.length === 0" class="codex-empty-state">
      <Empty description="暂无 Codex 配置，点击「新建」或「预设」添加" />
    </div>
    <div v-else class="codex-provider-list">
      <div
        v-for="provider in providers"
        :key="provider.id"
        class="codex-provider-card"
        :class="{ 'codex-provider-card--active': currentProviderId === provider.id }"
      >
        <div class="codex-provider-card-header">
          <div class="codex-provider-card-info">
            <span class="codex-provider-id">{{ provider.id }}</span>
            <Tag
              v-if="currentProviderId === provider.id"
              size="small"
              theme="primary"
              variant="light"
            >当前</Tag>
            <Tag
              size="small"
              :theme="getWireApiTheme(window.services.extractCodexWireApi(provider.config))"
              variant="light"
            >{{ getWireApiLabel(window.services.extractCodexWireApi(provider.config)) }}</Tag>
          </div>
          <Space size="small">
            <Button
              size="small"
              variant="text"
              theme="primary"
              :disabled="currentProviderId === provider.id"
              @click="activateProvider(provider.id)"
            >切换</Button>
            <Button size="small" variant="text" @click="openEditDialog(provider)">
              <template #icon><EditIcon /></template>
            </Button>
            <Popconfirm content="确认删除此配置？" @confirm="deleteProvider(provider.id)">
              <Button size="small" variant="text" theme="danger">
                <template #icon><DeleteIcon /></template>
              </Button>
            </Popconfirm>
          </Space>
        </div>
        <div class="codex-provider-card-body">
          <div class="codex-provider-name">{{ window.services.extractCodexProviderName(provider.config) || window.services.extractCodexModelName(provider.config) || provider.id }}</div>
          <div class="codex-provider-tags">
            <Tag size="small" variant="light">{{ window.services.extractCodexModelName(provider.config) || "未设置模型" }}</Tag>
          </div>
          <div v-if="window.services.extractCodexBaseUrl(provider.config)" class="codex-provider-url">
            {{ maskUrl(window.services.extractCodexBaseUrl(provider.config)) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Edit/Create Dialog -->
    <Dialog
      v-model:visible="showDialog"
      :header="dialogTitle"
      :width="640"
      :footer="false"
      :destroy-on-close="true"
    >
      <div class="codex-form">
        <!-- Provider ID -->
        <div class="codex-form-item">
          <label><span class="required">*</span> Provider ID</label>
          <Input
            v-model="formData.id"
            placeholder="e.g. my-provider"
            :disabled="dialogMode === 'edit'"
            style="flex: 1;"
          />
        </div>

        <!-- API Key -->
        <div class="codex-form-item">
          <label>API Key</label>
          <div style="flex: 1;">
            <ApiKeyInput v-model="formData.apiKey" @change="handleApiKeyChange" />
          </div>
        </div>

        <!-- Base URL -->
        <div class="codex-form-item">
          <label>Base URL</label>
          <Input
            v-model="formData.baseUrl"
            placeholder="https://api.example.com/v1"
            style="flex: 1;"
            @change="handleBaseUrlChange"
          />
        </div>

        <!-- Model + Fetch -->
        <div class="codex-form-item">
          <label>Model</label>
          <div class="codex-model-row">
            <Select
              v-if="fetchedModels.length > 0"
              v-model="formData.model"
              :options="fetchedModels"
              filterable
              creatable
              style="flex: 1;"
              @change="handleModelChange"
            />
            <Input
              v-else
              v-model="formData.model"
              placeholder="e.g. gpt-5.4"
              style="flex: 1;"
              @change="handleModelChange"
            />
            <Button
              size="small"
              variant="outline"
              class="codex-fetch-btn"
              :loading="fetchingModels"
              @click="fetchModels"
            >Fetch Models</Button>
          </div>
        </div>

        <!-- API Format -->
        <div class="codex-form-item">
          <label>API Format</label>
          <Select
            v-model="formData.wireApi"
            :options="WIRE_API_OPTIONS"
            style="flex: 1;"
            @change="handleWireApiChange"
          />
        </div>

        <!-- Reasoning Effort -->
        <div class="codex-form-item">
          <label>Reasoning</label>
          <Select
            v-model="formData.reasoningEffort"
            :options="REASONING_EFFORT_OPTIONS"
            style="flex: 1;"
            @change="handleReasoningEffortChange"
          />
        </div>

        <!-- TOML Raw Editor -->
        <div class="codex-form-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span class="codex-form-section-title">TOML 配置 (config.toml)</span>
            <Button size="small" variant="text" @click="showTomlEditor = !showTomlEditor">
              {{ showTomlEditor ? '收起' : '展开' }}
              <template #icon><ChevronDownIcon :style="{ transform: showTomlEditor ? 'rotate(180deg)' : '' }" /></template>
            </Button>
          </div>
          <Textarea
            v-if="showTomlEditor"
            v-model="formData.config"
            :autosize="{ minRows: 8, maxRows: 20 }"
            class="codex-raw-editor"
            @change="handleTomlChange"
          />
        </div>

        <!-- Auth JSON Raw Editor -->
        <div class="codex-form-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span class="codex-form-section-title">Auth JSON (auth.json)</span>
            <Button size="small" variant="text" @click="showAuthEditor = !showAuthEditor">
              {{ showAuthEditor ? '收起' : '展开' }}
              <template #icon><ChevronDownIcon :style="{ transform: showAuthEditor ? 'rotate(180deg)' : '' }" /></template>
            </Button>
          </div>
          <Textarea
            v-if="showAuthEditor"
            v-model="formData.authJson"
            :autosize="{ minRows: 3, maxRows: 10 }"
            class="codex-raw-editor"
            @change="handleAuthJsonChange"
          />
        </div>

        <!-- Dialog Footer -->
        <div class="codex-dialog-footer">
          <div></div>
          <div class="codex-dialog-footer-right">
            <Button variant="outline" @click="showDialog = false">取消</Button>
            <Button theme="primary" @click="saveProvider">保存</Button>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Preset Dialog -->
    <Dialog
      v-model:visible="showPresetDialog"
      header="选择预设"
      :width="520"
      :footer="false"
      :destroy-on-close="true"
    >
      <div class="codex-preset-toolbar">
        <Input
          v-model="presetSearch"
          placeholder="搜索预设..."
          class="codex-preset-search"
          clearable
        >
          <template #prefixIcon><SearchIcon /></template>
        </Input>
        <Button size="small" variant="outline" @click="fetchPresets" :loading="presetsLoading">
          <template #icon><RefreshIcon /></template>
        </Button>
      </div>

      <div v-if="presetsLoading" class="codex-preset-loading">
        <Loading size="small" /> 加载中...
      </div>
      <div v-else-if="presetsError" class="codex-preset-error">
        {{ presetsError }}
        <Button size="small" @click="fetchPresets">重试</Button>
      </div>
      <div v-else-if="filteredPresets.length === 0" class="codex-preset-empty">
        未找到匹配的预设
      </div>
      <div v-else class="codex-preset-list">
        <div
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="codex-preset-item"
          @click="applyPreset(preset)"
        >
          <div class="codex-preset-name">{{ preset.icon }} {{ preset.name }}</div>
          <div class="codex-preset-desc">
            <Tag size="small" variant="light">{{ getCategoryLabel(preset.category) }}</Tag>
            <span v-if="preset._modelNames" class="codex-preset-url">{{ preset._modelNames.length }} 个模型</span>
            <span v-else-if="window.services.extractCodexBaseUrl(preset.config)" class="codex-preset-url">
              {{ maskUrl(window.services.extractCodexBaseUrl(preset.config)) }}
            </span>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Import Dialog -->
    <Dialog
      v-model:visible="showImportDialog"
      header="导入配置"
      :width="480"
      :footer="false"
      :destroy-on-close="true"
    >
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <Textarea
          v-model="importString"
          placeholder="粘贴压缩后的配置字符串..."
          :autosize="{ minRows: 4, maxRows: 10 }"
          class="codex-import-textarea"
        />
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <Button variant="outline" @click="showImportDialog = false">取消</Button>
          <Button theme="primary" @click="handleImport">导入</Button>
        </div>
      </div>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/Switch/CodexConfigView.vue
git commit -m "feat: add CodexConfigView with provider CRUD, presets, fetch models"
```

---

### Task 6: Build verification and final integration test

**Files:**
- All files from previous tasks

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Verify all new files exist**

Run: `ls -la public/preload/services/codex.js public/logo-codex.png src/Switch/CodexConfigView.vue src/Switch/styles/CodexConfigView.css`
Expected: All 4 files exist

- [ ] **Step 3: Verify services.js exports codex functions**

Run: `grep -c "getCodexDir\|fetchModelsForCodex\|setCodexCurrentProvider" public/preload/services.js`
Expected: 3 (one for each function)

- [ ] **Step 4: Verify index.vue has Codex references**

Run: `grep -c "isCodex\|CodexConfigView\|logo-codex" src/Switch/index.vue`
Expected: ≥3

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: final integration fixes for Codex Phase 1"
```
