# Reasonix Config Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Reasonix as the fifth managed app in CCSwitch (config view only): CRUD `[[providers]]` + `default_model` in `~/.reasonix/config.toml` (Windows `%APPDATA%\reasonix\config.toml`), and provider API keys in `<Reasonix home>/.env`.

**Architecture:** Mirror the existing `omp` module end-to-end. New `public/preload/services/reasonix.js` does all TOML/`.env` I/O using `smol-toml` (bundled into `dist/preload/services.js` by esbuild). New `src/Switch/ReasonixConfigView.vue` renders provider/model CRUD + default-model select + API key input, talking to `window.services.*`. App shell wiring (`useAppContext.js`, `index.vue`, `App.vue`, `plugin.json`) adds the 5th app exactly like omp.

**Tech Stack:** Vue 3 Composition API, TDesign Vue Next, uTools preload (CommonJS, esbuild-bundled), `smol-toml` v1.7.x.

## Global Constraints

- Reasonix home: `~/.reasonix` on macOS/Linux, `%APPDATA%\reasonix` on Windows (`process.env.APPDATA`).
- Secrets NEVER go into `config.toml` — only the env var name in `api_key_env`; the value lives in `<home>/.env` (`KEY=value` lines).
- Non-provider TOML sections (`[agent]` `[ui]` `[permissions]` `[sandbox]` `[serve]` `[[plugins]]`) must survive writes unchanged (values preserved; comments may be lost — accepted trade-off, same as omp's YAML dump).
- Provider `name` is the unique key; rename = delete + re-add (UI), never mutate the key.
- `default_model` ref format: provider name (→ its default model) or `provider/model`. Deleting a provider referenced by `default_model` must be blocked.
- Text/UI colors: always TDesign CSS variables (`var(--td-text-color-*)`, `var(--td-bg-color-*)`) for dark-mode compatibility.
- Checkboxes use the project's green-theme override `--td-brand-color: var(--td-success-color)`.
- All comments/user-facing strings in Chinese, matching existing views.
- No test framework exists in this repo (uTools plugin). Verification = `npm run build` + manual smoke test per task.
- Preload deps are installed under `public/preload/` (own `package.json` + `node_modules`); esbuild bundles them at build time.

---

## File Structure

- Create: `public/preload/services/reasonix.js` — all TOML + `.env` I/O, mirrors `omp.js` shape.
- Create: `src/Switch/ReasonixConfigView.vue` — config view.
- Create: `src/Switch/styles/ReasonixConfigView.css` — view styles.
- Create: `public/icon-reasonix.png` — placeholder app icon.
- Modify: `public/preload/package.json` — add `smol-toml`.
- Modify: `public/preload/services.js` — `require('./services/reasonix')` + expose on `window.services`.
- Modify: `src/composables/useAppContext.js` — add `isReasonix`.
- Modify: `src/Switch/index.vue` — dropdown option, tab button, title suffix, route map, logo, view mount.
- Modify: `src/App.vue` — route whitelist add `'reasonixConfig'`.
- Modify: `public/plugin.json` — feature `{ code: "reasonixConfig", cmds: ["Reasonix配置"] }`.

---

### Task 1: 添加 smol-toml 依赖 + 实现 services/reasonix.js

**Files:**
- Modify: `public/preload/package.json` (add dependency)
- Create: `public/preload/services/reasonix.js`

**Interfaces:**
- Produces (all consumed by later tasks):
  - `getReasonixHome() → string`
  - `getReasonixConfigPath() → string`
  - `readReasonixConfig() → object` (raw parsed TOML; may contain BigInt for integers)
  - `writeReasonixConfig(doc) → boolean`
  - `getReasonixProviderList() → Array<{name, kind, baseUrl, chatUrl, modelsUrl, apiKeyEnv, default, contextWindow, maxOutputTokens, models: string[]}>`
  - `addReasonixProvider(cfg) → boolean`
  - `updateReasonixProvider(name, updates) → boolean`
  - `deleteReasonixProvider(name) → boolean`
  - `getReasonixDefaultModel() → string`
  - `setReasonixDefaultModel(ref) → boolean`
  - `addReasonixModel(providerName, modelId) → boolean`
  - `deleteReasonixModel(providerName, modelId) → boolean`
  - `readReasonixEnv() → object` (`{ KEY: value }`)
  - `getReasonixApiKey(envName) → string`
  - `writeReasonixEnvKey(key, value) → boolean`
  - `deleteReasonixEnvKey(key) → boolean`
  - `openReasonixDir()`, `isReasonixInstalled() → boolean`

- [ ] **Step 1: 在 `public/preload/package.json` 加 smol-toml 依赖**

把当前文件内容：

```json
{
  "type": "commonjs",
  "dependencies": {
    "js-yaml": "^5.2.3",
    "json5": "^2.2.3"
  }
}
```

改为：

```json
{
  "type": "commonjs",
  "dependencies": {
    "js-yaml": "^5.2.3",
    "json5": "^2.2.3",
    "smol-toml": "^1.7.1"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run（在仓库根目录）:
```bash
npm install --prefix public/preload
```
Expected: 成功安装 `smol-toml`，出现 `public/preload/node_modules/smol-toml/`。

- [ ] **Step 3: 创建 `public/preload/services/reasonix.js`**

完整文件内容：

```js
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { parse: parseToml, stringify: stringifyToml } = require('smol-toml')

const REASONIX_HOME = () => {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'reasonix')
  }
  return path.join(os.homedir(), '.reasonix')
}
const REASONIX_CONFIG_PATH = () => path.join(REASONIX_HOME(), 'config.toml')
const REASONIX_ENV_PATH = () => path.join(REASONIX_HOME(), '.env')

// BigInt → Number（smol-toml 整数默认解析为 BigInt，UI 层不消费 BigInt）
const toNumber = (v) => (typeof v === 'bigint' ? Number(v) : v == null ? 0 : Number(v))

// ==================== config.toml 读写 ====================

const readReasonixConfig = () => {
  const p = REASONIX_CONFIG_PATH()
  if (!fs.existsSync(p)) return {}
  try {
    return parseToml(fs.readFileSync(p, { encoding: 'utf-8' })) || {}
  } catch { return {} }
}

