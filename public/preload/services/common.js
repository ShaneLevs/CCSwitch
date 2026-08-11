const fs = require('node:fs')
const path = require('node:path')
const crypto = require('./crypto')

// ==================== 通用配置 ====================
// 设计约定：
//   - 模型/供应商主数据：存 uTools DB（ccswitch_common_providers）
//   - MCP：存 uTools DB（ccswitch_common_mcp，格式与 ~/.mcp.json 一致 { mcpServers: {...} }）
//   - Skill：只读扫描 ~/.agents/skills 目录下的 SKILL.md

const AGENTS_DIR = () => path.join(window.utools.getPath('home'), '.agents')
const COMMON_SKILLS_DIR = () => path.join(AGENTS_DIR(), 'skills')

const DOC_PROVIDERS = 'ccswitch_common_providers'

const readDoc = (docId, fallback) => {
  try {
    const doc = window.utools.db.get(docId)
    if (doc && doc.data !== undefined) return doc.data
  } catch (e) { /* ignore */ }
  return fallback
}

const writeDoc = (docId, data) => {
  try {
    const doc = { _id: docId, data, updatedAt: Date.now() }
    const existing = window.utools.db.get(docId)
    if (existing) doc._rev = existing._rev
    window.utools.db.put(doc)
    return true
  } catch (e) {
    console.error(`写入通用配置(${docId})失败:`, e)
    return false
  }
}

// ==================== 供应商 / 模型库（uTools DB） ====================

const DEFAULT_PROVIDERS = { providers: [] }

const readCommonProviders = () => {
  const data = readDoc(DOC_PROVIDERS, null) || DEFAULT_PROVIDERS
  const providers = Array.isArray(data.providers) ? data.providers : []
  // 解密 apiKey（读时解密，写时加密）
  return {
    providers: providers.map((p) => ({
      ...p,
      apiKey: crypto.decrypt(p.apiKey || ''),
      headers: p.headers || {},
      models: Array.isArray(p.models) ? p.models : [],
    })),
  }
}

const writeCommonProviders = (data) => {
  const providers = (data && Array.isArray(data.providers) ? data.providers : []).map((p) => ({
    ...p,
    apiKey: crypto.encrypt(p.apiKey || ''),
  }))
  return writeDoc(DOC_PROVIDERS, { providers })
}

const getCommonProviderList = () => readCommonProviders().providers

const addCommonProvider = (provider) => {
  const { providers } = readCommonProviders()
  if (providers.some((p) => p.name === provider.name)) throw new Error(`供应商 ${provider.name} 已存在`)
  providers.push({ name: provider.name, apiKey: '', baseUrl: '', api: 'openai-completions', headers: {}, authHeader: true, models: [], ...provider })
  return writeCommonProviders({ providers })
}

const updateCommonProvider = (name, patch) => {
  const { providers } = readCommonProviders()
  const idx = providers.findIndex((p) => p.name === name)
  if (idx === -1) throw new Error(`供应商 ${name} 不存在`)
  providers[idx] = { ...providers[idx], ...patch, name }
  return writeCommonProviders({ providers })
}

const deleteCommonProvider = (name) => {
  const { providers } = readCommonProviders()
  const next = providers.filter((p) => p.name !== name)
  if (next.length === providers.length) throw new Error(`供应商 ${name} 不存在`)
  return writeCommonProviders({ providers: next })
}

const addCommonModel = (providerName, model) => {
  const { providers } = readCommonProviders()
  const prov = providers.find((p) => p.name === providerName)
  if (!prov) throw new Error(`供应商 ${providerName} 不存在`)
  if (prov.models.some((m) => m.id === model.id)) throw new Error(`模型 ${model.id} 已存在`)
  prov.models.push(model)
  return writeCommonProviders({ providers })
}

