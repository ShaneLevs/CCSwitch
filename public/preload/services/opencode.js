const fs = require('node:fs')
const path = require('node:path')
const JSON5 = require('json5')

const OPENCODE_DIR = path.join(window.utools.getPath('home'), '.config', 'opencode')
const OPENCODE_CONFIG_PATH = path.join(OPENCODE_DIR, 'opencode.json')
const OPENCODE_DATA_DIR = (() => {
  // 新版 Opencode (>= 2025) 数据目录：Windows %LOCALAPPDATA%\opencode，macOS/Linux ~/.local/share/opencode
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) return path.join(localAppData, 'opencode')
  return path.join(window.utools.getPath('home'), '.local', 'share', 'opencode')
})()
const OPENCODE_DB_PATH = path.join(OPENCODE_DATA_DIR, 'opencode.db')
const OPENCODE_STORAGE_DIR = path.join(OPENCODE_DATA_DIR, 'storage')

const getOpencodeConfigPath = () => OPENCODE_CONFIG_PATH

const readOpencodeConfig = () => {
  try {
    if (!fs.existsSync(OPENCODE_CONFIG_PATH)) return { provider: {}, mcp: {}, plugin: [] }
    const content = fs.readFileSync(OPENCODE_CONFIG_PATH, { encoding: 'utf-8' })
    const parsed = JSON5.parse(content)
    if (!parsed.provider) parsed.provider = {}
    if (!parsed.mcp) parsed.mcp = {}
    if (!parsed.plugin) parsed.plugin = []
    return parsed
  } catch (error) {
    console.error('读取 OpenCode 配置失败:', error)
    return { provider: {}, mcp: {}, plugin: [] }
  }
}

const writeOpencodeConfig = (config) => {
  try {
    if (!fs.existsSync(OPENCODE_DIR)) fs.mkdirSync(OPENCODE_DIR, { recursive: true })
    fs.writeFileSync(OPENCODE_CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: 'utf-8' })
    return true
  } catch (error) {
    console.error('写入 OpenCode 配置失败:', error)
    return false
  }
}

// ==================== Provider ====================

const getOpencodeProviders = () => {
  const config = readOpencodeConfig()
  return config.provider || {}
}

const setOpencodeProvider = (id, providerConfig) => {
  const config = readOpencodeConfig()
  if (!config.provider) config.provider = {}
  config.provider[id] = providerConfig
  return writeOpencodeConfig(config)
}

// Batch set multiple providers in a single read-write cycle
const setOpencodeProviders = (providersMap) => {
  const config = readOpencodeConfig()
  if (!config.provider) config.provider = {}
  for (const [id, providerConfig] of Object.entries(providersMap)) {
    config.provider[id] = providerConfig
  }
  return writeOpencodeConfig(config)
}

const removeOpencodeProvider = (id) => {
  const config = readOpencodeConfig()
  if (config.provider && config.provider[id]) {
    delete config.provider[id]
    return writeOpencodeConfig(config)
  }
  return false
}

// ==================== MCP ====================

const getOpencodeMcpServers = () => {
  const config = readOpencodeConfig()
  return config.mcp || {}
}

const setOpencodeMcpServer = (id, serverConfig) => {
  const config = readOpencodeConfig()
  if (!config.mcp) config.mcp = {}
  config.mcp[id] = serverConfig
  return writeOpencodeConfig(config)
}

const removeOpencodeMcpServer = (id) => {
  const config = readOpencodeConfig()
  if (config.mcp && config.mcp[id]) {
    delete config.mcp[id]
    return writeOpencodeConfig(config)
  }
  return false
}

// ==================== Plugin ====================

const getOpencodePlugins = () => {
  const config = readOpencodeConfig()
  return config.plugin || []
}

const setOpencodePlugins = (plugins) => {
  const config = readOpencodeConfig()
  config.plugin = plugins
  return writeOpencodeConfig(config)
}

const addOpencodePlugin = (pluginName) => {
  const config = readOpencodeConfig()
  if (!config.plugin) config.plugin = []
  if (!config.plugin.includes(pluginName)) {
    config.plugin.push(pluginName)
  }
  return writeOpencodeConfig(config)
}

const removeOpencodePlugin = (pluginName) => {
  const config = readOpencodeConfig()
  if (config.plugin) {
    config.plugin = config.plugin.filter(p => p !== pluginName)
  }
  return writeOpencodeConfig(config)
}

