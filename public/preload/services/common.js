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

// ==================== MCP（存 uTools DB，格式与 ~/.mcp.json 一致） ====================
// 单 doc：ccswitch_common_mcp -> { mcpServers: { name: config } }
const DOC_MCP = 'ccswitch_common_mcp'

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

// 读取 ~/.agents/skills 下每个子目录的 SKILL.md（只读展示，目录不存在时自动创建）
const readCommonSkills = () => {
  const dir = COMMON_SKILLS_DIR()
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (e) { /* 创建失败则按空目录处理 */ }
    return []
  }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const skills = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillDir = path.join(dir, entry.name)
      const skillMdPath = path.join(skillDir, 'SKILL.md')
      if (!fs.existsSync(skillMdPath)) continue
      try {
        const content = fs.readFileSync(skillMdPath, { encoding: 'utf-8' })
        const fm = parseSkillFrontmatter(content)
        skills.push({
          name: fm.name || entry.name,
          dirName: entry.name,
          description: fm.description,
          dir: skillDir,
        })
      } catch (e) { /* 单个 skill 解析失败跳过 */ }
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
  readCommonSkills, openCommonSkillsDir,
}