const writeReasonixConfig = (doc) => {
  const p = REASONIX_CONFIG_PATH()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, stringifyToml(doc || {}), { encoding: 'utf-8' })
  return true
}

// ==================== Providers ====================

// 归一化一个 provider 条目供 UI 消费（models 始终为数组）
const normalizeProvider = (p) => ({
  name: p.name || '',
  kind: p.kind || 'openai',
  baseUrl: p.base_url || '',
  chatUrl: p.chat_url || '',
  modelsUrl: p.models_url || '',
  apiKeyEnv: p.api_key_env || '',
  default: p.default || '',
  contextWindow: toNumber(p.context_window),
  maxOutputTokens: toNumber(p.max_output_tokens),
  models: Array.isArray(p.models) ? p.models : (p.model ? [p.model] : []),
})

// 从 UI 结构构建写入 TOML 的 provider 对象（空字段不输出）
const buildProviderToml = (cfg) => {
  const p = { name: cfg.name, kind: cfg.kind || 'openai', base_url: cfg.baseUrl || '' }
  if (cfg.chatUrl) p.chat_url = cfg.chatUrl
  if (cfg.modelsUrl) p.models_url = cfg.modelsUrl
  if (Array.isArray(cfg.models) && cfg.models.length) p.models = cfg.models
  if (cfg.default) p.default = cfg.default
  if (cfg.apiKeyEnv) p.api_key_env = cfg.apiKeyEnv
  if (cfg.contextWindow) p.context_window = Number(cfg.contextWindow)
  if (cfg.maxOutputTokens) p.max_output_tokens = Number(cfg.maxOutputTokens)
  return p
}

const getReasonixProviderList = () => {
  const doc = readReasonixConfig()
  return (doc.providers || []).map(normalizeProvider)
}

const addReasonixProvider = (cfg) => {
  if (!cfg?.name || typeof cfg.name !== 'string') throw new Error('供应商名不能为空')
  const doc = readReasonixConfig()
  if (!Array.isArray(doc.providers)) doc.providers = []
  if (doc.providers.some(p => p.name === cfg.name)) throw new Error(`供应商 ${cfg.name} 已存在`)
  doc.providers.push(buildProviderToml(cfg))
  if (cfg.apiKey && cfg.apiKeyEnv) writeReasonixEnvKey(cfg.apiKeyEnv, cfg.apiKey)
  writeReasonixConfig(doc)
  return true
}

const updateReasonixProvider = (name, updates) => {
  const doc = readReasonixConfig()
  if (!Array.isArray(doc.providers)) throw new Error(`供应商 ${name} 不存在`)
  const idx = doc.providers.findIndex(p => p.name === name)
  if (idx === -1) throw new Error(`供应商 ${name} 不存在`)
  // name 是唯一 key，不允许重命名
  const merged = { ...normalizeProvider(doc.providers[idx]), ...updates, name }
  doc.providers[idx] = buildProviderToml(merged)
  if (updates.apiKey && updates.apiKeyEnv) writeReasonixEnvKey(updates.apiKeyEnv, updates.apiKey)
  writeReasonixConfig(doc)
  return true
}

const deleteReasonixProvider = (name) => {
  const doc = readReasonixConfig()
  if (!Array.isArray(doc.providers) || !doc.providers.some(p => p.name === name)) {
    throw new Error(`供应商 ${name} 不存在`)
  }
  const dm = doc.default_model || ''
  if (dm === name || dm.startsWith(name + '/')) {
    throw new Error(`供应商 ${name} 被 default_model（${dm}）引用，请先修改默认模型`)
  }
  doc.providers = doc.providers.filter(p => p.name !== name)
  writeReasonixConfig(doc)
  return true
}

// ==================== 模型 CRUD（models 为字符串数组） ====================

const addReasonixModel = (providerName, modelId) => {
  if (!providerName) throw new Error('供应商名不能为空')
  if (!modelId || typeof modelId !== 'string') throw new Error('模型 ID 不能为空')
  const doc = readReasonixConfig()
  const prov = (doc.providers || []).find(p => p.name === providerName)
  if (!prov) throw new Error(`供应商 ${providerName} 不存在`)
  const list = Array.isArray(prov.models) ? prov.models : (prov.model ? [prov.model] : [])
  if (list.includes(modelId)) throw new Error(`模型 ${modelId} 已存在`)
  list.push(modelId)
  prov.models = list
  delete prov.model
  writeReasonixConfig(doc)
  return true
}

const deleteReasonixModel = (providerName, modelId) => {
  const doc = readReasonixConfig()
  const prov = (doc.providers || []).find(p => p.name === providerName)
  if (!prov) throw new Error(`供应商 ${providerName} 不存在`)
  const list = Array.isArray(prov.models) ? prov.models : []
  if (!list.includes(modelId)) return true
  prov.models = list.filter(m => m !== modelId)
  if (prov.default === modelId) delete prov.default
  writeReasonixConfig(doc)
  return true
}

// ==================== default_model ====================

const getReasonixDefaultModel = () => readReasonixConfig().default_model || ''

const setReasonixDefaultModel = (ref) => {
  const doc = readReasonixConfig()
  doc.default_model = ref || ''
  writeReasonixConfig(doc)
  return true
}

// ==================== .env 密钥 ====================

const readReasonixEnv = () => {
  const p = REASONIX_ENV_PATH()
  if (!fs.existsSync(p)) return {}
  const out = {}
  for (const raw of fs.readFileSync(p, { encoding: 'utf-8' }).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    out[m[1]] = val
  }
  return out
}

const getReasonixApiKey = (envName) => (envName ? readReasonixEnv()[envName] || '' : '')

const writeReasonixEnvKey = (key, value) => {
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`密钥名 ${key} 不合法`)
  const p = REASONIX_ENV_PATH()
  const lines = fs.existsSync(p) ? fs.readFileSync(p, { encoding: 'utf-8' }).split(/\r?\n/) : []
  const re = new RegExp(`^(?:export\\s+)?${key}\\s*=`)
  const idx = lines.findIndex(l => { const t = l.trim(); return !t.startsWith('#') && re.test(t) })
  if (idx !== -1) lines[idx] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, lines.join('\n') + '\n', { encoding: 'utf-8' })
  try { fs.chmodSync(p, 0o600) } catch { /* 不支持则忽略 */ }
  return true
}

