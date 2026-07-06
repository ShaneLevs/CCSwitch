const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const PI_DIR = () => path.join(require('os').homedir(), '.pi', 'agent')
const PI_SETTINGS_PATH = () => path.join(PI_DIR(), 'settings.json')
const PI_MODELS_PATH = () => path.join(PI_DIR(), 'models.json')
const PI_SESSIONS_DIR = () => path.join(PI_DIR(), 'sessions')
const PI_NPM_DIR = () => path.join(PI_DIR(), 'npm', 'node_modules')
const PI_CMD_TIMEOUT = { list: 15_000, install: 120_000, default: 30_000 }

// ==================== 路径发现 ====================

const resolvePiPath = () => {
  const candidates = [
    path.join(require('os').homedir(), '.local', 'bin', 'pi'),
    path.join(require('os').homedir(), '.npm-global', 'bin', 'pi'),
    '/usr/local/bin/pi',
    '/usr/bin/pi',
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch { /* ignore */ }
  }
  try {
    const which = execSync('which pi 2>nul || where pi 2>nul', { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0]
    if (which) return which
  } catch { /* ignore */ }
  return 'pi'
}

const readJson = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf-8' }))
  } catch { return null }
}

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
}

const runPiCmd = (args, timeout) => {
  const piBin = resolvePiPath()
  const fullCmd = `"${piBin}" ${args.join(' ')}`
  const env = { ...process.env }
  delete env.CLAUDECODE
  try {
    const stdout = execSync(fullCmd, { encoding: 'utf-8', timeout: timeout || PI_CMD_TIMEOUT.default, env })
    return { success: true, stdout: stdout.trim(), stderr: '' }
  } catch (error) {
    return { success: false, stdout: (error.stdout || '').trim(), stderr: (error.stderr || error.message || '').trim() }
  }
}

// ==================== Settings ====================

const readPiSettings = () => readJson(PI_SETTINGS_PATH()) || {}
const writePiSettings = (data) => writeJson(PI_SETTINGS_PATH(), data)

// ==================== Models / Providers ====================

const readPiModels = () => readJson(PI_MODELS_PATH()) || { providers: {} }
const writePiModels = (data) => writeJson(PI_MODELS_PATH(), data)

const getPiProviderList = () => {
  const models = readPiModels()
  const settings = readPiSettings()
  return Object.entries(models.providers || {}).map(([name, cfg]) => ({
    name,
    apiKey: cfg.apiKey || '',
    baseUrl: cfg.baseUrl || '',
    api: cfg.api || '',
    models: (cfg.models || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      contextWindow: m.contextWindow || 0,
      maxTokens: m.maxTokens || 0,
      reasoning: !!m.reasoning,
      cost: m.cost || null,
      compat: m.compat || null,
    })),
    isDefault: settings.defaultProvider === name,
  }))
}

const setPiDefaultProvider = (providerName) => {
  const settings = readPiSettings()
  settings.defaultProvider = providerName
  writePiSettings(settings)
}

const setPiDefaultModel = (modelId) => {
  const settings = readPiSettings()
  settings.defaultModel = modelId
  writePiSettings(settings)
}

const updatePiProvider = (providerName, updates) => {
  const models = readPiModels()
  if (!models.providers) models.providers = {}
  if (!models.providers[providerName]) models.providers[providerName] = { models: [] }
  Object.assign(models.providers[providerName], updates)
  writePiModels(models)
}

// ==================== Extensions (Packages) ====================

