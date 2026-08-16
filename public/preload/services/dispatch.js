// 通用配置主数据 → 各 Agent 模型配置下发
// 把通用库（uTools DB）中的 provider + model 写入 5 个 agent 的模型配置：
//   claude   → ~/.claude/settings.json  env（ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL）
//   opencode → ~/.config/opencode.json(.jsonc)  provider[id]（options.baseURL/apiKey + models[id]）
//   pi       → ~/.pi/agent/models.json  providers[name] + settings.json（可选默认）
//   omp      → ~/.omp/agent/models.yml  providers[name]（无默认模型概念，modelRoles 由用户自行配置）
//   reasonix → ~/.reasonix/config.toml  providers[] + .env（可选 default_model）
// 全部为纯文件写入，不依赖 agent 二进制；每个目标独立 try/catch，单个失败不影响其他目标。
const config = require('./config')
const opencode = require('./opencode')
const pi = require('./pi')
const omp = require('./omp')
const reasonix = require('./reasonix')

// cost 规范化（与 pi/omp 一致：全 0 省略，Pi schema 约定 0 无效）
const normalizeCost = (cost) => {
  if (!cost || typeof cost !== 'object') return undefined
  const c = {
    input: Number(cost.input) || 0,
    output: Number(cost.output) || 0,
    cacheRead: Number(cost.cacheRead) || 0,
    cacheWrite: Number(cost.cacheWrite) || 0,
  }
  if (!c.input && !c.output && !c.cacheRead && !c.cacheWrite) return undefined
  return c
}

// ==================== 各 Agent 写入实现 ====================