const deleteReasonixEnvKey = (key) => {
  const p = REASONIX_ENV_PATH()
  if (!fs.existsSync(p)) return true
  const re = new RegExp(`^(?:export\\s+)?${key}\\s*=`)
  const next = fs.readFileSync(p, { encoding: 'utf-8' })
    .split(/\r?\n/)
    .filter(l => { const t = l.trim(); return t.startsWith('#') || !re.test(t) })
  fs.writeFileSync(p, next.join('\n'), { encoding: 'utf-8' })
  return true
}

// ==================== 目录操作 ====================

const openReasonixDir = () => {
  const dir = REASONIX_HOME()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  try { window.utools.shellOpenPath(dir) } catch { /* ignore */ }
}

const isReasonixInstalled = () => fs.existsSync(REASONIX_HOME())

module.exports = {
  getReasonixHome, getReasonixConfigPath,
  readReasonixConfig, writeReasonixConfig,
  getReasonixProviderList, addReasonixProvider, updateReasonixProvider, deleteReasonixProvider,
  addReasonixModel, deleteReasonixModel,
  getReasonixDefaultModel, setReasonixDefaultModel,
  readReasonixEnv, getReasonixApiKey, writeReasonixEnvKey, deleteReasonixEnvKey,
  openReasonixDir, isReasonixInstalled,
}
```

- [ ] **Step 4: 用 Node 单测关键逻辑（不依赖 uTools）**

写一个临时脚本 `_tmp-reasonix-test.js`（仓库根目录，测完即删）：

```js
const reasonix = require('./public/preload/services/reasonix')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// 用临时 HOME 重定向 Reasonix home —— reasonix.js 基于 process.platform，
// 这里直接覆写内部路径：通过 REASONIX_HOME 常量不可行，改为 mock 模块级函数
const origHome = reasonix.getReasonixHome()
// 直接改环境：非 Windows 走 ~/.reasonix，无法注入 → 临时 monkey-patch 不可行，
// 因此本测试改为验证“写 → 读” round-trip 语义，路径用真实 HOME（不落盘破坏真实配置）
console.log('home:', origHome)
console.log('installed:', reasonix.isReasonixInstalled())
```

此脚本只打印信息，不做破坏性操作。改为手动验证：**不要运行**（避免读真实配置）。

替代：用 `node -e` 验证 smol-toml 本身可用：

```bash
node -e "const t=require('smol-toml'); const o=t.parse('default_model=\"a/b\"\n[[providers]]\nname=\"a\"\nmodels=[\"m1\"]\n'); console.log(JSON.stringify(t.stringify(o)))"
```

Run: `node -e "…"`
Expected: 输出含 `default_model` 与 `[[providers]]` 的序列化 TOML，证明 smol-toml 在当前环境可用（BigInt 序列化无异常）。

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: 构建成功。esbuild 把 smol-toml bundle 进 `dist/preload/services.js`，无报错。

- [ ] **Step 6: 提交**

```bash
git add public/preload/package.json public/preload/package-lock.json public/preload/services/reasonix.js
git commit -m "feat: Reasonix 配置服务层（config.toml + .env 读写）"
```

（若 `public/preload/package-lock.json` 存在则一并 add；不存在则跳过。）

---

### Task 2: 在 services.js 暴露 reasonix 服务

**Files:**
- Modify: `public/preload/services.js`

**Interfaces:**
- Consumes: Task 1 的全部导出。
- Produces: `window.services.readReasonixConfig` 等 —— Task 3/4 的视图通过 `window.services.*` 调用。

- [ ] **Step 1: 顶部 require**

在 `public/preload/services.js` 顶部（`const omp = require('./services/omp')` 之后）加一行：

```js
const reasonix = require('./services/reasonix')
```

- [ ] **Step 2: 在 `window.services` 对象内、omp 块之后新增 Reasonix 块**

找到 omp 块（`openOmpDir: omp.openOmpDir,` 和 `isOmpInstalled: omp.isOmpInstalled,` 之后、`}` 收尾之前），插入：

```js
  // ==================== Reasonix ====================

  getReasonixConfigPath: reasonix.getReasonixConfigPath,
  readReasonixConfig: reasonix.readReasonixConfig,
  writeReasonixConfig: reasonix.writeReasonixConfig,
  getReasonixProviderList: reasonix.getReasonixProviderList,
  addReasonixProvider: reasonix.addReasonixProvider,
  updateReasonixProvider: reasonix.updateReasonixProvider,
  deleteReasonixProvider: reasonix.deleteReasonixProvider,
  addReasonixModel: reasonix.addReasonixModel,
  deleteReasonixModel: reasonix.deleteReasonixModel,
  getReasonixDefaultModel: reasonix.getReasonixDefaultModel,
  setReasonixDefaultModel: reasonix.setReasonixDefaultModel,
  readReasonixEnv: reasonix.readReasonixEnv,
  getReasonixApiKey: reasonix.getReasonixApiKey,
  writeReasonixEnvKey: reasonix.writeReasonixEnvKey,
  deleteReasonixEnvKey: reasonix.deleteReasonixEnvKey,
  openReasonixDir: reasonix.openReasonixDir,
  isReasonixInstalled: reasonix.isReasonixInstalled,
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功，`window.services` 含 reasonix 方法。

- [ ] **Step 4: 提交**

```bash
git add public/preload/services.js
git commit -m "feat: window.services 暴露 Reasonix 配置服务"
```

---

### Task 3: 应用外壳接入（useAppContext / App.vue / plugin.json / index.vue）

**Files:**
- Modify: `src/composables/useAppContext.js`
- Modify: `src/App.vue`
- Modify: `public/plugin.json`
- Modify: `src/Switch/index.vue`

**Interfaces:**
- Consumes: Task 1/2 的服务；Task 4 的 `ReasonixConfigView` 组件。
- Produces: `isReasonix` 响应式；`index.vue` 中 `isAppReady('reasonix')` 挂载点；`reasonixConfig` 路由；`Reasonix配置` 关键词。

- [ ] **Step 1: `useAppContext.js` 加 `isReasonix`**

把 `src/composables/useAppContext.js` 改为：