const getPiExtensions = () => {
  const settings = readPiSettings()
  const packages = settings.packages || []
  return packages.map(src => {
    const pkgDir = path.join(PI_NPM_DIR(), ...src.replace('npm:', '').split('/'))
    const name = src.replace('npm:', '')
    let version = '', description = ''
    try {
      const pkg = readJson(path.join(pkgDir, 'package.json'))
      if (pkg) { version = pkg.version || ''; description = pkg.description || '' }
    } catch { /* ignore */ }

    // pi config resource introspection
    let resources = { extensions: [], skills: [], mcpServers: [] }
    const claudePlugin = readJson(path.join(pkgDir, '.claude-plugin', 'plugin.json'))
    if (claudePlugin?.mcpServers) {
      resources.mcpServers = Object.keys(claudePlugin.mcpServers)
    }

    const skillsDir = path.join(pkgDir, 'skills')
    if (fs.existsSync(skillsDir)) {
      try {
        resources.skills = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
      } catch { /* ignore */ }
    }

    const extDir = path.join(pkgDir, 'pi')
    if (fs.existsSync(extDir)) {
      try {
        resources.extensions = fs.readdirSync(extDir)
          .filter(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.mjs'))
      } catch { /* ignore */ }
    }

    return { name, source: src, version, description, resources, enabled: true }
  })
}

const installPiExtension = (source) => {
  const result = runPiCmd(['install', source], PI_CMD_TIMEOUT.install)
  return { success: result.success, message: result.success ? result.stdout : result.stderr }
}

const uninstallPiExtension = (source) => {
  const result = runPiCmd(['remove', source], PI_CMD_TIMEOUT.default)
  return { success: result.success, message: result.success ? result.stdout : result.stderr }
}

// ==================== Skills ====================

const getPiSkills = () => {
  const extensions = getPiExtensions()
  const all = []
  for (const ext of extensions) {
    for (const skill of ext.resources.skills) {
      let frontmatter = ''
      const skillMd = path.join(PI_NPM_DIR(), ext.name, 'skills', skill, 'SKILL.md')
      try {
        const content = fs.readFileSync(skillMd, { encoding: 'utf-8' })
        const match = content.match(/^---\n([\s\S]*?)\n---/)
        frontmatter = match ? match[1] : ''
      } catch { /* ignore */ }
      all.push({ name: skill, package: ext.name, frontmatter, enabled: true })
    }
  }
  return all
}

// ==================== MCP Servers from Extensions ====================

const getPiMcpServers = () => {
  const extensions = getPiExtensions()
  const all = []
  for (const ext of extensions) {
    const claudePlugin = readJson(path.join(PI_NPM_DIR(), ext.name, '.claude-plugin', 'plugin.json'))
    if (claudePlugin?.mcpServers) {
      for (const [name, cfg] of Object.entries(claudePlugin.mcpServers)) {
        all.push({
          serverName: name,
          package: ext.name,
          command: cfg.command,
          args: cfg.args || [],
          enabled: true,
        })
      }
    }
  }
  return all
}

// ==================== Usage ====================

const decodePiSessionPath = (encodedDir) => {
  try {
    return encodedDir.replace(/^--/, '').replace(/--$/, '').replace(/--/g, '\\')
  } catch { return encodedDir }
}

const readPiUsage = () => {
  const sessionsDir = PI_SESSIONS_DIR()
  if (!fs.existsSync(sessionsDir)) return emptyResult()

  const sessionDirs = fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  const messageRecords = []
  const sessionMap = new Map()

  for (const encodedDir of sessionDirs) {
    const dirPath = path.join(sessionsDir, encodedDir)
    const projectPath = decodePiSessionPath(encodedDir)
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'))
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dirPath, file), { encoding: 'utf-8' })
        const lines = content.split('\n').filter(l => l.trim())
        let sessionId = ''
        for (const line of lines) {
          try {
            const d = JSON.parse(line)
            if (d.type === 'session') {
              sessionId = d.id
              if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, { sessionId, timestamp: d.timestamp, cwd: d.cwd || projectPath, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 })
              }
            }
            if (d.type === 'message' && d.message?.usage) {
              const u = d.message.usage
              const model = d.message.model || d.model || 'unknown'
              const ts = d.timestamp || ''
              const input = u.input || 0
              const output = u.output || 0
              const cacheRead = u.cacheRead || 0
              const cacheWrite = u.cacheWrite || 0
              const total = u.totalTokens || (input + output + cacheRead + cacheWrite)

              messageRecords.push({
                sessionId, model, project: path.basename(projectPath), projectPath,
                timestamp: ts, date: ts.split('T')[0],
                inputTokens: input, outputTokens: output,
                cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
                totalTokens: total, cost: u.cost?.total || 0,
              })

              if (sessionMap.has(sessionId)) {
                const s = sessionMap.get(sessionId)
                s.inputTokens += input
                s.outputTokens += output
                s.cacheReadTokens += cacheRead
                s.cacheWriteTokens += cacheWrite
                s.totalCost += u.cost?.total || 0
                if (ts > s.timestamp) s.timestamp = ts
              }
            }
          } catch { /* skip parse error */ }
        }
      } catch { /* skip file read error */ }
    }
  }

  return calculateStats(messageRecords, sessionMap)
}

