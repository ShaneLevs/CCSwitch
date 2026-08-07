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
// 公开 getter（brief 接口要求导出 getReasonixHome / getReasonixConfigPath）
const getReasonixHome = REASONIX_HOME
const getReasonixConfigPath = REASONIX_CONFIG_PATH

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
  const list = Array.isArray(prov.models) ? prov.models : (prov.model ? [prov.model] : [])
  if (!list.includes(modelId)) return true
  prov.models = list.filter(m => m !== modelId)
  if (prov.model) delete prov.model
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
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`密钥名 ${key} 不合法`)
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
