const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const CLAUDE_SETTINGS_PATH = path.join(window.utools.getPath('home'), '.claude', 'settings.json')
const CLAUDE_JSON_PATH = path.join(window.utools.getPath('home'), '.claude.json')
const CLAUDE_SKILLS_PATH = path.join(window.utools.getPath('home'), '.claude', 'skills')

let _claudeSettingsCache = null

const readClaudeSettings = () => {
  try {
    if (_claudeSettingsCache) {
      try {
        const currentMtime = fs.statSync(CLAUDE_SETTINGS_PATH).mtimeMs
        if (currentMtime === _claudeSettingsCache.mtime) return _claudeSettingsCache.data
      } catch { /* fall through to re-read */ }
    }
    if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) return null
    const content = fs.readFileSync(CLAUDE_SETTINGS_PATH, { encoding: 'utf-8' })
    const data = JSON.parse(content)
    _claudeSettingsCache = { data, mtime: fs.statSync(CLAUDE_SETTINGS_PATH).mtimeMs }
    return data
  } catch (error) {
    console.error('读取 Claude 配置失败:', error)
    return null
  }
}

const writeClaudeSettings = (settings) => {
  try {
    const dir = path.dirname(CLAUDE_SETTINGS_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), { encoding: 'utf-8' })
    _claudeSettingsCache = { data: settings, mtime: fs.statSync(CLAUDE_SETTINGS_PATH).mtimeMs }
    return true
  } catch (error) {
    console.error('写入 Claude 配置失败:', error)
    return false
  }
}

const getClaudeSettingsPath = () => CLAUDE_SETTINGS_PATH

// mtime 缓存：同一调用链内避免重复读文件；外部修改通过 mtime 变化自动触发重读
let _claudeJsonCache = null

const readClaudeJson = () => {
  try {
    if (_claudeJsonCache) {
      try {
        const currentMtime = fs.statSync(CLAUDE_JSON_PATH).mtimeMs
        if (currentMtime === _claudeJsonCache.mtime) return _claudeJsonCache.data
      } catch { /* fall through to re-read */ }
    }
    if (!fs.existsSync(CLAUDE_JSON_PATH)) return {}
    const content = fs.readFileSync(CLAUDE_JSON_PATH, { encoding: 'utf-8' })
    const data = JSON.parse(content)
    _claudeJsonCache = { data, mtime: fs.statSync(CLAUDE_JSON_PATH).mtimeMs }
    return data
  } catch (error) {
    console.error('读取 Claude JSON 配置失败:', error)
    return {}
  }
}

const writeClaudeJson = (data) => {
  try {
    fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
    _claudeJsonCache = { data, mtime: fs.statSync(CLAUDE_JSON_PATH).mtimeMs }
    return true
  } catch (error) {
    console.error('写入 Claude JSON 配置失败:', error)
    return false
  }
}

const getClaudeJsonPath = () => CLAUDE_JSON_PATH

const getNativeId = () => window.utools.getNativeId()

const getMcpServers = () => {
  const config = readClaudeJson()
  return config.mcpServers || {}
}

const upsertMcpServer = (name, serverConfig) => {
  const config = readClaudeJson()
  if (!config.mcpServers) config.mcpServers = {}
  config.mcpServers[name] = serverConfig
  return writeClaudeJson(config)
}

const deleteMcpServer = (name) => {
  const config = readClaudeJson()
  if (config.mcpServers && config.mcpServers[name]) {
    delete config.mcpServers[name]
    const ok = writeClaudeJson(config)
    return { success: ok, error: ok ? null : '写入配置文件失败' }
  }
  return { success: false, error: 'MCP 配置不存在' }
}

const exportConfigsToFile = (filePath, configs) => {
  const data = { version: '1.0', exportedAt: Date.now(), app: 'ccswitch', configs }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
  return true
}

const importConfigsFromFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