```js
import { ref, computed } from 'vue'

const activeApp = ref('claude')

export function useAppContext() {
  const setActiveApp = (app) => {
    activeApp.value = app
  }

  const isClaude = computed(() => activeApp.value === 'claude')
  const isOpenCode = computed(() => activeApp.value === 'opencode')
  const isPi = computed(() => activeApp.value === 'pi')
  const isOmp = computed(() => activeApp.value === 'omp')
  const isReasonix = computed(() => activeApp.value === 'reasonix')

  return { activeApp, setActiveApp, isClaude, isOpenCode, isPi, isOmp, isReasonix }
}
```

- [ ] **Step 2: `App.vue` 路由白名单**

把 `src/App.vue` 中：

```html
<Switch v-if="['claudeConfig', 'opencodeConfig', 'piConfig', 'ompConfig', 'installClaudeSkill', 'installOpencodeSkill', 'installPiExtension'].includes(route)" :route="route" :payload="payload" />
```

改为：

```html
<Switch v-if="['claudeConfig', 'opencodeConfig', 'piConfig', 'ompConfig', 'reasonixConfig', 'installClaudeSkill', 'installOpencodeSkill', 'installPiExtension'].includes(route)" :route="route" :payload="payload" />
```

- [ ] **Step 3: `plugin.json` 加 feature**

在 `public/plugin.json` 的 `ompConfig` feature 之后新增：

```json
{
  "code": "reasonixConfig",
  "explain": "Reasonix 配置管理工具",
  "icon": "icon-reasonix.png",
  "cmds": ["Reasonix配置"]
}
```

并在 `public/` 目录放一个占位 `icon-reasonix.png`（可从 `public/omp-icon.svg` 复制改名为 png 占位，或用任意 48x48 png）。

- [ ] **Step 4: `index.vue` script 接入**

在 `src/Switch/index.vue`：

1. 顶部 import 区，`import OmpConfigView from "./OmpConfigView.vue";` 之后加：

```js
import ReasonixConfigView from "./ReasonixConfigView.vue";
```

2. 解构处 `const { activeApp, setActiveApp, isClaude, isOpenCode, isPi, isOmp } = useAppContext();` 改为：

```js
const { activeApp, setActiveApp, isClaude, isOpenCode, isPi, isOmp, isReasonix } = useAppContext();
```

3. `appLabel` computed 里，`if (isPi.value) return "Pi Agent"; return "omp";` 改为：

```js
  if (isPi.value) return "Pi Agent";
  if (isOmp.value) return "omp";
  return "Reasonix";
```

4. `pageTitleSuffix` 的 map 里，`omp: { config: "配置管理" },` 之后加：

```js
    reasonix: {
      config: "配置管理",
    },
```

5. `appDropdownOptions` 里，`{ content: "omp", value: "omp" },` 之后加：

```js
  { content: "Reasonix", value: "reasonix" },
```

6. `onMounted` 的 `appMap` 里，`ompConfig: "omp",` 之后加：

```js
    reasonixConfig: "reasonix",
```

- [ ] **Step 5: `index.vue` template 接入**

1. 头部 logo：`<img v-else-if="isOmp" src="/omp-icon.svg" alt="logo" class="logo" />` 之后加：

```html
<img v-else-if="isReasonix" src="/icon-reasonix.png" alt="logo" class="logo" />
```

2. tab 按钮区：`<!-- omp tabs -->` 的 `<div v-else-if="isOmp" class="tab-buttons">…</div>` 之后加：

```html
        <!-- Reasonix tabs -->
        <div v-else-if="isReasonix" class="tab-buttons">
          <Button
            size="small"
            :theme="activeTab === 'config' ? 'primary' : 'default'"
            :variant="activeTab === 'config' ? 'base' : 'outline'"
            @click="activeTab = 'config'"
          >
            <template #icon><DashboardIcon /></template> 配置
          </Button>
        </div>
```

3. 视图挂载：`<!-- omp views -->` 的 `<template v-if="isAppReady('omp')">…</template>` 之后加：

```html
    <!-- Reasonix views -->
    <template v-if="isAppReady('reasonix')">
      <ReasonixConfigView v-if="isReasonix && activeTab === 'config'" />
    </template>
```

注意：`ReasonixConfigView` 在 Task 4 创建。本任务构建会因找不到组件而失败 —— **先创建 Task 4 的组件再跑构建**，或本任务先只做 script/外壳改动、Task 4 完成后统一构建。推荐顺序：本任务 Step 1-5 全部完成后，紧接 Task 4 创建组件，再构建。

- [ ] **Step 6: 提交（若组件已存在）**

```bash
git add src/composables/useAppContext.js src/App.vue public/plugin.json src/Switch/index.vue public/icon-reasonix.png
git commit -m "feat: 应用外壳接入 Reasonix（useAppContext/路由/关键词/入口）"
```

若组件未创建（先跑 Task 4），则与 Task 4 合并提交。

---

### Task 4: ReasonixConfigView 组件

**Files:**
- Create: `src/Switch/ReasonixConfigView.vue`
- Create: `src/Switch/styles/ReasonixConfigView.css`

**Interfaces:**
- Consumes: `window.services.*`（Task 2）；`ApiKeyInput` 组件；TDesign 组件。
- Produces: 默认导出 Vue 组件 —— 供 Task 3 的 `index.vue` 挂载。

- [ ] **Step 1: 创建 `src/Switch/ReasonixConfigView.vue`**

完整文件内容：

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import {
  Card, Empty, Button, Tag, Space, Tooltip, Dialog, Input, InputNumber, MessagePlugin,
  Select, Popconfirm, Alert as TAlert, Dropdown,
} from "tdesign-vue-next";
import {
  RefreshIcon, EditIcon, FolderOpen1Icon, AddIcon, DeleteIcon,
  ChevronDownIcon, ChevronRightIcon,
} from "tdesign-icons-vue-next";
import ApiKeyInput from "../components/ApiKeyInput.vue";
import "./styles/ReasonixConfigView.css";

const loading = ref(false);
const warningMsg = ref("");
const providers = ref([]);
const defaultModel = ref("");
const expanded = ref(new Set());

// ==================== 弹窗状态 ====================