// Claude Code：模型配置即 env 里的 ANTHROPIC_MODEL（无独立 provider 概念，baseUrl + 认证 key 一并写入）
const dispatchToClaude = (provider, model) => {
  const settings = config.readClaudeSettings() || {}
  if (!settings.env) settings.env = {}
  const env = settings.env
  // 认证变量互斥：删 ANTHROPIC_API_KEY，写 ANTHROPIC_AUTH_TOKEN（与 CC 默认认证方式一致）
  delete env.ANTHROPIC_API_KEY
  if (provider.apiKey) env.ANTHROPIC_AUTH_TOKEN = provider.apiKey
  else delete env.ANTHROPIC_AUTH_TOKEN
  if (provider.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl
  else delete env.ANTHROPIC_BASE_URL
  env.ANTHROPIC_MODEL = model.id
  if (!config.writeClaudeSettings(settings)) throw new Error('写入 settings.json 失败')
  return `已写入 ~/.claude/settings.json（ANTHROPIC_MODEL=${model.id}）`
}

// OpenCode CLI：provider[id]（options.baseURL/apiKey）+ models[id]
const dispatchToOpencode = (provider, model, opts) => {
  const id = opts.providerName || provider.name
  const current = opencode.readOpencodeConfig()
  if (!current.provider) current.provider = {}
  const prev = current.provider[id] || {}
  const nextOptions = { ...(prev.options || {}) }
  if (provider.baseUrl) nextOptions.baseURL = provider.baseUrl
  if (provider.apiKey) nextOptions.apiKey = provider.apiKey
  const nextModels = { ...(prev.models || {}) }
  const nextModel = { name: model.name || model.id }
  if (model.contextWindow || model.maxTokens) {
    nextModel.limit = {}
    if (model.contextWindow) nextModel.limit.context = model.contextWindow
    if (model.maxTokens) nextModel.limit.output = model.maxTokens
  }
  // 兼容性字段（compat）平铺进模型条目，与 opencode 配置模型可携带自定义字段一致
  if (model.compat && typeof model.compat === 'object') {
    for (const [k, v] of Object.entries(model.compat)) nextModel[k] = v
  }
  nextModels[model.id] = nextModel
  current.provider[id] = {
    ...prev,
    npm: prev.npm || '@ai-sdk/openai-compatible',
    name: prev.name || provider.name,
    options: nextOptions,
    models: nextModels,
  }
  if (!opencode.writeOpencodeConfig(current)) throw new Error('写入 opencode 配置失败')
  return `provider[${id}] 已更新，模型 ${model.id} 已写入`
}

// Pi Agent：models.json providers[name] + settings.json（可选默认）
const dispatchToPi = (provider, model, opts) => {
  const name = opts.providerName || provider.name
  const models = pi.readPiModels()
  if (!models.providers) models.providers = {}
  const prev = models.providers[name] || {}
  models.providers[name] = {
    ...prev,
    apiKey: provider.apiKey || prev.apiKey || '',
    baseUrl: provider.baseUrl || prev.baseUrl || '',
    api: provider.api || prev.api || 'openai-completions',
    headers: { ...(prev.headers || {}), ...(provider.headers || {}) },
    authHeader: provider.authHeader !== undefined ? !!provider.authHeader : !!prev.authHeader,
    models: Array.isArray(prev.models) ? prev.models : [],
  }
  const list = models.providers[name].models
  if (!list.some(m => m.id === model.id)) {
    const cost = normalizeCost(model.cost)
    const entry = {
      id: model.id,
      name: model.name || model.id,
      contextWindow: model.contextWindow || undefined,
      maxTokens: model.maxTokens || undefined,
      reasoning: !!model.reasoning,
      input: model.input || ['text'],
    }
    if (cost) entry.cost = cost
    if (model.compat && typeof model.compat === 'object' && Object.keys(model.compat).length) entry.compat = model.compat
    list.push(entry)
  }
  pi.writePiModels(models)
  let suffix = ''
  if (opts.setDefault) {
    const settings = pi.readPiSettings()
    settings.defaultProvider = name
    settings.defaultModel = model.id
    pi.writePiSettings(settings)
    suffix = '，已设为默认模型'
  }
  return `供应商 ${name} 已更新，模型 ${model.id} 已写入${suffix}`
}

// omp：models.yml providers[name]（无默认模型概念，modelRoles 需用户自行配置）
const dispatchToOmp = (provider, model, opts) => {
  const name = opts.providerName || provider.name
  const models = omp.readOmpModels()
  if (!models.providers) models.providers = {}
  const prev = models.providers[name] || {}
  models.providers[name] = {
    ...prev,
    apiKey: provider.apiKey || prev.apiKey || '',
    baseUrl: provider.baseUrl || prev.baseUrl || '',
    api: provider.api || prev.api || 'openai-completions',
    headers: { ...(prev.headers || {}), ...(provider.headers || {}) },
    authHeader: provider.authHeader !== undefined ? !!provider.authHeader : !!prev.authHeader,
    models: Array.isArray(prev.models) ? prev.models : [],
  }
  const list = models.providers[name].models
  if (!list.some(m => m.id === model.id)) {
    const cost = normalizeCost(model.cost)
    const entry = {
      id: model.id,
      name: model.name || model.id,
      contextWindow: model.contextWindow || undefined,
      maxTokens: model.maxTokens || undefined,
      reasoning: !!model.reasoning,
      input: model.input || ['text'],
    }
    if (cost) entry.cost = cost
    if (model.compat && typeof model.compat === 'object' && Object.keys(model.compat).length) entry.compat = model.compat
    list.push(entry)
  }
  omp.writeOmpModels(models)
  return `供应商 ${name} 已更新，模型 ${model.id} 已写入（默认模型请到 omp 配置页配置 modelRoles）`
}

// Reasonix：config.toml providers[] + .env key + 可选 default_model
const dispatchToReasonix = (provider, model, opts) => {
  const name = opts.providerName || provider.name
  const doc = reasonix.readReasonixConfig()
  if (!Array.isArray(doc.providers)) doc.providers = []
  const prev = doc.providers.find(p => p.name === name)
  const kindMap = {
    'openai-completions': 'openai',
    'openai-responses': 'openai',
    'anthropic-messages': 'anthropic',
    'google-generative-ai': 'google',
  }
  const kind = kindMap[provider.api] || (prev && prev.kind) || 'openai'
  let apiKeyEnv = (prev && prev.api_key_env) || ''
  if (!apiKeyEnv) apiKeyEnv = reasonix.generateReasonixApiKeyEnv(name)
  if (provider.apiKey) reasonix.writeReasonixEnvKey(apiKeyEnv, provider.apiKey)
  // 保留原 provider 的扩展字段（model_overrides / price / extra_body 等）
  const entry = {
    ...(prev || {}),
    name,
    kind,
    ...(provider.baseUrl ? { base_url: provider.baseUrl } : {}),
    api_key_env: apiKeyEnv,
    models: [...(Array.isArray(prev && prev.models) ? prev.models : (prev && prev.model ? [prev.model] : []))],
  }
  delete entry.model // 统一为 models 数组
  if (!entry.models.includes(model.id)) entry.models.push(model.id)
  doc.providers = doc.providers.filter(p => p.name !== name)
  doc.providers.push(entry)
  let suffix = ''
  if (opts.setDefault) {
    doc.default_model = `${name}/${model.id}`
    suffix = '，已设为默认模型'
  }
  reasonix.writeReasonixConfig(doc)
  return `供应商 ${name} 已更新，模型 ${model.id} 已写入${suffix}`
}

const APP_DISPATCHERS = {
  claude: { run: dispatchToClaude },
  opencode: { run: dispatchToOpencode },
  pi: { run: dispatchToPi },
  omp: { run: dispatchToOmp },
  reasonix: { run: dispatchToReasonix },
}

// 主入口：provider/model 来自通用库（apiKey 已解密），targets = [{ app, providerName?, setDefault? }]
// 返回 [{ app, ok, message }]，单个失败不中断其他目标
const dispatchCommonModel = (provider, model, targets) => {
  if (!provider || !provider.name) throw new Error('请选择供应商')
  if (!model || !model.id) throw new Error('请选择模型')
  const list = Array.isArray(targets) ? targets : []
  if (list.length === 0) throw new Error('请选择目标 agent')
  const results = []
  for (const t of list) {
    const d = APP_DISPATCHERS[t && t.app]
    if (!d) {
      results.push({ app: (t && t.app) || 'unknown', ok: false, message: '未知目标 agent' })
      continue
    }
    try {
      const message = d.run(provider, model, {
        providerName: (t.providerName && String(t.providerName).trim()) || provider.name,
        setDefault: !!t.setDefault,
      })
      results.push({ app: t.app, ok: true, message })
    } catch (e) {
      results.push({ app: t.app, ok: false, message: e.message || String(e) })
    }
  }
  return results
}

module.exports = {
  dispatchCommonModel,
  // 内部实现导出，供测试/复用
  dispatchToClaude, dispatchToOpencode, dispatchToPi, dispatchToOmp, dispatchToReasonix,
}