const updateCommonModel = (providerName, modelId, patch) => {
  const { providers } = readCommonProviders()
  const prov = providers.find((p) => p.name === providerName)
  if (!prov) throw new Error(`供应商 ${providerName} 不存在`)
  const idx = prov.models.findIndex((m) => m.id === modelId)
  if (idx === -1) throw new Error(`模型 ${modelId} 不存在`)
  prov.models[idx] = { ...prov.models[idx], ...patch, id: patch.id || modelId }
  return writeCommonProviders({ providers })
}

const deleteCommonModel = (providerName, modelId) => {
  const { providers } = readCommonProviders()
  const prov = providers.find((p) => p.name === providerName)
  if (!prov) throw new Error(`供应商 ${providerName} 不存在`)
  prov.models = prov.models.filter((m) => m.id !== modelId)
  return writeCommonProviders({ providers })
}

// ==================== MCP（本地 ~/.mcp.json + 云端 uTools DB 双存储） ====================
// 本地：直接读写用户级 ~/.mcp.json（多数 agent 共同读取），保留文件中其他字段
// 云端：uTools DB 单 doc：ccswitch_common_mcp -> { mcpServers: { name: config } }
const DOC_MCP = 'ccswitch_common_mcp'
const LOCAL_MCP_PATH = () => path.join(window.utools.getPath('home'), '.mcp.json')

// ---------- 云端（uTools DB） ----------

const readCommonMcpDoc = () => {
  const data = readDoc(DOC_MCP, null) || { mcpServers: {} }
  if (!data.mcpServers || typeof data.mcpServers !== 'object') data.mcpServers = {}
  return data
}

const getCommonMcpServers = () => readCommonMcpDoc().mcpServers

const upsertCommonMcpServer = (name, serverConfig) => {
  const data = readCommonMcpDoc()
  data.mcpServers[name] = serverConfig
  return writeDoc(DOC_MCP, { mcpServers: data.mcpServers })
}

const deleteCommonMcpServer = (name) => {
  const data = readCommonMcpDoc()
  if (!data.mcpServers[name]) return false
  delete data.mcpServers[name]
  return writeDoc(DOC_MCP, { mcpServers: data.mcpServers })
}

// 一次性把整份 { mcpServers: {...} } 写回（用于批量导入/覆盖）
const writeCommonMcpServers = (mcpServers) => {
  const obj = (mcpServers && typeof mcpServers === 'object') ? mcpServers : {}
  return writeDoc(DOC_MCP, { mcpServers: obj })
}

// ---------- 本地（~/.mcp.json 文件） ----------

const readLocalMcpRaw = () => {
  try {
    if (!fs.existsSync(LOCAL_MCP_PATH())) return null
    return JSON.parse(fs.readFileSync(LOCAL_MCP_PATH(), { encoding: 'utf-8' }))
  } catch (e) {
    console.error('读取本地 MCP 配置失败:', e)
    return null
  }
}

// 读整份文件（保留 mcpServers 之外的其他字段，如 $schema）
const readLocalMcpDoc = () => {
  const raw = readLocalMcpRaw()
  const doc = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : { mcpServers: {} }
  if (!doc.mcpServers || typeof doc.mcpServers !== 'object') doc.mcpServers = {}
  return doc
}

const writeLocalMcpDoc = (doc) => {
  try {
    fs.writeFileSync(LOCAL_MCP_PATH(), JSON.stringify(doc, null, 2), { encoding: 'utf-8' })
    return true
  } catch (e) {
    console.error('写入本地 MCP 配置失败:', e)
    return false
  }
}

const getLocalMcpServers = () => readLocalMcpDoc().mcpServers

const upsertLocalMcpServer = (name, serverConfig) => {
  const doc = readLocalMcpDoc()
  doc.mcpServers[name] = serverConfig
  return writeLocalMcpDoc(doc)
}

const deleteLocalMcpServer = (name) => {
  const doc = readLocalMcpDoc()
  if (!doc.mcpServers[name]) return false
  delete doc.mcpServers[name]
  return writeLocalMcpDoc(doc)
}

