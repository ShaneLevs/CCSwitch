const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { parse: parseToml, stringify: stringifyToml } = require('smol-toml')

// Codex Desktop（ChatGPT 桌面端）/ Codex CLI / VS Code 插件共用 ~/.codex 下的同一套配置。
// 模型配置参照 DeepSeek 官方接入方式（api-docs.deepseek.com agent_integrations/codex）：
//   config.toml 顶层 model / model_provider / model_reasoning_effort / preferred_auth_method /
//   forced_login_method / model_catalog_json + [model_providers.<id>] 子表
//   （name / base_url / wire_api / experimental_bearer_token）
// 仅管理模型相关字段，config.toml 的其余配置（mcp_servers / profiles 等）读改写原样保留。

const CODEX_DIR = () => path.join(os.homedir(), '.codex')
const CODEX_CONFIG_PATH = () => path.join(CODEX_DIR(), 'config.toml')
const CODEX_MODELS_JSON_PATH = () => path.join(CODEX_DIR(), 'models.json')
const getCodexDir = CODEX_DIR
const getCodexConfigPath = CODEX_CONFIG_PATH
const getCodexModelsJsonPath = CODEX_MODELS_JSON_PATH

// ==================== config.toml 读写 ====================

const readCodexConfig = () => {
  const p = CODEX_CONFIG_PATH()
  if (!fs.existsSync(p)) return {}
  const raw = fs.readFileSync(p, { encoding: 'utf-8' })
  try {
    return parseToml(raw) || {}
  } catch (e) {
    // 解析失败必须抛错而非静默返回 {}：任何「读 → 改 → 全量写回」都会抹掉
    // mcp_servers / profiles 等既有配置节（同 reasonix 的处理）
    throw new Error(`config.toml 解析失败，已阻止修改（请先修复 TOML 语法）: ${e.message}`)
  }
}

const writeCodexConfig = (doc) => {
  const p = CODEX_CONFIG_PATH()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, stringifyToml(doc || {}), { encoding: 'utf-8' })
  return true
}

// ==================== Providers（[model_providers.<id>] 子表） ====================

// UI 认识并显式管理的字段（其余视为需要原样保留的扩展字段，如 env_key / http_headers）
const KNOWN_PROVIDER_FIELDS = ['name', 'base_url', 'wire_api', 'experimental_bearer_token']

// TOML 裸键安全的供应商标识（model_provider 与子表键同名）
const ID_RE = /^[\w-]+$/

// 归一化一个 provider 条目供 UI 消费；env_key（老版本 Codex 用环境变量名取 key）只读展示，
// 本体保留在 _extra 里原样写回
const normalizeProvider = (id, p) => {
  const extra = {}
  for (const k of Object.keys(p || {})) {
    if (!KNOWN_PROVIDER_FIELDS.includes(k)) extra[k] = p[k]
  }
  return {
    id,
    name: p.name || id,
    baseUrl: p.base_url || '',
    wireApi: p.wire_api || 'responses',
    apiKey: p.experimental_bearer_token || '',
    envKey: p.env_key || '',
    _extra: extra,
  }
}

// 从 UI 结构构建写入 TOML 的 provider 对象（空字段不输出；unknown 字段原样还原）
const buildProviderToml = (cfg) => {
  const p = {}
  if (cfg.name) p.name = cfg.name
  if (cfg.baseUrl) p.base_url = cfg.baseUrl
  if (cfg.wireApi) p.wire_api = cfg.wireApi
  if (cfg.apiKey) p.experimental_bearer_token = cfg.apiKey
  for (const [k, v] of Object.entries(cfg._extra || {})) {
    if (v !== undefined) p[k] = v
  }
  return p
}

const getProviderTables = (doc) => {
  if (!doc.model_providers || typeof doc.model_providers !== 'object') doc.model_providers = {}
  return doc.model_providers
}

const getCodexProviderList = () => {
  const doc = readCodexConfig()
  return Object.entries(getProviderTables(doc)).map(([id, p]) => normalizeProvider(id, p))
}

const addCodexProvider = (cfg) => {
  const id = String(cfg.id || '').trim()
  if (!id) throw new Error('供应商 ID 不能为空')
  if (!ID_RE.test(id)) throw new Error('供应商 ID 只能包含字母、数字、下划线、中划线')
  const doc = readCodexConfig()
  const tables = getProviderTables(doc)
  if (tables[id]) throw new Error(`供应商 ${id} 已存在`)
  tables[id] = buildProviderToml({ ...cfg, id })
  writeCodexConfig(doc)
  return true
}

