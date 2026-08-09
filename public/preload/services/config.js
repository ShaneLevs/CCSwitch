const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const CLAUDE_SETTINGS_PATH = path.join(window.utools.getPath('home'), '.claude', 'settings.json')
const CLAUDE_JSON_PATH = path.join(window.utools.getPath('home'), '.claude.json')
const CLAUDE_MCP_PATH = path.join(window.utools.getPath('home'), '.mcp.json')
const CLAUDE_DIR_MCP_PATH = path.join(window.utools.getPath('home'), '.claude', '.mcp.json')
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

// ==================== Claude MCP (~/.mcp.json) ====================
// MCP 配置存放在用户级 ~/.mcp.json（Claude Code 官方推荐格式，所有项目生效），
// 不再写 ~/.claude.json；首次读取时自动迁移旧数据。

const readMcpJson = () => {
  try {
    if (!fs.existsSync(CLAUDE_MCP_PATH)) return null
    return JSON.parse(fs.readFileSync(CLAUDE_MCP_PATH, { encoding: 'utf-8' }))
  } catch (error) {
    console.error('读取 Claude MCP 配置失败:', error)
    return null
  }
}

const writeMcpJson = (data) => {
  try {
    fs.writeFileSync(CLAUDE_MCP_PATH, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
    return true
  } catch (error) {
    console.error('写入 Claude MCP 配置失败:', error)
    return false
  }
}

const readClaudeDirMcp = () => {
  try {
    if (!fs.existsSync(CLAUDE_DIR_MCP_PATH)) return null
    return JSON.parse(fs.readFileSync(CLAUDE_DIR_MCP_PATH, { encoding: 'utf-8' }))
  } catch (error) {
    console.error('读取 ~/.claude/.mcp.json 失败:', error)
    return null
  }
}

// 清空 ~/.claude/.mcp.json 中的 mcpServers；文件变空则删除
const clearClaudeDirMcp = () => {
  try {
    if (!fs.existsSync(CLAUDE_DIR_MCP_PATH)) return
    const data = readClaudeDirMcp() || {}
    if (data.mcpServers) delete data.mcpServers
    if (Object.keys(data).length) fs.writeFileSync(CLAUDE_DIR_MCP_PATH, JSON.stringify(data, null, 2))
    else fs.unlinkSync(CLAUDE_DIR_MCP_PATH)
  } catch (error) {
    console.error('清理 ~/.claude/.mcp.json 失败:', error)
  }
}

// 多来源合并读取（不做自动迁移），~/.mcp.json 优先级最高：
//   1. ~/.claude/.mcp.json（旧）
//   2. ~/.claude.json 顶层 mcpServers（旧，user scope）
//   3. ~/.mcp.json（新，用户后续新增都写这里）
const getMcpServers = () => {
  const merged = {}
  const claudeDir = readClaudeDirMcp()
  if (claudeDir && claudeDir.mcpServers) Object.assign(merged, claudeDir.mcpServers)
  const legacy = readClaudeJson()
  if (legacy.mcpServers) Object.assign(merged, legacy.mcpServers)
  const current = readMcpJson()
  if (current && current.mcpServers) Object.assign(merged, current.mcpServers)
  return merged
}

// 检测除 ~/.mcp.json 之外还有哪些旧来源配置了 MCP（用于显示迁移按钮）
const getLegacyMcpSources = () => {
  const sources = []
  const legacy = readClaudeJson()
  if (legacy.mcpServers && Object.keys(legacy.mcpServers).length) sources.push('~/.claude.json')
  const claudeDir = readClaudeDirMcp()
  if (claudeDir && claudeDir.mcpServers && Object.keys(claudeDir.mcpServers).length) sources.push('~/.claude/.mcp.json')
  return sources
}

// 手动迁移：把旧来源的 MCP 合并写入 ~/.mcp.json（同名不覆盖已有），成功后清空旧来源
const migrateMcpToUserFile = () => {
  const target = readMcpJson() || { mcpServers: {} }
  if (!target.mcpServers) target.mcpServers = {}
  let migrated = 0
  const collect = (src) => {
    if (!src || !src.mcpServers) return
    for (const [k, v] of Object.entries(src.mcpServers)) {
      if (!(k in target.mcpServers)) { target.mcpServers[k] = v; migrated++ }
    }
  }
  collect(readClaudeDirMcp())
  const legacy = readClaudeJson()
  collect(legacy)
  if (!writeMcpJson(target)) return { success: false, error: '写入 ~/.mcp.json 失败' }
  // 迁移成功后清空旧来源
  if (legacy && legacy.mcpServers && Object.keys(legacy.mcpServers).length) {
    delete legacy.mcpServers
    writeClaudeJson(legacy)
  }
  clearClaudeDirMcp()
  return { success: true, migrated }
}

const upsertMcpServer = (name, serverConfig) => {
  // 新增/更新一律写入 ~/.mcp.json
  const config = readMcpJson() || { mcpServers: {} }
  if (!config.mcpServers) config.mcpServers = {}
  config.mcpServers[name] = serverConfig
  return writeMcpJson(config)
}

const deleteMcpServer = (name) => {
  // 从所有来源删除，保证合并列表中消失
  const current = readMcpJson()
  if (current && current.mcpServers && current.mcpServers[name]) {
    delete current.mcpServers[name]
    const ok = writeMcpJson(current)
    if (!ok) return { success: false, error: '写入 ~/.mcp.json 失败' }
    return { success: true }
  }
  const legacy = readClaudeJson()
  if (legacy.mcpServers && legacy.mcpServers[name]) {
    delete legacy.mcpServers[name]
    writeClaudeJson(legacy)
    return { success: true }
  }
  const claudeDir = readClaudeDirMcp()
  if (claudeDir && claudeDir.mcpServers && claudeDir.mcpServers[name]) {
    delete claudeDir.mcpServers[name]
    if (Object.keys(claudeDir.mcpServers).length) fs.writeFileSync(CLAUDE_DIR_MCP_PATH, JSON.stringify(claudeDir, null, 2))
    else clearClaudeDirMcp()
    return { success: true }
  }
  return { success: false, error: 'MCP 配置不存在' }
}

const getClaudeMcpPath = () => CLAUDE_MCP_PATH

// 打开 ~/.mcp.json（不存在则先创建空配置）
const openClaudeMcpFile = () => {
  try {
    if (!fs.existsSync(CLAUDE_MCP_PATH)) writeMcpJson({ mcpServers: {} })
    window.utools.shellOpenPath(CLAUDE_MCP_PATH)
  } catch (error) {
    console.error('打开 Claude MCP 配置失败:', error)
  }
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

// ==================== Claude 热力图历史 ====================
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
  CLAUDE_SETTINGS_PATH, CLAUDE_JSON_PATH, CLAUDE_MCP_PATH, CLAUDE_DIR_MCP_PATH, CLAUDE_SKILLS_PATH,
  readClaudeSettings, writeClaudeSettings, getClaudeSettingsPath,
  readClaudeJson, writeClaudeJson, getClaudeJsonPath,
  getNativeId, getMcpServers, upsertMcpServer, deleteMcpServer,
  getLegacyMcpSources, migrateMcpToUserFile,
  getClaudeMcpPath, openClaudeMcpFile,
  exportConfigsToFile, importConfigsFromFile,
  compressConfigs, decompressConfigs,
  saveOverriddenEnv, getOverriddenEnv, saveHeatmapHistory, getHeatmapHistory,
  saveUsageCache, getUsageCache,
}