const compressConfigs = (configs) => {
  const json = JSON.stringify(configs)
  const compressed = zlib.deflateSync(Buffer.from(json))
  return compressed.toString('base64')
}

const decompressConfigs = (compressedStr) => {
  try {
    const buffer = Buffer.from(compressedStr, 'base64')
    const decompressed = zlib.inflateSync(buffer)
    return JSON.parse(decompressed.toString())
  } catch (error) {
    console.error('解压配置失败:', error)
    return null
  }
}

const saveOverriddenEnv = (envData) => {
  try {
    const docId = `ccswitch_overridden_env_${getNativeId()}`
    const doc = { _id: docId, env: envData, updatedAt: Date.now() }
    const existing = window.utools.db.get(docId)
    if (existing) doc._rev = existing._rev
    window.utools.db.put(doc)
    return true
  } catch (error) {
    console.error('保存覆盖 env 失败:', error)
    return false
  }
}

const getOverriddenEnv = () => {
  try {
    const docId = `ccswitch_overridden_env_${getNativeId()}`
    const doc = window.utools.db.get(docId)
    return doc?.env || null
  } catch (error) {
    return null
  }
}

const saveHeatmapHistory = (contributions) => {
  try {
    const nativeId = getNativeId()
    const docId = `ccswitch_heatmap_${nativeId}`
    const days = {}
    for (const day of contributions) {
      if (day.tokens > 0) {
        days[day.date] = { tokens: day.tokens, inputTokens: day.inputTokens, outputTokens: day.outputTokens, models: day.models }
      }
    }
    const doc = { _id: docId, nativeId, days, updatedAt: Date.now() }
    const existing = window.utools.db.get(docId)
    if (existing) doc._rev = existing._rev
    window.utools.db.put(doc)
  } catch (error) {
    console.error('保存热力图历史失败:', error)
  }
}

const getHeatmapHistory = () => {
  try {
    const docId = `ccswitch_heatmap_${getNativeId()}`
    const doc = window.utools.db.get(docId)
    return doc?.days || {}
  } catch (error) {
    return {}
  }
}

// ==================== Claude 使用统计缓存 ====================
// 缓存策略：
//   signature = `${messageCount}:${maxMtimeMs}` — 轻量计算，只需 readdir + statSync
//   命中缓存 → 直接返回 stats，不解析 JSONL
//   未命中 → 全量解析后写缓存
//   refresh 按钮 → 强制跳过缓存

const saveUsageCache = (signature, stats) => {
  try {
    const nativeId = getNativeId()
    const docId = `ccswitch_usage_cache_${nativeId}`
    const doc = {
      _id: docId,
      nativeId,
      signature,
      stats: {
        summary: stats.summary,
        modelStats: stats.modelStats,
        contributions: stats.contributions,
      },
      updatedAt: Date.now(),
    }
    const existing = window.utools.db.get(docId)
    if (existing) doc._rev = existing._rev
    window.utools.db.put(doc)
  } catch (error) {
    console.error('保存 usage 缓存失败:', error)
  }
}

const getUsageCache = () => {
  try {
    const docId = `ccswitch_usage_cache_${getNativeId()}`
    const doc = window.utools.db.get(docId)
    return doc ? { signature: doc.signature, stats: doc.stats, updatedAt: doc.updatedAt } : null
  } catch (error) {
    return null
  }
}

module.exports = {
  CLAUDE_SETTINGS_PATH, CLAUDE_JSON_PATH, CLAUDE_SKILLS_PATH,
  readClaudeSettings, writeClaudeSettings, getClaudeSettingsPath,
  readClaudeJson, writeClaudeJson, getClaudeJsonPath,
  getNativeId, getMcpServers, upsertMcpServer, deleteMcpServer,
  exportConfigsToFile, importConfigsFromFile,
  compressConfigs, decompressConfigs,
  saveOverriddenEnv, getOverriddenEnv, saveHeatmapHistory, getHeatmapHistory,
  saveUsageCache, getUsageCache,
}