const emptyResult = () => {
  const now = new Date()
  const contributions = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    contributions.push({ date: d.toISOString().split('T')[0], tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
  }
  return {
    summary: { totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0, messageCount: 0, sessionCount: 0 },
    modelStats: [], contributions, avgTokensPerSession: 0, recentSessions: [],
  }
}

const calculateStats = (messageRecords, sessionMap) => {
  const sessionArr = Array.from(sessionMap.values()).map(s => ({
    ...s, totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheWriteTokens,
  }))
  sessionArr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const summary = messageRecords.reduce((acc, r) => {
    acc.inputTokens += r.inputTokens
    acc.outputTokens += r.outputTokens
    acc.cacheReadTokens += r.cacheReadTokens
    acc.cacheWriteTokens += r.cacheWriteTokens
    acc.totalTokens += r.totalTokens
    acc.totalCost += r.cost || 0
    return acc
  }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, totalCost: 0, messageCount: messageRecords.length, sessionCount: sessionMap.size })

  const modelMap = new Map()
  messageRecords.forEach(r => {
    if (!modelMap.has(r.model)) modelMap.set(r.model, { name: r.model, tokens: 0, inputTokens: 0, outputTokens: 0 })
    const m = modelMap.get(r.model)
    m.tokens += r.totalTokens; m.inputTokens += r.inputTokens; m.outputTokens += r.outputTokens
  })
  const modelStats = Array.from(modelMap.values()).sort((a, b) => b.tokens - a.tokens)

  const contributionMap = new Map()
  messageRecords.forEach(r => {
    if (!contributionMap.has(r.date)) contributionMap.set(r.date, { date: r.date, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
    const d = contributionMap.get(r.date)
    d.tokens += r.totalTokens; d.inputTokens += r.inputTokens; d.outputTokens += r.outputTokens
    if (!d.models[r.model]) d.models[r.model] = { inputTokens: 0, outputTokens: 0 }
    d.models[r.model].inputTokens += r.inputTokens; d.models[r.model].outputTokens += r.outputTokens
  })

  const contributions = fillEmptyContributions(Array.from(contributionMap.values()).sort((a, b) => a.date.localeCompare(b.date)))
  const avgTokensPerSession = sessionMap.size > 0 ? Math.round(summary.totalTokens / sessionMap.size) : 0
  const recentSessions = sessionArr.slice(0, 10)

  return { summary, modelStats, contributions, avgTokensPerSession, recentSessions, messageRecords }
}

const fillEmptyContributions = (contributions) => {
  const now = new Date()
  const dateMap = new Map()
  for (const d of contributions) dateMap.set(d.date, d)
  const result = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    result.push(dateMap.get(key) || { date: key, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
  }
  return result
}

// ==================== 目录操作 ====================

const openPiDir = () => {
  const dir = PI_DIR()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  try { window.utools.shellOpenPath(dir) } catch { /* ignore */ }
}

const isPiInstalled = () => {
  try {
    const piBin = resolvePiPath()
    return fs.existsSync(piBin) || piBin === 'pi'
  } catch { return false }
}

module.exports = {
  readPiSettings, writePiSettings,
  readPiModels, writePiModels,
  getPiProviderList, setPiDefaultProvider, setPiDefaultModel, updatePiProvider,
  getPiExtensions, installPiExtension, uninstallPiExtension,
  getPiSkills, getPiMcpServers,
  readPiUsage,
  openPiDir, isPiInstalled, resolvePiPath,
}