// ==================== Models.dev Presets ====================

const fetchModelsDevPresets = () => {
  const https = require('node:https')
  return new Promise((resolve, reject) => {
    https.get('https://models.dev/api.json', {
      headers: { 'user-agent': 'CCSwitch/1.0', 'accept': 'application/json' },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        https.get(res.headers.location, { headers: { 'user-agent': 'CCSwitch/1.0' }, timeout: 10000 }, (res2) => {
          let data = ''
          res2.on('data', chunk => data += chunk)
          res2.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
        }).on('error', reject)
        return
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')) })
  })
}

// ==================== Usage Statistics ====================

const readOpencodeUsage = () => {
  const usage = require('./usage')
  // 优先 SQLite，回退 JSON storage
  if (fs.existsSync(OPENCODE_DB_PATH)) {
    try {
      const data = readOpencodeUsageFromDb(OPENCODE_DB_PATH)
      if (data.messageRecords.length > 0) return data
    } catch (e) {
      console.warn('[opencode] SQLite 读取失败，回退 JSON storage:', e.message)
    }
  }
  if (fs.existsSync(OPENCODE_STORAGE_DIR)) {
    try {
      return readOpencodeUsageFromJson(OPENCODE_STORAGE_DIR)
    } catch (e) {
      console.warn('[opencode] JSON storage 读取失败:', e.message)
    }
  }
  return usage.calculateStats([], new Map())
}

const readOpencodeUsageFromDb = (dbPath) => {
  const usage = require('./usage')
  // 尝试加载更好用的 sqlite3，没有就用简化版
  let Database
  try {
    Database = require('better-sqlite3')
  } catch {
    console.warn('[opencode] better-sqlite3 未安装，无法读取 DB')
    return usage.calculateStats([], new Map())
  }

  const db = new Database(dbPath, { readonly: true })
  const sessionMap = new Map()
  const messageRecords = []

  try {
    // 查表结构
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    if (!tables.includes('message')) return usage.calculateStats([], new Map())

    // 查询 message 表（可能带 part 子表）
    const msgCols = db.prepare("PRAGMA table_info(message)").all().map(c => c.name)
    const partCols = tables.includes('part') ? db.prepare("PRAGMA table_info(part)").all().map(c => c.name) : []

    // 先读 session
    if (tables.includes('session')) {
      const sessionCols = db.prepare("PRAGMA table_info(session)").all().map(c => c.name)
      const sessions = db.prepare('SELECT * FROM session').all()
      for (const s of sessions) {
        sessionMap.get(s.id || s.sessionId)
        sessionMap.set(s.id || s.sessionId, {
          sessionId: s.id || s.sessionId,
          timestamp: s.createdAt || s.created_at || s.updatedAt || s.updated_at || '',
          inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
          project: s.cwd || s.projectPath || 'unknown',
          projectPath: s.cwd || s.projectPath || 'unknown',
        })
      }
    }

    // 读 message 及其关联的 part
    const messages = db.prepare('SELECT * FROM message ORDER BY id').all()
    // 批量取 part（text 内容包含 model 信息）
    const partsByMsg = new Map()
    if (tables.includes('part') && partCols.length) {
      const allParts = db.prepare('SELECT * FROM part ORDER BY id').all()
      for (const p of allParts) {
        const mid = p.messageId || p.message_id
        if (!mid) continue
        if (!partsByMsg.has(mid)) partsByMsg.set(mid, [])
        partsByMsg.get(mid).push(p)
      }
    }

    for (const m of messages) {
      const mid = m.id
      const sessionId = m.sessionId || m.session_id || 'unknown'
      // 汇总 token 使用：可能在 message 字段里也可能在 part 里
      let inputTokens = m.inputTokens || m.input_tokens || m.promptTokens || m.prompt_tokens || 0
      const outputTokens = m.outputTokens || m.output_tokens || m.completionTokens || m.completion_tokens || 0
      const cacheRead = m.cacheReadTokens || m.cache_read_input_tokens || 0
      const cacheCreate = m.cacheCreationTokens || m.cache_creation_input_tokens || 0

      // 从 part 补充 model 名（summary/assistant 的 text 可能含 model）
      let model = m.model || 'unknown'
      const parts = partsByMsg.get(mid) || []
      if (!model || model === 'unknown') {
        for (const p of parts) {
          if (p.type === 'text' && typeof p.text === 'string') {
            // 可以从 part metadata 捕获 model，若没有则保持 unknown
            if (p.model) { model = p.model; break }
          }
        }
      }

      if (inputTokens + outputTokens === 0) continue

      const ts = m.createdAt || m.created_at || m.timestamp || ''
      messageRecords.push({
        sessionId, model,
        project: sessionMap.get(sessionId)?.project || 'unknown',
        projectPath: sessionMap.get(sessionId)?.projectPath || 'unknown',
        timestamp: ts,
        date: typeof ts === 'string' && ts ? ts.split('T')[0] : '',
        inputTokens, outputTokens,
        cacheReadTokens: cacheRead,
        cacheCreationTokens: cacheCreate,
        totalTokens: inputTokens + outputTokens + cacheRead + cacheCreate,
      })

      if (sessionMap.has(sessionId)) {
        const s = sessionMap.get(sessionId)
        s.inputTokens += inputTokens
        s.outputTokens += outputTokens
        s.cacheReadTokens += cacheRead
        s.cacheCreationTokens += cacheCreate
        if (ts && ts > s.timestamp) s.timestamp = ts
      }
    }
  } finally {
    db.close()
  }

  return usage.calculateStats(messageRecords, sessionMap)
}

const readOpencodeUsageFromJson = (storageDir) => {
  const usage = require('./usage')
  const sessionMap = new Map()
  const messageRecords = []

  const sessionDir = path.join(storageDir, 'session')
  const partDir = path.join(storageDir, 'part')

  if (!fs.existsSync(sessionDir)) return usage.calculateStats([], new Map())

  let sessionFiles = []
  try {
    sessionFiles = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'))
  } catch { return usage.calculateStats([], new Map()) }

  for (const sf of sessionFiles) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(sessionDir, sf), 'utf8'))
      const sessionId = s.id || sf.replace('.json', '')
      sessionMap.set(sessionId, {
        sessionId,
        timestamp: s.createdAt || s.updatedAt || '',
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
        project: s.cwd || s.title || 'unknown',
        projectPath: s.cwd || 'unknown',
      })

      // part 文件：{id}-part-{n}.json
      let partFiles = []
      try {
        partFiles = fs.readdirSync(partDir).filter(f => f.startsWith(sessionId))
      } catch { /* ignore */ }

      for (const pf of partFiles) {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(partDir, pf), 'utf8'))
          if (p.role !== 'assistant') continue
          const u = p.usage || p.metadata?.usage || {}
          const inputTokens = u.inputTokens || u.input_tokens || u.promptTokens || 0
          const outputTokens = u.outputTokens || u.output_tokens || u.completionTokens || 0
          if (inputTokens + outputTokens === 0) continue
          const ts = p.createdAt || p.timestamp || ''
          messageRecords.push({
            sessionId,
            model: p.model || 'unknown',
            project: sessionMap.get(sessionId)?.project || 'unknown',
            projectPath: sessionMap.get(sessionId)?.projectPath || 'unknown',
            timestamp: ts,
            date: typeof ts === 'string' && ts ? ts.split('T')[0] : '',
            inputTokens, outputTokens,
            cacheReadTokens: u.cacheReadTokens || u.cache_read_input_tokens || 0,
            cacheCreationTokens: u.cacheCreationTokens || u.cache_creation_input_tokens || 0,
            totalTokens: inputTokens + outputTokens + (u.cacheReadTokens || 0) + (u.cacheCreationTokens || 0),
          })
          if (sessionMap.has(sessionId)) {
            const sess = sessionMap.get(sessionId)
            sess.inputTokens += inputTokens
            sess.outputTokens += outputTokens
            sess.cacheReadTokens += u.cacheReadTokens || 0
            sess.cacheCreationTokens += u.cacheCreationTokens || 0
            if (ts && ts > sess.timestamp) sess.timestamp = ts
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return usage.calculateStats(messageRecords, sessionMap)
}

module.exports = {
  getOpencodeConfigPath,
  readOpencodeConfig,
  writeOpencodeConfig,
  getOpencodeProviders,
  setOpencodeProvider,
  setOpencodeProviders,
  removeOpencodeProvider,
  getOpencodeMcpServers,
  setOpencodeMcpServer,
  removeOpencodeMcpServer,
  getOpencodePlugins,
  setOpencodePlugins,
  addOpencodePlugin,
  removeOpencodePlugin,
  fetchModelsDevPresets,
  readOpencodeUsage,
}