const writeLocalMcpServers = (mcpServers) => {
  const doc = readLocalMcpDoc()
  const obj = (mcpServers && typeof mcpServers === 'object') ? mcpServers : {}
  doc.mcpServers = obj
  return writeLocalMcpDoc(doc)
}

// ---------- 跨端操作 ----------

// 把另一端的一个 server 复制到本端（同名覆盖）。target: 'local'（云端→本地）| 'cloud'（本地→云端）
const copyCommonMcpServer = (name, target) => {
  if (target === 'local') {
    const cloud = readCommonMcpDoc().mcpServers
    if (!cloud[name]) throw new Error(`云端不存在 ${name}`)
    const doc = readLocalMcpDoc()
    doc.mcpServers[name] = JSON.parse(JSON.stringify(cloud[name]))
    return writeLocalMcpDoc(doc)
  } else {
    const local = readLocalMcpDoc().mcpServers
    if (!local[name]) throw new Error(`本地不存在 ${name}`)
    const data = readCommonMcpDoc()
    data.mcpServers[name] = JSON.parse(JSON.stringify(local[name]))
    return writeDoc(DOC_MCP, { mcpServers: data.mcpServers })
  }
}

// 批量同步：direction 'toLocal'（云端→本地）| 'toCloud'（本地→云端）
// 并集合并：源端覆盖目标端同名配置，目标端独有配置保留，不丢数据
const syncCommonMcp = (direction) => {
  const local = readLocalMcpDoc()
  const cloud = readCommonMcpDoc()
  if (direction === 'toLocal') {
    for (const [k, v] of Object.entries(cloud.mcpServers)) {
      local.mcpServers[k] = JSON.parse(JSON.stringify(v))
    }
    return { total: Object.keys(cloud.mcpServers).length, written: writeLocalMcpDoc(local) }
  } else {
    for (const [k, v] of Object.entries(local.mcpServers)) {
      cloud.mcpServers[k] = JSON.parse(JSON.stringify(v))
    }
    return { total: Object.keys(local.mcpServers).length, written: writeDoc(DOC_MCP, { mcpServers: cloud.mcpServers }) }
  }
}

// ==================== Skill 启停（.disabled 文件夹方式，同 Claude Code） ====================
// 通用 Skill 存放在 ~/.agents/skills（跨 Agent 共享）。
// 禁用 = 将 skill 目录移动到 ~/.agents/skills/.disabled/<name>，启用 = 移回，
// 与 Claude Code 的 skill 启停方式一致（agent 扫描时 .disabled 目录会被忽略）。

const DISABLED_DIR_NAME = '.disabled'

const getDisabledSkillsDir = () => path.join(COMMON_SKILLS_DIR(), DISABLED_DIR_NAME)

