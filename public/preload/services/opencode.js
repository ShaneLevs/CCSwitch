const fs = require('node:fs')
const path = require('node:path')
const JSON5 = require('json5')

const OPENCODE_DIR = path.join(window.utools.getPath('home'), '.config', 'opencode')
const OPENCODE_CONFIG_PATH = path.join(OPENCODE_DIR, 'opencode.json')
const OPENCODE_DATA_DIR = (() => {
  // 新版 Opencode (>= 2025) 数据目录（按优先级）：
  //   1. %LOCALAPPDATA%\opencode          （Windows 常规安装）
  //   2. ~/.local/share/opencode          （Windows XDG 模式 + macOS/Linux）
  // 注意：preload 环境 process.env.LOCALAPPDATA 可能为空（uTools Electron 精简）
  const home = window.utools.getPath('home')
  const candidates = []
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'opencode'))
  }
  candidates.push(path.join(home, '.local', 'share', 'opencode'))
  // Windows 兜底：HOME\AppData\Local\opencode
  if (process.platform === 'win32') {
    candidates.push(path.join(home, 'AppData', 'Local', 'opencode'))
  }
  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c, 'opencode.db'))) return c } catch { /* ignore */ }
  }
  // 都找不到时返回 XDG 路径（后续逻辑会检测到 DB 不存在并返回空状态）
  return path.join(home, '.local', 'share', 'opencode')
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
  let DatabaseSync
  try {
    ({ DatabaseSync } = require('node:sqlite'))
  } catch {
    console.warn('[opencode] node:sqlite 不可用，跳过 DB 读取')
    return usage.calculateStats([], new Map())
  }
  const db = new DatabaseSync(dbPath, { open: true, readOnly: true })
  const sessionMap = new Map()
  const messageRecords = []

  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    if (!tables.includes('session')) return usage.calculateStats([], new Map())

    // session 表 schema 确认：tokens_input, tokens_output, tokens_reasoning,
    //                            tokens_cache_read, tokens_cache_write (独立列)
    const sessionCols = new Set(db.prepare("PRAGMA table_info(session)").all().map(c => c.name))
    const hasPerSessionTokens = sessionCols.has('tokens_input')
    const sInputCol = sessionCols.has('tokens_input') ? 'tokens_input' : null
    const sOutputCol = sessionCols.has('tokens_output') ? 'tokens_output' : null
    const sReasonCol = sessionCols.has('tokens_reasoning') ? 'tokens_reasoning' : null
    const sCacheReadCol = sessionCols.has('tokens_cache_read') ? 'tokens_cache_read' : null
    const sCacheWriteCol = sessionCols.has('tokens_cache_write') ? 'tokens_cache_write' : null

    const sessionSql = 'SELECT id, title, directory, time_created, time_updated FROM session'
    const sessions = db.prepare(sessionSql).all()
    for (const s of sessions) {
      const ts = new Date(s.time_created).toISOString()
      sessionMap.set(s.id, {
        sessionId: s.id,
        timestamp: ts,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
        project: s.directory || s.title || 'unknown',
        projectPath: s.directory || 'unknown',
        title: s.title || '',
      })
    }

    // 每个 session 一行 message record，汇总该 session 的 token
    // time_created 是毫秒时间戳（不是 ISO 字符串）
    // 别名不能与 SQLite 关键字冲突（to/from/tr 等）
    const tokenSql = `SELECT id,${sInputCol} as inp,${sOutputCol} as out,${sReasonCol} as reas,${sCacheReadCol} as cread,${sCacheWriteCol} as cwrite,time_created FROM session WHERE (tokens_input > 0 OR tokens_output > 0)`
    const rows = db.prepare(tokenSql).all()
    for (const r of rows) {
      const tsMs = r.time_created
      if (!tsMs || tsMs <= 0) continue
      const ts = new Date(tsMs).toISOString()
      const total = (r.inp || 0) + (r.out || 0) + (r.reas || 0) + (r.cread || 0) + (r.cwrite || 0)
      if (total === 0) continue
      messageRecords.push({
        sessionId: r.id,
        model: 'unknown', // 历史消息级别的 model 需要解析 session metadata blob，暂不支持
        project: sessionMap.get(r.id)?.project || 'unknown',
        projectPath: sessionMap.get(r.id)?.projectPath || 'unknown',
        timestamp: ts,
        date: ts.split('T')[0],
        inputTokens: r.inp || 0,
        outputTokens: r.out || 0,
        cacheReadTokens: r.cread || 0,
        cacheCreationTokens: r.cwrite || 0,
        totalTokens: total,
      })
      if (sessionMap.has(r.id)) {
        const sess = sessionMap.get(r.id)
        sess.inputTokens = r.inp || 0
        sess.outputTokens = r.out || 0
        sess.cacheReadTokens = r.cread || 0
        sess.cacheCreationTokens = r.cwrite || 0
        sess.timestamp = ts
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