const updateCodexProvider = (id, updates) => {
  const doc = readCodexConfig()
  const tables = getProviderTables(doc)
  if (!tables[id]) throw new Error(`供应商 ${id} 不存在`)
  // 支持重命名：id 是子表键，改名需校验冲突并同步 model_provider 引用与 DB 模型列表
  const newId = updates.id === undefined || updates.id === id ? id : String(updates.id).trim()
  if (!newId) throw new Error('供应商 ID 不能为空')
  if (!ID_RE.test(newId)) throw new Error('供应商 ID 只能包含字母、数字、下划线、中划线')
  if (newId !== id && tables[newId]) throw new Error(`供应商 ${newId} 已存在`)
  // clearApiKey → 删除已保存的 key（experimental_bearer_token）；否则 key 有值才覆盖
  const merged = { ...normalizeProvider(id, tables[id]), ...updates, id: newId }
  if (updates.clearApiKey) merged.apiKey = ''
  const next = buildProviderToml(merged)
  delete tables[id]
  tables[newId] = next
  if (newId !== id) {
    if (doc.model_provider === id) doc.model_provider = newId
    const modelsMap = readProviderModelsDoc()
    if (modelsMap[id]) {
      modelsMap[newId] = modelsMap[id]
      delete modelsMap[id]
      writeProviderModelsDoc(modelsMap)
    }
  }
  writeCodexConfig(doc)
  return true
}

// 下发用：存在则合并更新（保留既有扩展字段与已存 key，空值不覆盖），不存在则创建
const upsertCodexProvider = (id, cfg) => {
  const doc = readCodexConfig()
  const tables = getProviderTables(doc)
  const prev = tables[id]
    ? normalizeProvider(id, tables[id])
    : { id, name: id, baseUrl: '', wireApi: '', apiKey: '', envKey: '', _extra: {} }
  const merged = { ...prev }
  for (const [k, v] of Object.entries(cfg)) {
    if (v !== undefined && v !== '') merged[k] = v
  }
  tables[id] = buildProviderToml(merged)
  writeCodexConfig(doc)
  return true
}

const deleteCodexProvider = (id) => {
  const doc = readCodexConfig()
  const tables = getProviderTables(doc)
  if (!tables[id]) throw new Error(`供应商 ${id} 不存在`)
  if (doc.model_provider === id) {
    throw new Error(`供应商 ${id} 是当前使用的供应商，请先切换到其他模型`)
  }
  delete tables[id]
  const modelsMap = readProviderModelsDoc()
  if (modelsMap[id]) {
    delete modelsMap[id]
    writeProviderModelsDoc(modelsMap)
  }
  writeCodexConfig(doc)
  return true
}

// ==================== 当前模型 / 全局字段 ====================

const getCodexCurrent = () => {
  const doc = readCodexConfig()
  return {
    provider: doc.model_provider || '',
    model: doc.model || '',
    reasoningEffort: doc.model_reasoning_effort || '',
    apiAuth: doc.preferred_auth_method === 'apikey' && doc.forced_login_method === 'api',
    catalogPath: doc.model_catalog_json || '',
  }
}

// 按 DeepSeek 接入方式补齐「跳过 ChatGPT 登录」的两个开关；只补缺失，不覆盖用户已有值
const ensureApiAuthFields = (doc) => {
  if (doc.preferred_auth_method === undefined) doc.preferred_auth_method = 'apikey'
  if (doc.forced_login_method === undefined) doc.forced_login_method = 'api'
}

// 切换默认模型：写 model_provider + model（Codex 的模型与供应商是顶层配对字段），并补 API 认证开关
const setCodexDefaultModel = (providerId, modelId) => {
  if (!providerId) throw new Error('请先选择供应商')
  if (!modelId) throw new Error('模型 ID 不能为空')
  const doc = readCodexConfig()
  const tables = getProviderTables(doc)
  if (!tables[providerId]) throw new Error(`供应商 ${providerId} 不存在`)
  doc.model_provider = providerId
  doc.model = modelId
  ensureApiAuthFields(doc)
  writeCodexConfig(doc)
  return true
}

// 思考强度（model_reasoning_effort）：空值 = 删除字段走 Codex 默认
const setCodexReasoningEffort = (effort) => {
  const doc = readCodexConfig()
  if (effort) doc.model_reasoning_effort = effort
  else delete doc.model_reasoning_effort
  writeCodexConfig(doc)
  return true
}

// 跳过 ChatGPT 登录：preferred_auth_method / forced_login_method 成对写删
const setCodexApiAuth = (enabled) => {
  const doc = readCodexConfig()
  if (enabled) {
    doc.preferred_auth_method = 'apikey'
    doc.forced_login_method = 'api'
  } else {
    delete doc.preferred_auth_method
    delete doc.forced_login_method
  }
  writeCodexConfig(doc)
  return true
}

// ==================== 每供应商模型列表（uTools DB） ====================
// Codex 原生配置没有「供应商下的模型列表」概念（顶层只有一对 model + model_provider），
// 模型列表存 uTools DB，供快捷切换与 models.json 目录生成使用

const PROVIDER_MODELS_DB = 'ccswitch_codex_provider_models'

const readProviderModelsDoc = () => {
  try {
    const d = window.utools.db.get(PROVIDER_MODELS_DB)
    return (d && d.models) || {}
  } catch (e) {
    return {}
  }
}