const addProviderDialog = ref(false);
const addProviderForm = ref({ name: "", kind: "openai", baseUrl: "", chatUrl: "", modelsUrl: "", apiKeyEnv: "", apiKey: "", contextWindow: 0, maxOutputTokens: 0 });
const editDialog = ref(false);
const editingProvider = ref("");
const editForm = ref({ name: "", kind: "openai", baseUrl: "", chatUrl: "", modelsUrl: "", apiKeyEnv: "", apiKey: "", contextWindow: 0, maxOutputTokens: 0 });

const addModelDialog = ref(false);
const addModelProvider = ref("");
const addModelId = ref("");
const deleteModelTarget = ref(null);

// ==================== 数据加载 ====================

const refresh = () => {
  loading.value = true;
  warningMsg.value = "";
  try {
    providers.value = window.services.getReasonixProviderList() || [];
    defaultModel.value = window.services.getReasonixDefaultModel() || "";
  } catch (e) {
    console.error("加载 Reasonix 配置失败:", e);
    warningMsg.value = e.message || "加载失败";
  } finally {
    loading.value = false;
  }
};

const toggleExpand = (name) => {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
};

// ==================== 默认模型 ====================

const defaultModelOptions = computed(() => {
  const opts = [{ label: "（未设置）", value: "" }];
  for (const p of providers.value) {
    if (p.default) opts.push({ label: `${p.name}（默认 ${p.default}）`, value: p.name });
    for (const m of p.models) opts.push({ label: `${p.name}/${m}`, value: `${p.name}/${m}` });
  }
  return opts;
});