// 设置通用 Skill 启用/禁用（物理移动目录到 .disabled / 移回）
const setCommonSkillEnabled = (skillName, enabled) => {
  if (!skillName) return { success: false, error: 'Skill 名不能为空' }
  const disabledDir = getDisabledSkillsDir()
  const sourceDir = enabled
    ? path.join(disabledDir, skillName)
    : path.join(COMMON_SKILLS_DIR(), skillName)
  const targetDir = enabled
    ? path.join(COMMON_SKILLS_DIR(), skillName)
    : path.join(disabledDir, skillName)
  if (!fs.existsSync(sourceDir)) return { success: false, error: 'Skill 不存在' }
  try {
    if (!enabled) fs.mkdirSync(disabledDir, { recursive: true })
    fs.renameSync(sourceDir, targetDir)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// 删除通用 Skill（已禁用时从 .disabled 删除）
const deleteCommonSkill = (skillName) => {
  if (!skillName) return { success: false, error: 'Skill 名不能为空' }
  const candidates = [
    path.join(COMMON_SKILLS_DIR(), skillName),
    path.join(getDisabledSkillsDir(), skillName),
  ]
  const dir = candidates.find((p) => fs.existsSync(p))
  if (!dir) return { success: false, error: 'Skill 目录不存在' }
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ==================== Skill（只读扫描 ~/.agents/skills） ====================

// 解析 SKILL.md 的 name/description（frontmatter 简单解析，兼容单行与多行块首行）
const parseSkillFrontmatter = (content) => {
  const result = { name: '', description: '' }
  if (!content) return result
  const lines = content.split('\n')
  let inFm = false
  let descKey = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '---') {
      if (!inFm) { inFm = true; continue }
      break
    }
    if (!inFm) continue
    const nameMatch = trimmed.match(/^name:\s*(.+)$/)
    if (nameMatch) { result.name = nameMatch[1].trim().replace(/^["']|["']$/g, ''); continue }
    const descMatch = trimmed.match(/^description:\s*(.*)$/)
    if (descMatch) {
      if (descMatch[1].trim()) {
        result.description = descMatch[1].trim().replace(/^["']|["']$/g, '')
      } else {
        descKey = true // 多行块：description: |
      }
      continue
    }
    // 多行 description 块：取第一个非空行
    if (descKey && !result.description && trimmed) {
      result.description = trimmed.replace(/^["']|["']$/g, '')
      descKey = false
    }
  }
  return result
}

// 读取 ~/.agents/skills 下每个子目录的 SKILL.md（目录不存在时自动创建）
// 启用的 skill 直接扫描；禁用的 skill 扫描 .disabled 子目录（与 Claude Code 机制一致）
const readCommonSkills = () => {
  const dir = COMMON_SKILLS_DIR()
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (e) { /* 创建失败则按空目录处理 */ }
    return []
  }
  try {
    const skills = []
    const readOne = (skillDir, dirName, enabled) => {
      const skillMdPath = path.join(skillDir, 'SKILL.md')
      if (!fs.existsSync(skillMdPath)) return
      try {
        const content = fs.readFileSync(skillMdPath, { encoding: 'utf-8' })
        const fm = parseSkillFrontmatter(content)
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
        let fileCount = 0
        try {
          fileCount = fs.readdirSync(skillDir).filter(f => !f.startsWith('.')).length
        } catch { /* ignore */ }
        skills.push({
          name: fm.name || dirName,
          dirName,
          description: fm.description,
          dir: skillDir,
          frontmatter: fmMatch ? fmMatch[1] : '',
          fileCount,
          enabled,
        })
      } catch (e) { /* 单个 skill 解析失败跳过 */ }
    }

    // 启用的 skills（跳过 .disabled 及隐藏目录）
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      readOne(path.join(dir, entry.name), entry.name, true)
    }

    // 禁用的 skills（.disabled 目录内）
    const disabledDir = getDisabledSkillsDir()
    if (fs.existsSync(disabledDir)) {
      const disabledEntries = fs.readdirSync(disabledDir, { withFileTypes: true })
      for (const entry of disabledEntries) {
        if (!entry.isDirectory()) continue
        readOne(path.join(disabledDir, entry.name), entry.name, false)
      }
    }

    skills.sort((a, b) => a.name.localeCompare(b.name))
    return skills
  } catch (e) {
    console.error('读取通用 Skill 目录失败:', e)
    return []
  }
}

const openCommonSkillsDir = () => {
  const dir = COMMON_SKILLS_DIR()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  window.utools.shellOpenPath(dir)
}

const getCommonSkillsPath = () => {
  const dir = COMMON_SKILLS_DIR()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

module.exports = {
  COMMON_SKILLS_DIR,
  readCommonProviders, writeCommonProviders, getCommonProviderList,
  addCommonProvider, updateCommonProvider, deleteCommonProvider,
  addCommonModel, updateCommonModel, deleteCommonModel,
  getCommonMcpServers, upsertCommonMcpServer, deleteCommonMcpServer, writeCommonMcpServers,
  getLocalMcpServers, upsertLocalMcpServer, deleteLocalMcpServer, writeLocalMcpServers,
  copyCommonMcpServer, syncCommonMcp,
  readCommonSkills, openCommonSkillsDir, getCommonSkillsPath,
  setCommonSkillEnabled, deleteCommonSkill,
}