const writeProviderModelsDoc = (map) => {
  let existing = null
  try { existing = window.utools.db.get(PROVIDER_MODELS_DB) } catch (e) { /* ignore */ }
  const doc = { _id: PROVIDER_MODELS_DB, models: map }
  if (existing) doc._rev = existing._rev
  const res = window.utools.db.put(doc)
  if (!res || !res.ok) {
    throw new Error('保存模型列表失败' + (res && res.message ? `：${res.message}` : ''))
  }
  return true
}

const getCodexProviderModels = (providerId) => readProviderModelsDoc()[providerId] || []

// 全部模型列表（catalog 生成 / UI 展示用）
const getCodexProviderModelsMap = () => readProviderModelsDoc()

const addCodexModel = (providerId, modelId) => upsertCodexModel(providerId, modelId, false)

const deleteCodexModel = (providerId, modelId) => {
  const map = readProviderModelsDoc()
  const list = map[providerId] || []
  if (!list.includes(modelId)) return true
  map[providerId] = list.filter(m => m !== modelId)
  writeProviderModelsDoc(map)
  return true
}

// 已存在时不报错（下发路径用）；exists 为 true 时重复添加报错（UI 路径用）
const upsertCodexModel = (providerId, modelId, exists = true) => {
  if (!providerId) throw new Error('供应商不能为空')
  const id = String(modelId || '').trim()
  if (!id) throw new Error('模型 ID 不能为空')
  const map = readProviderModelsDoc()
  const list = map[providerId] || []
  if (list.includes(id)) {
    if (exists) throw new Error(`模型 ${id} 已存在`)
    return true
  }
  map[providerId] = [...list, id]
  writeProviderModelsDoc(map)
  return true
}

// ==================== models.json 模型目录（Codex 桌面端模型列表） ====================

const readCodexModelCatalog = () => {
  const p = CODEX_MODELS_JSON_PATH()
  if (!fs.existsSync(p)) return { models: [] }
  const raw = fs.readFileSync(p, { encoding: 'utf-8' })
  try {
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.models)) return parsed
    return { models: [] }
  } catch (e) {
    throw new Error(`models.json 解析失败，已阻止修改（请先修复 JSON 语法）: ${e.message}`)
  }
}

const writeCodexModelCatalog = (catalog) => {
  const p = CODEX_MODELS_JSON_PATH()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(catalog, null, 2), { encoding: 'utf-8' })
}

// 生成最小可用目录条目（字段结构参照 DeepSeek 官方接入文档）：
// instructions_template 置 null = 使用 Codex 内置指令模板；上下文窗口等未知信息不写
const buildCatalogEntry = (providerId, modelId) => ({
  slug: modelId,
  display_name: modelId,
  description: `${providerId} 提供的模型（由 CCSwitch 生成）`,
  supported_reasoning_levels: [
    { reasoning_level: 'low', description: '快速响应' },
    { reasoning_level: 'medium', description: '均衡' },
    { reasoning_level: 'high', description: '深度推理' },
  ],
  default_reasoning_level: 'medium',
  supported_in_api: true,
  input_modalities: ['text'],
  features: [],
  instructions_template: null,
})

// 把各供应商的模型列表合并写入 ~/.codex/models.json，并在 config.toml 设置 model_catalog_json
// 指向它；已有条目（含用户手工维护的内置/GPT 条目）原样保留，只补缺失的 slug
const syncCodexModelCatalog = () => {
  const doc = readCodexConfig()
  const tables = getProviderTables(doc)
  const modelsMap = readProviderModelsDoc()
  const catalog = readCodexModelCatalog()
  const seen = new Set(catalog.models.map(m => m && m.slug).filter(Boolean))
  let added = 0
  for (const [id, list] of Object.entries(modelsMap)) {
    if (!tables[id]) continue // 供应商已删除的遗留列表不进目录
    for (const modelId of list) {
      if (!modelId || typeof modelId !== 'string' || seen.has(modelId)) continue
      seen.add(modelId)
      catalog.models.push(buildCatalogEntry(id, modelId))
      added++
    }
  }
  writeCodexModelCatalog(catalog)
  doc.model_catalog_json = '~/.codex/models.json'
  writeCodexConfig(doc)
  return { total: catalog.models.length, added }
}

// ==================== 目录操作 ====================

const openCodexDir = () => {
  const dir = CODEX_DIR()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  try { window.utools.shellOpenPath(dir) } catch { /* ignore */ }
}

const isCodexInstalled = () => fs.existsSync(CODEX_DIR())

module.exports = {
  getCodexDir, getCodexConfigPath, getCodexModelsJsonPath,
  readCodexConfig, writeCodexConfig,
  getCodexProviderList, addCodexProvider, updateCodexProvider, upsertCodexProvider, deleteCodexProvider,
  getCodexCurrent, setCodexDefaultModel, setCodexReasoningEffort, setCodexApiAuth,
  getCodexProviderModels, getCodexProviderModelsMap, addCodexModel, deleteCodexModel, upsertCodexModel,
  syncCodexModelCatalog, readCodexModelCatalog,
  openCodexDir, isCodexInstalled,
  // 内部结构函数导出，供测试/复用
  normalizeProvider, buildProviderToml, buildCatalogEntry,
}