const handleSetDefaultModel = () => {
  try {
    window.services.setReasonixDefaultModel(defaultModel.value);
    MessagePlugin.success("默认模型已更新");
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

// ==================== 供应商 CRUD ====================

const emptyProviderForm = () => ({ name: "", kind: "openai", baseUrl: "", chatUrl: "", modelsUrl: "", apiKeyEnv: "", apiKey: "", contextWindow: 0, maxOutputTokens: 0 });

const buildProviderPayload = (form) => ({
  name: form.name,
  kind: form.kind,
  baseUrl: form.baseUrl,
  chatUrl: form.chatUrl,
  modelsUrl: form.modelsUrl,
  apiKeyEnv: form.apiKeyEnv,
  apiKey: form.apiKey,
  contextWindow: Number(form.contextWindow) || 0,
  maxOutputTokens: Number(form.maxOutputTokens) || 0,
});

const openAddProviderDialog = () => {
  addProviderForm.value = emptyProviderForm();
  addProviderDialog.value = true;
};

const handleAddProvider = () => {
  try {
    const name = addProviderForm.value.name.trim();
    if (!name) { MessagePlugin.warning("请输入供应商名称"); return; }
    const form = { ...addProviderForm.value, name, apiKeyEnv: addProviderForm.value.apiKeyEnv.trim() };
    if (!form.apiKeyEnv) form.apiKeyEnv = `${name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_API_KEY`;
    window.services.addReasonixProvider(buildProviderPayload(form));
    MessagePlugin.success(`供应商 ${name} 已添加`);
    addProviderDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("添加失败: " + e.message);
  }
};

const handleEdit = (provider) => {
  editingProvider.value = provider.name;
  editForm.value = {
    name: provider.name,
    kind: provider.kind || "openai",
    baseUrl: provider.baseUrl || "",
    chatUrl: provider.chatUrl || "",
    modelsUrl: provider.modelsUrl || "",
    apiKeyEnv: provider.apiKeyEnv || "",
    apiKey: window.services.getReasonixApiKey(provider.apiKeyEnv) || "",
    contextWindow: provider.contextWindow || 0,
    maxOutputTokens: provider.maxOutputTokens || 0,
  };
  editDialog.value = true;
};

const handleSaveProvider = () => {
  try {
    const { name, ...rest } = editForm.value;
    window.services.updateReasonixProvider(editingProvider.value, buildProviderPayload({ ...rest, name: editingProvider.value }));
    MessagePlugin.success("供应商配置已更新");
    editDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("保存失败: " + e.message);
  }
};

const handleDeleteProvider = (providerName) => {
  try {
    window.services.deleteReasonixProvider(providerName);
    MessagePlugin.success(`供应商 ${providerName} 已删除`);
    refresh();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
  }
};

// ==================== 模型 CRUD ====================

const openAddModelDialog = (providerName) => {
  addModelProvider.value = providerName;
  addModelId.value = "";
  addModelDialog.value = true;
};

const handleAddModel = () => {
  try {
    const id = addModelId.value.trim();
    if (!id) { MessagePlugin.warning("请输入模型 ID"); return; }
    window.services.addReasonixModel(addModelProvider.value, id);
    MessagePlugin.success(`模型 ${id} 已添加`);
    addModelDialog.value = false;
    refresh();
  } catch (e) {
    MessagePlugin.error("添加失败: " + e.message);
  }
};

const handleDeleteModel = (providerName, modelId) => {
  try {
    window.services.deleteReasonixModel(providerName, modelId);
    MessagePlugin.success(`模型 ${modelId} 已删除`);
    refresh();
  } catch (e) {
    MessagePlugin.error("删除失败: " + e.message);
  }
};

const formatNumber = (n) => {
  if (!n) return "";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
};

const openReasonixDir = () => {
  try { window.services.openReasonixDir(); } catch { /* ignore */ }
};

onMounted(refresh);
</script>

<template>
  <div class="reasonix-config-container">
    <div class="reasonix-config-header">
      <span class="reasonix-config-tip">
        Reasonix 配置 — 供应商见
        <span class="hint-link" @click="openReasonixDir">~/.reasonix/config.toml</span>，密钥存于
        <span class="hint-link" @click="openReasonixDir">~/.reasonix/.env</span>
      </span>
      <div class="reasonix-config-actions">
        <Button size="small" variant="outline" @click="openReasonixDir">
          <template #icon><FolderOpen1Icon /></template> 打开目录
        </Button>
        <Button size="small" variant="outline" :loading="loading" @click="refresh">
          <template #icon><RefreshIcon /></template> 刷新
        </Button>
      </div>
    </div>

    <div v-if="warningMsg" class="reasonix-config-warning">
      <t-alert :message="warningMsg" theme="warning" show-icon />
    </div>

    <template v-if="!loading">
      <!-- 默认模型 -->
      <Card :bordered="true" class="reasonix-default-card">
        <template #header>
          <div class="reasonix-default-header">
            <Space size="12px" align="center">
              <span class="reasonix-block-title">默认模型</span>
              <span class="reasonix-block-sub">config.toml · default_model</span>
            </Space>
          </div>
        </template>
        <div class="reasonix-default-row">
          <Select
            v-model="defaultModel"
            :options="defaultModelOptions"
            :min-column-width="240"
            filterable
            class="reasonix-default-select"
          />
          <Button size="small" theme="primary" variant="base" @click="handleSetDefaultModel">
            保存
          </Button>
        </div>
      </Card>

      <!-- 供应商与模型 -->
      <div class="reasonix-providers-header">
        <Space size="12px" align="center">
          <span class="reasonix-block-title">供应商与模型</span>
          <Tag size="small" variant="outline">{{ providers.length }} 个</Tag>
        </Space>
        <Button size="small" variant="outline" @click="openAddProviderDialog">
          <template #icon><AddIcon /></template> 添加供应商
        </Button>
      </div>

      <div v-if="providers.length === 0" class="reasonix-config-empty">
        <Empty description="未检测到 Reasonix 供应商配置，请运行 reasonix setup 或手动编辑 config.toml" />
      </div>

      <div v-else class="reasonix-provider-list">
        <Card
          v-for="p in providers"
          :key="p.name"
          :bordered="true"
          class="reasonix-provider-card"
          :class="{ 'reasonix-provider-card--active': expanded.has(p.name) }"
        >
          <div class="reasonix-provider-header" @click="toggleExpand(p.name)">
            <div class="reasonix-provider-header-left">
              <span class="reasonix-expand-icon">
                <ChevronDownIcon v-if="expanded.has(p.name)" size="16px" />
                <ChevronRightIcon v-else size="16px" />
              </span>
              <span class="reasonix-provider-name">{{ p.name }}</span>
              <Tag size="small" variant="outline">{{ p.kind }}</Tag>
              <Tag
                v-if="p.default"
                size="small"
                theme="success"
                variant="light"
              >默认 {{ p.default }}</Tag>
              <span class="reasonix-model-count">{{ p.models.length }} 个模型</span>
            </div>
            <div class="reasonix-provider-header-right" @click.stop>
              <Button size="small" theme="default" variant="text" @click="handleEdit(p)">
                <template #icon><EditIcon /></template>
              </Button>
              <Popconfirm
                content="删除该供应商及其所有模型？"
                theme="danger"
                @confirm="handleDeleteProvider(p.name)"
              >
                <Button size="small" theme="danger" variant="text">
                  <template #icon><DeleteIcon /></template>
                </Button>
              </Popconfirm>
            </div>
          </div>

          <div v-if="expanded.has(p.name)" class="reasonix-provider-info">
            <div class="reasonix-info-row"><span class="reasonix-info-label">Base URL</span><span class="reasonix-info-value">{{ p.baseUrl || "—" }}</span></div>
            <div v-if="p.chatUrl" class="reasonix-info-row"><span class="reasonix-info-label">Chat URL</span><span class="reasonix-info-value">{{ p.chatUrl }}</span></div>
            <div v-if="p.modelsUrl" class="reasonix-info-row"><span class="reasonix-info-label">Models URL</span><span class="reasonix-info-value">{{ p.modelsUrl }}</span></div>
            <div class="reasonix-info-row"><span class="reasonix-info-label">Key 环境变量</span><span class="reasonix-info-value mono">{{ p.apiKeyEnv || "—" }}</span></div>
            <div v-if="p.contextWindow || p.maxOutputTokens" class="reasonix-info-row">
              <span class="reasonix-info-label">限制</span>
              <span class="reasonix-info-value">
                <template v-if="p.contextWindow">上下文 {{ formatNumber(p.contextWindow) }}</template>
                <template v-if="p.contextWindow && p.maxOutputTokens"> · </template>
                <template v-if="p.maxOutputTokens">输出 {{ formatNumber(p.maxOutputTokens) }}</template>
              </span>
            </div>

            <div class="reasonix-models-section">
              <div class="reasonix-models-title">
                <span>模型</span>
                <Button size="small" variant="outline" @click="openAddModelDialog(p.name)">
                  <template #icon><AddIcon /></template> 添加模型
                </Button>
              </div>
              <div v-if="p.models.length === 0" class="reasonix-models-empty">暂无模型</div>
              <div v-for="m in p.models" :key="m" class="reasonix-model-item">
                <span class="reasonix-model-name">{{ m }}</span>
                <Tag v-if="p.default === m" size="small" theme="success" variant="light">默认</Tag>
                <div class="reasonix-model-actions">
                  <Popconfirm
                    content="删除模型？"
                    theme="danger"
                    @confirm="handleDeleteModel(p.name, m)"
                  >
                    <Button size="small" theme="danger" variant="text">
                      <template #icon><DeleteIcon /></template>
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <!-- 添加供应商弹窗 -->
    <Dialog v-model:visible="addProviderDialog" header="添加供应商" width="520px" :confirm-btn="{ content: '添加', theme: 'primary' }" @confirm="handleAddProvider">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item"><label>名称 <span class="reasonix-form-required">*</span></label><Input v-model="addProviderForm.name" placeholder="deepseek" /></div>
        <div class="reasonix-form-item"><label>Kind</label><Select v-model="addProviderForm.kind" :options="[{ label: 'openai', value: 'openai' }]" /></div>
        <div class="reasonix-form-item"><label>Base URL</label><Input v-model="addProviderForm.baseUrl" placeholder="https://api.deepseek.com" /></div>
        <div class="reasonix-form-row">
          <div class="reasonix-form-item"><label>Chat URL（可选）</label><Input v-model="addProviderForm.chatUrl" placeholder="完整 chat/completions URL" /></div>
        </div>
        <div class="reasonix-form-item"><label>Models URL（可选）</label><Input v-model="addProviderForm.modelsUrl" placeholder="模型发现 URL" /></div>
        <div class="reasonix-form-item"><label>Key 环境变量</label><Input v-model="addProviderForm.apiKeyEnv" placeholder="留空自动生成，如 DEEPSEEK_API_KEY" /></div>
        <div class="reasonix-form-item"><label>API Key</label><ApiKeyInput v-model="addProviderForm.apiKey" placeholder="写入 ~/.reasonix/.env" /></div>
        <div class="reasonix-form-row">
          <div class="reasonix-form-item"><label>上下文窗口</label><InputNumber v-model="addProviderForm.contextWindow" :min="0" :step="1000" /></div>
          <div class="reasonix-form-item"><label>最大输出</label><InputNumber v-model="addProviderForm.maxOutputTokens" :min="0" :step="1000" /></div>
        </div>
      </div>
    </Dialog>

    <!-- 编辑供应商弹窗 -->
    <Dialog v-model:visible="editDialog" header="编辑供应商配置" width="520px" :confirm-btn="{ content: '保存', theme: 'primary' }" @confirm="handleSaveProvider">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item"><label>名称（不可改名）</label><Input :value="editForm.name" disabled /></div>
        <div class="reasonix-form-item"><label>Kind</label><Select v-model="editForm.kind" :options="[{ label: 'openai', value: 'openai' }]" /></div>
        <div class="reasonix-form-item"><label>Base URL</label><Input v-model="editForm.baseUrl" placeholder="https://api.deepseek.com" /></div>
        <div class="reasonix-form-item"><label>Chat URL（可选）</label><Input v-model="editForm.chatUrl" /></div>
        <div class="reasonix-form-item"><label>Models URL（可选）</label><Input v-model="editForm.modelsUrl" /></div>
        <div class="reasonix-form-item"><label>Key 环境变量</label><Input v-model="editForm.apiKeyEnv" /></div>
        <div class="reasonix-form-item"><label>API Key</label><ApiKeyInput v-model="editForm.apiKey" :placeholder="editForm.apiKeyEnv ? '已保存，留空则不修改' : '写入 ~/.reasonix/.env'" /></div>
        <div class="reasonix-form-row">
          <div class="reasonix-form-item"><label>上下文窗口</label><InputNumber v-model="editForm.contextWindow" :min="0" :step="1000" /></div>
          <div class="reasonix-form-item"><label>最大输出</label><InputNumber v-model="editForm.maxOutputTokens" :min="0" :step="1000" /></div>
        </div>
      </div>
    </Dialog>

    <!-- 添加模型弹窗 -->
    <Dialog v-model:visible="addModelDialog" header="添加模型" width="420px" :confirm-btn="{ content: '添加', theme: 'primary' }" @confirm="handleAddModel">
      <div class="reasonix-edit-form">
        <div class="reasonix-form-item">
          <label>模型 ID <span class="reasonix-form-required">*</span></label>
          <Input v-model="addModelId" placeholder="deepseek-v4-flash" @enter="handleAddModel" />
        </div>
        <div class="reasonix-form-hint">供应商：{{ addModelProvider }}</div>
      </div>
    </Dialog>
  </div>
</template>
```

- [ ] **Step 2: 创建 `src/Switch/styles/ReasonixConfigView.css`**

完整文件内容：

```css
.reasonix-config-container { display: flex; flex-direction: column; gap: 12px; padding-top: 0; }
.reasonix-config-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0; }
.reasonix-config-tip { font-size: 12px; color: var(--td-text-color-secondary); }
.reasonix-config-actions { display: flex; gap: 8px; }
.reasonix-config-warning { margin-bottom: 12px; }
.reasonix-config-empty { margin-top: 40px; }

.reasonix-default-card { background: var(--td-bg-color-container); }
.reasonix-default-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.reasonix-block-title { font-size: 15px; font-weight: 600; color: var(--td-text-color-primary); }
.reasonix-block-sub { font-size: 12px; color: var(--td-text-color-placeholder); }
.reasonix-default-row { display: flex; gap: 8px; align-items: center; }
.reasonix-default-select { flex: 1; }

.reasonix-providers-header { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.reasonix-provider-list { display: flex; flex-direction: column; gap: 8px; }
.reasonix-provider-card { cursor: pointer; }
.reasonix-provider-card--active { border-color: var(--td-brand-color); }
.reasonix-provider-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.reasonix-provider-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.reasonix-provider-header-right { display: flex; align-items: center; flex-shrink: 0; }
.reasonix-expand-icon { display: flex; align-items: center; color: var(--td-text-color-placeholder); }
.reasonix-provider-name { font-weight: 600; font-size: 14px; color: var(--td-text-color-primary); }
.reasonix-model-count { font-size: 12px; color: var(--td-text-color-placeholder); }

.reasonix-provider-info { padding: 8px 0 4px; }
.reasonix-info-row { padding: 4px 0; font-size: 13px; display: flex; gap: 8px; }
.reasonix-info-label { color: var(--td-text-color-placeholder); min-width: 100px; flex-shrink: 0; }
.reasonix-info-value { color: var(--td-text-color-primary); word-break: break-all; }

.reasonix-models-section { border-top: 1px solid var(--td-border-level-1-color); padding-top: 8px; margin-top: 4px; }
.reasonix-models-title { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 500; color: var(--td-text-color-placeholder); margin-bottom: 8px; }
.reasonix-models-empty { font-size: 12px; color: var(--td-text-color-placeholder); padding: 8px 0; }
.reasonix-model-item { display: flex; align-items: center; gap: 12px; padding: 6px 8px; border-radius: var(--td-radius-default); }
.reasonix-model-item:hover { background: var(--td-bg-color-container-hover); }
.reasonix-model-name { flex: 1; font-size: 13px; color: var(--td-text-color-primary); }
.reasonix-model-actions { flex-shrink: 0; }

.reasonix-edit-form { display: flex; flex-direction: column; gap: 12px; }
.reasonix-form-item { display: flex; flex-direction: column; gap: 4px; }
.reasonix-form-item label { font-size: 13px; color: var(--td-text-color-secondary); }
.reasonix-form-row { display: flex; gap: 12px; }
.reasonix-form-row .reasonix-form-item { flex: 1; }
.reasonix-form-hint { font-size: 12px; color: var(--td-text-color-placeholder); }
.reasonix-form-required { color: var(--td-error-color); }
.hint-link { cursor: pointer; text-decoration: underline; color: var(--td-brand-color); }
.hint-link:hover { opacity: 0.8; }
.mono { font-family: 'Courier New', Courier, monospace; font-size: 12px; }
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功，无模板编译错误、无 import 缺失（此时 Task 3 外壳已引用本组件，一起验证）。

- [ ] **Step 4: 提交**

```bash
git add src/Switch/ReasonixConfigView.vue src/Switch/styles/ReasonixConfigView.css
git commit -m "feat: Reasonix 配置视图（供应商/模型/默认模型/密钥）"
```

---

### Task 5: 手动验证 + 收尾

**Files:** 无（运行时验证；用临时 Reasonix home 避免污染真实配置）

- [ ] **Step 1: 准备临时测试配置**

用临时 HOME 模拟 Reasonix home（非 Windows）：
```bash
mkdir -p /tmp/rx-home/.reasonix
cat > /tmp/rx-home/.reasonix/config.toml <<'EOF'
default_model = "deepseek/deepseek-v4-flash"

[ui]
theme = "auto"

[[providers]]
name = "deepseek"
kind = "openai"
base_url = "https://api.deepseek.com"
models = ["deepseek-v4-flash", "deepseek-v4-pro"]
default = "deepseek-v4-flash"
api_key_env = "DEEPSEEK_API_KEY"
context_window = 1000000

[[plugins]]
name = "example"
command = "reasonix-plugin-example"
EOF
cat > /tmp/rx-home/.reasonix/.env <<'EOF'
DEEPSEEK_API_KEY=sk-test-123
EOF
```

- [ ] **Step 2: 用临时 home 启动 dev 验证**

当前代码的 Reasonix home 固定读 `~/.reasonix` / `%APPDATA%`，不读 `HOME`。因此临时 home 方案仅用于**服务层单测**。改用真实配置做冒烟：若本机已有 `~/.reasonix/config.toml` 直接验证；若没有，先备份真实文件（如有）再用上面的样例写入，验证后恢复：

```bash
# 备份（若存在）
[ -f ~/.reasonix/config.toml ] && cp ~/.reasonix/config.toml ~/.reasonix/config.toml.bak
[ -f ~/.reasonix/.env ] && cp ~/.reasonix/.env ~/.reasonix/.env.bak
mkdir -p ~/.reasonix
cp /tmp/rx-home/.reasonix/config.toml ~/.reasonix/config.toml
cp /tmp/rx-home/.reasonix/.env ~/.reasonix/.env
```

然后 `npm run dev`，在 uTools 里打开 CCConfig → Reasonix 配置。

- [ ] **Step 3: 供应商 CRUD 冒烟**

操作：添加供应商（name=test1, baseUrl=https://example.com, apiKeyEnv=TEST1_API_KEY, apiKey=sk-test1）。
Expected:
- 列表出现 test1 卡片，models 为空。
- `~/.reasonix/config.toml` 出现 `[[providers]]` 块，含 `api_key_env = "TEST1_API_KEY"`，**不含** key 值。
- `~/.reasonix/.env` 出现 `TEST1_API_KEY=sk-test1`。
- 编辑 baseUrl → 保存 → 卡片与 TOML 同步更新。
- 删除 test1 → 卡片消失，TOML 中 `[[providers]]` 块移除。

- [ ] **Step 4: 模型 CRUD 冒烟**

操作：在 deepseek 供应商下添加模型 `test-model`，再删除。
Expected: 添加后 `models` 数组含 `test-model`；删除后恢复。

- [ ] **Step 5: 默认模型 + 引用保护**

操作：
- 下拉选择 `deepseek/deepseek-v4-flash` → 保存 → TOML `default_model` 更新。
- 尝试删除 deepseek 供应商。
Expected: 删除被阻止，提示「被 default_model 引用，请先修改默认模型」。

- [ ] **Step 6: 其他 TOML 节保留**

操作：编辑/保存任意供应商后，查看 `~/.reasonix/config.toml`。
Expected: `[ui]`、`[[plugins]]` 节的值仍在（注释可能丢失）。

- [ ] **Step 7: 恢复真实配置**

```bash
[ -f ~/.reasonix/config.toml.bak ] && mv ~/.reasonix/config.toml.bak ~/.reasonix/config.toml
[ -f ~/.reasonix/.env.bak ] && mv ~/.reasonix/.env.bak ~/.reasonix/.env
rm -rf /tmp/rx-home
```

- [ ] **Step 8: 深色模式 + 构建确认**

切换系统深色模式，确认视图文字/背景使用 TDesign 变量、无硬编码色。
Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 9: 完成提交（如有遗留改动）**

```bash
git status
# 若有改动则 git add + git commit -m "test: Reasonix 手动验证通过"
```

---

## Self-Review

**1. Spec coverage:**
- 需求「App Selector 加 Reasonix」→ Task 3 Step 4-5 ✓
- 需求「Reasonix Config View」→ Task 4 ✓
- 需求「config.toml 读写，其他节保留」→ Task 1 `readReasonixConfig`/`writeReasonixConfig`（整文解析→改 providers/default_model→回写）✓
- 需求「API keys 存 .env，api_key_env 引用」→ Task 1 `.env` 助手 + `addReasonixProvider` 写 key ✓
- 需求「uTools route reasonixConfig + Reasonix配置」→ Task 3 Step 2-3 ✓
- 需求「provider name 唯一、default_model 引用保护」→ Task 1 `deleteReasonixProvider` 引用检查 ✓
- 需求「model_overrides 等本轮不处理」→ 视图不暴露，TOML 原样保留 ✓
- 需求「图标占位」→ Task 3 Step 3 ✓

**2. Placeholder scan:** 无 TBD/TODO；所有代码步骤含完整代码；`apiKeyEnv` 自动生成逻辑、默认模型下拉、引用保护均有具体实现。✓

**3. Type consistency:** `getReasonixProviderList()` 返回 `{name, kind, baseUrl, chatUrl, modelsUrl, apiKeyEnv, default, contextWindow, maxOutputTokens, models[]}`，Task 4 视图消费字段名一致；`buildProviderPayload` 与 `addReasonixProvider(cfg)`/`updateReasonixProvider(name, updates)` 参数结构一致；`window.services.*` 方法名在 Task 2 暴露与 Task 4 调用一致。✓

**4. 边界情况:** smol-toml BigInt → Task 1 `toNumber` 归一化；`.env` 多行/注释保留 → `readReasonixEnv`/`writeReasonixEnvKey` 行级处理；provider 无 `models` 键（单 `model` 形式）→ `normalizeProvider` 数组化。✓
