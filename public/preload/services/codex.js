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