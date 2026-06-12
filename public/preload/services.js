const fs = require('node:fs')
const path = require('node:path')

const crypto = require('./services/crypto')
const config = require('./services/config')
const mcp = require('./services/mcp')
const opencode = require('./services/opencode')

const {
  CLAUDE_SETTINGS_PATH, CLAUDE_JSON_PATH, CLAUDE_SKILLS_PATH,
  readClaudeSettings, writeClaudeSettings, getClaudeSettingsPath,
  readClaudeJson, writeClaudeJson, getClaudeJsonPath,
  getNativeId, getMcpServers, upsertMcpServer, deleteMcpServer,
  exportConfigsToFile, importConfigsFromFile,
  compressConfigs, decompressConfigs,
  saveOverriddenEnv, getOverriddenEnv, saveHeatmapHistory, getHeatmapHistory
} = config

const {
  getDisabledMcpServers, disableMcpServer, enableMcpServer,
  deleteDisabledMcpServer, getAllMcpServersWithStatus, getMcpServerTools
} = mcp

const { encrypt, decrypt, encryptString, decryptString } = crypto

const {
  getOpencodeConfigPath, readOpencodeConfig, writeOpencodeConfig,
  getOpencodeProviders, setOpencodeProvider, removeOpencodeProvider,
  getOpencodeMcpServers, setOpencodeMcpServer, removeOpencodeMcpServer,
  getOpencodePlugins, setOpencodePlugins, addOpencodePlugin, removeOpencodePlugin,
  fetchModelsDevPresets,
} = opencode

window.services = {
  getNativeId,
  getDisabledMcpServers,
  disableMcpServer,
  enableMcpServer,
  deleteDisabledMcpServer,
  getAllMcpServersWithStatus,
  readClaudeSettings,
  writeClaudeSettings,
  getClaudeSettingsPath,
  readClaudeJson,
  writeClaudeJson,
  getClaudeJsonPath,
  getMcpServers,
  upsertMcpServer,
  deleteMcpServer,
  getMcpServerTools,
  encryptKey: encrypt,
  decryptKey: decrypt,
  saveOverriddenEnv,
  getOverriddenEnv,
  saveHeatmapHistory,
  getHeatmapHistory,
  exportConfigsToFile,
  importConfigsFromFile,
  compressConfigs,
  decompressConfigs,
  encryptString,
  decryptString,

  // ==================== OpenCode ====================
  getOpencodeConfigPath,
  readOpencodeConfig,
  writeOpencodeConfig,
  getOpencodeProviders,
  setOpencodeProvider,
  removeOpencodeProvider,
  getOpencodeMcpServers,
  setOpencodeMcpServer,
  removeOpencodeMcpServer,
  getOpencodePlugins,
  setOpencodePlugins,
  addOpencodePlugin,
  removeOpencodePlugin,
  fetchModelsDevPresets,

  // ==================== Skills ====================

  getSkills() {
    try {
      if (!fs.existsSync(CLAUDE_SKILLS_PATH)) return []

      let skillUsage = {}
      try {
        if (fs.existsSync(CLAUDE_JSON_PATH)) {
          const claudeJson = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, { encoding: 'utf-8' }))
          skillUsage = claudeJson.skillUsage || {}
        }
      } catch (e) {
        console.error('读取 skillUsage 失败:', e)
      }

      const disabledDir = path.join(CLAUDE_SKILLS_PATH, '.disabled')
      const skills = []

      // 读取启用的 skills
      const entries = fs.readdirSync(CLAUDE_SKILLS_PATH, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === '.disabled') continue
        const skillName = entry.name
        const skillPath = path.join(CLAUDE_SKILLS_PATH, skillName)
        const skillMdPath = path.join(skillPath, 'SKILL.md')
        if (!fs.existsSync(skillMdPath)) continue

        try {
          const content = fs.readFileSync(skillMdPath, { encoding: 'utf-8' })
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
          const frontmatter = frontmatterMatch ? frontmatterMatch[1] : ''
          const usage = skillUsage[skillName] || {}
          const skillFiles = fs.readdirSync(skillPath)
          skills.push({ name: skillName, frontmatter, disabled: false, scope: 'global', skillMdPath, fileCount: skillFiles.length, usageCount: usage.usageCount || 0, lastUsedAt: usage.lastUsedAt || null })
        } catch (e) {
          console.error('读取 skill 文件失败:', skillMdPath, e)
        }
      }

      // 读取禁用的 skills
      if (fs.existsSync(disabledDir)) {
        const disabledEntries = fs.readdirSync(disabledDir, { withFileTypes: true })
        for (const entry of disabledEntries) {
          if (!entry.isDirectory()) continue
          const skillName = entry.name
          const skillPath = path.join(disabledDir, skillName)
          const skillMdPath = path.join(skillPath, 'SKILL.md')
          if (!fs.existsSync(skillMdPath)) continue

          try {
            const content = fs.readFileSync(skillMdPath, { encoding: 'utf-8' })
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
            const frontmatter = frontmatterMatch ? frontmatterMatch[1] : ''
            const usage = skillUsage[skillName] || {}
            const skillFiles = fs.readdirSync(skillPath)
            skills.push({ name: skillName, frontmatter, disabled: true, scope: 'global', skillMdPath, fileCount: skillFiles.length, usageCount: usage.usageCount || 0, lastUsedAt: usage.lastUsedAt || null })
          } catch (e) {
            console.error('读取 skill 文件失败:', skillMdPath, e)
          }
        }
      }

      // 读取项目级 skills
      try {
        const homeDir = window.utools.getPath('home')
        const projectsDir = path.join(homeDir, '.claude', 'projects')
        if (fs.existsSync(projectsDir)) {
          const projectPathMap = this._buildProjectPathMap(projectsDir)
          for (const [, projectPath] of projectPathMap) {
            if (!projectPath || projectPath === 'unknown' || !fs.existsSync(projectPath)) continue
            if (path.resolve(projectPath) === path.resolve(homeDir)) continue
            const projectSkillsDir = path.join(projectPath, '.claude', 'skills')
            if (!fs.existsSync(projectSkillsDir)) continue

            const projectSkills = fs.readdirSync(projectSkillsDir, { withFileTypes: true })
            for (const entry of projectSkills) {
              if (!entry.isDirectory() || entry.name === '.disabled') continue
              const skillName = entry.name
              const skillMdPath = path.join(projectSkillsDir, skillName, 'SKILL.md')
              if (!fs.existsSync(skillMdPath)) continue

              try {
                const content = fs.readFileSync(skillMdPath, { encoding: 'utf-8' })
                const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
                const frontmatter = frontmatterMatch ? frontmatterMatch[1] : ''
                const usage = skillUsage[skillName] || {}
                const skillDir = path.join(projectSkillsDir, skillName)
                const skillFiles = fs.readdirSync(skillDir)
                skills.push({ name: skillName, frontmatter, disabled: false, scope: 'project', projectName: path.basename(projectPath), projectPath, skillMdPath, fileCount: skillFiles.length, usageCount: usage.usageCount || 0, lastUsedAt: usage.lastUsedAt || null })
              } catch (e) {
                console.error('读取项目 skill 文件失败:', skillMdPath, e)
              }
            }

            // 读取项目级禁用的 skills
            const projectDisabledDir = path.join(projectSkillsDir, '.disabled')
            if (fs.existsSync(projectDisabledDir)) {
              const disabledEntries = fs.readdirSync(projectDisabledDir, { withFileTypes: true })
              for (const entry of disabledEntries) {
                if (!entry.isDirectory()) continue
                const skillName = entry.name
                const skillMdPath = path.join(projectDisabledDir, skillName, 'SKILL.md')
                if (!fs.existsSync(skillMdPath)) continue

                try {
                  const content = fs.readFileSync(skillMdPath, { encoding: 'utf-8' })
                  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
                  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : ''
                  const usage = skillUsage[skillName] || {}
                  const skillDir = path.join(projectDisabledDir, skillName)
                  const skillFiles = fs.readdirSync(skillDir)
                  skills.push({ name: skillName, frontmatter, disabled: true, scope: 'project', projectName: path.basename(projectPath), projectPath, skillMdPath, fileCount: skillFiles.length, usageCount: usage.usageCount || 0, lastUsedAt: usage.lastUsedAt || null })
                } catch (e) {
                  console.error('读取项目 disabled skill 文件失败:', skillMdPath, e)
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('读取项目 skills 失败:', e)
      }

      return skills.sort((a, b) => {
        if (a.scope !== b.scope) return a.scope === 'global' ? -1 : 1
        if (a.scope === 'project' && b.scope === 'project' && a.projectPath !== b.projectPath) {
          return a.projectPath.localeCompare(b.projectPath)
        }
        return a.name.localeCompare(b.name)
      })
    } catch (error) {
      console.error('读取 skills 目录失败:', error)
      return []
    }
  },

  disableSkill(skillName) {
    try {
      const skillPath = path.join(CLAUDE_SKILLS_PATH, skillName)
      const disabledDir = path.join(CLAUDE_SKILLS_PATH, '.disabled')
      const targetPath = path.join(disabledDir, skillName)
      if (!fs.existsSync(skillPath)) return { success: false, error: 'Skill 不存在' }
      if (!fs.existsSync(disabledDir)) fs.mkdirSync(disabledDir, { recursive: true })
      fs.renameSync(skillPath, targetPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  enableSkill(skillName) {
    try {
      const disabledDir = path.join(CLAUDE_SKILLS_PATH, '.disabled')
      const skillPath = path.join(disabledDir, skillName)
      const targetPath = path.join(CLAUDE_SKILLS_PATH, skillName)
      if (!fs.existsSync(skillPath)) return { success: false, error: 'Skill 不存在' }
      fs.renameSync(skillPath, targetPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteSkill(skillName, isDisabled) {
    try {
      const skillPath = isDisabled
        ? path.join(CLAUDE_SKILLS_PATH, '.disabled', skillName)
        : path.join(CLAUDE_SKILLS_PATH, skillName)
      if (!fs.existsSync(skillPath)) return { success: false, error: 'Skill 不存在' }
      fs.rmSync(skillPath, { recursive: true, force: true })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  disableProjectSkill(skillName, projectPath) {
    try {
      const skillPath = path.join(projectPath, '.claude', 'skills', skillName)
      const disabledDir = path.join(projectPath, '.claude', 'skills', '.disabled')
      const targetPath = path.join(disabledDir, skillName)
      if (!fs.existsSync(skillPath)) return { success: false, error: 'Skill 不存在' }
      if (!fs.existsSync(disabledDir)) fs.mkdirSync(disabledDir, { recursive: true })
      fs.renameSync(skillPath, targetPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  enableProjectSkill(skillName, projectPath) {
    try {
      const disabledDir = path.join(projectPath, '.claude', 'skills', '.disabled')
      const skillPath = path.join(disabledDir, skillName)
      const targetPath = path.join(projectPath, '.claude', 'skills', skillName)
      if (!fs.existsSync(skillPath)) return { success: false, error: 'Skill 不存在' }
      fs.renameSync(skillPath, targetPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteProjectSkill(skillName, projectPath, isDisabled) {
    try {
      const skillPath = isDisabled
        ? path.join(projectPath, '.claude', 'skills', '.disabled', skillName)
        : path.join(projectPath, '.claude', 'skills', skillName)
      if (!fs.existsSync(skillPath)) return { success: false, error: 'Skill 不存在' }
      fs.rmSync(skillPath, { recursive: true, force: true })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  moveProjectSkillToGlobal(skillName, projectPath) {
    try {
      const srcPath = path.join(projectPath, '.claude', 'skills', skillName)
      const destPath = path.join(CLAUDE_SKILLS_PATH, skillName)
      if (!fs.existsSync(srcPath)) return { success: false, error: '源 Skill 不存在' }
      if (fs.existsSync(destPath)) return { success: false, error: '用户目录下已存在同名 Skill' }
      if (!fs.existsSync(CLAUDE_SKILLS_PATH)) fs.mkdirSync(CLAUDE_SKILLS_PATH, { recursive: true })
      fs.renameSync(srcPath, destPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  getSkillMdPath(skillName, scope, projectPath, isDisabled) {
    try {
      let skillDir
      if (scope === 'project') {
        skillDir = isDisabled
          ? path.join(projectPath, '.claude', 'skills', '.disabled', skillName)
          : path.join(projectPath, '.claude', 'skills', skillName)
      } else {
        skillDir = isDisabled
          ? path.join(CLAUDE_SKILLS_PATH, '.disabled', skillName)
          : path.join(CLAUDE_SKILLS_PATH, skillName)
      }
      const mdPath = path.join(skillDir, 'SKILL.md')
      if (!fs.existsSync(mdPath)) return { success: false, error: 'SKILL.md 不存在' }
      return { success: true, path: mdPath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  getSkillsPath() {
    if (!fs.existsSync(CLAUDE_SKILLS_PATH)) fs.mkdirSync(CLAUDE_SKILLS_PATH, { recursive: true })
    return CLAUDE_SKILLS_PATH
  },

  openProjectSkillsDir(projectPath) {
    const skillsDir = path.join(projectPath, '.claude', 'skills')
    if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true })
    window.utools.shellOpenPath(skillsDir)
  },

  fetchSkillInfo(slug) {
    const https = require('node:https')
    return new Promise((resolve, reject) => {
      const url = `https://api.skillhub.tencent.com/api/v1/skills/${slug}`
      const options = {
        headers: {
          'accept': '*/*',
          'accept-language': 'zh-CN,zh;q=0.9',
          'origin': 'https://skillhub.tencent.com',
          'referer': 'https://skillhub.tencent.com/',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      }
      https.get(url, options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try { resolve({ source: 'skillhub', data: JSON.parse(data) }) }
          catch (e) { reject(new Error('解析响应失败')) }
        })
      }).on('error', reject)
    })
  },

  fetchModelScopeSkillInfo(skillPath) {
    const https = require('node:https')
    return new Promise((resolve, reject) => {
      const url = `https://www.modelscope.cn/api/v1/skills/${skillPath}`
      const options = {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
          'x-modelscope-accept-language': 'zh_CN'
        }
      }
      https.get(url, options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.Code !== 200 || !json.Data) reject(new Error(json.Message || '获取失败'))
            else resolve({ source: 'modelscope', data: json.Data })
          } catch (e) { reject(new Error('解析响应失败')) }
        })
      }).on('error', reject)
    })
  },

  async installSkill(slug, version, onProgress) {
    const https = require('node:https')
    const { execSync } = require('node:child_process')

    const zipUrl = `https://skillhub-1388575217.cos.accelerate.myqcloud.com/skills/${slug}/${version}.zip`
    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    const zipPath = path.join(tempDir, `${slug}-${version}.zip`)
    const extractDir = path.join(tempDir, slug)

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
    if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true })

    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(zipPath)
      https.get(zipUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          https.get(res.headers.location, (res2) => {
            const totalSize = parseInt(res2.headers['content-length'], 10)
            let downloaded = 0
            res2.on('data', chunk => { downloaded += chunk.length; if (onProgress && totalSize) onProgress(Math.round(downloaded / totalSize * 100)) })
            res2.pipe(file)
          }).on('error', reject)
        } else {
          const totalSize = parseInt(res.headers['content-length'], 10)
          let downloaded = 0
          res.on('data', chunk => { downloaded += chunk.length; if (onProgress && totalSize) onProgress(Math.round(downloaded / totalSize * 100)) })
          res.pipe(file)
        }
      }).on('error', reject)
      file.on('finish', () => file.close(resolve))
    })

    if (window.utools.isMacOS() || window.utools.isLinux()) {
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' })
    } else if (window.utools.isWindows()) {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' })
    }

    const allSkillMds = _findSkillMd(extractDir)
    if (allSkillMds.length === 0) throw new Error('压缩包中未找到 SKILL.md 文件')

    allSkillMds.sort((a, b) => a.depth - b.depth)
    const skillInfo = allSkillMds[0]
    const skillMdContent = fs.readFileSync(skillInfo.skillMdPath, { encoding: 'utf-8' })
    const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m)
    const skillName = nameMatch ? nameMatch[1].trim() : slug
    const targetDir = path.join(CLAUDE_SKILLS_PATH, skillName)

    fs.rmSync(zipPath, { force: true })
    return { skillName, extractDir: skillInfo.skillDir, targetDir, exists: fs.existsSync(targetDir), source: 'skillhub' }
  },

  async installSkillFromModelScope(skillPath, onProgress) {
    const https = require('node:https')
    const { execSync } = require('node:child_process')

    const encodedPath = skillPath.replace(/@/g, '%40')
    const zipUrl = `https://www.modelscope.cn/skills/${encodedPath}/archive/zip/master.zip`
    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    const safeName = skillPath.replace(/[\/@]/g, '-')
    const zipPath = path.join(tempDir, `${safeName}.zip`)
    const extractDir = path.join(tempDir, safeName)

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

    await new Promise((resolve, reject) => {
      const doDownload = (url, redirectCount = 0) => {
        if (redirectCount > 10) return reject(new Error('重定向次数过多'))
        https.get(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'accept': '*/*' } }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            if (!res.headers.location) return reject(new Error('重定向缺少 location'))
            res.resume()
            doDownload(res.headers.location, redirectCount + 1)
            return
          }
          if (res.statusCode !== 200) return reject(new Error(`下载失败: HTTP ${res.statusCode}`))

          const totalSize = parseInt(res.headers['content-length'], 10) || 0
          let downloaded = 0
          const file = fs.createWriteStream(zipPath)
          res.on('data', chunk => { downloaded += chunk.length; if (onProgress && totalSize > 0) onProgress(Math.round(downloaded / totalSize * 100)) })
          res.pipe(file)
          file.on('finish', () => file.close(resolve))
          file.on('error', (err) => { fs.unlinkSync(zipPath); reject(err) })
        }).on('error', reject)
      }
      doDownload(zipUrl)
    })

    if (!fs.existsSync(zipPath)) throw new Error('下载文件不存在')
    if (fs.statSync(zipPath).size < 1000) throw new Error('下载文件过小，可能下载失败')

    if (window.utools.isMacOS() || window.utools.isLinux()) {
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' })
    } else if (window.utools.isWindows()) {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' })
    }

    const allSkillMds = _findSkillMd(extractDir)
    if (allSkillMds.length === 0) throw new Error('压缩包中未找到 SKILL.md 文件')

    allSkillMds.sort((a, b) => a.depth - b.depth)
    const skillInfo = allSkillMds[0]
    const skillMdContent = fs.readFileSync(skillInfo.skillMdPath, { encoding: 'utf-8' })
    const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m)
    const skillName = nameMatch ? nameMatch[1].trim() : skillPath.split('/').pop()
    const targetDir = path.join(CLAUDE_SKILLS_PATH, skillName)

    fs.unlinkSync(zipPath)
    return { skillName, extractDir: skillInfo.skillDir, targetDir, exists: fs.existsSync(targetDir), source: 'modelscope' }
  },

  completeSkillInstall(skillName, extractDir) {
    const targetDir = path.join(CLAUDE_SKILLS_PATH, skillName)
    if (!fs.existsSync(CLAUDE_SKILLS_PATH)) fs.mkdirSync(CLAUDE_SKILLS_PATH, { recursive: true })
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true })
    fs.renameSync(extractDir, targetDir)
    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    return true
  },

  cancelSkillInstall() {
    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    return true
  },

  // ==================== Usage ====================

  _emptyResult() {
    const now = new Date()
    const totalDays = 365
    const emptyContributions = []
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateKey = d.toISOString().split('T')[0]
      emptyContributions.push({ date: dateKey, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
    }
    return {
      summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, sessionCount: 0 },
      modelStats: [], projectStats: [], contributions: emptyContributions,
      avgTokensPerSession: 0, recentSessions: [], messageRecords: []
    }
  },

  _findAllJsonlFiles(projectsDir) {
    const results = []
    try {
      if (!fs.existsSync(projectsDir)) return results
      const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(projectsDir, entry.name)
        if (entry.isDirectory()) results.push(...this._findAllJsonlFiles(fullPath))
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) results.push(fullPath)
      }
    } catch (error) {
      console.error('查找 jsonl 文件失败:', error)
    }
    return results
  },

  _processSingleJsonlFile(filePath, messageRecords, sessionMap, projectMap, projectPathMap) {
    const homeDir = window.utools.getPath('home')
    const projectsDir = path.join(homeDir, '.claude', 'projects')

    try {
      const relativePath = path.relative(projectsDir, filePath)
      const folderName = relativePath.split(path.sep)[0] || 'unknown'
      const projectPath = projectPathMap.get(folderName) || 'unknown'
      const projectName = projectPath !== 'unknown' ? path.basename(projectPath) : 'unknown'

      const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
      const lines = content.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.type !== 'assistant' || !data.message?.usage) continue

          const usage = data.message.usage
          const inputTokens = usage.input_tokens || 0
          const outputTokens = usage.output_tokens || 0
          const cacheReadTokens = usage.cache_read_input_tokens || 0
          const cacheCreationTokens = usage.cache_creation_input_tokens || 0
          const model = data.message.model || 'unknown'
          const sessionId = data.sessionId || 'unknown'

          if (inputTokens + outputTokens > 0) {
            messageRecords.push({
              sessionId, model, project: projectName, projectPath, timestamp: data.timestamp,
              date: data.timestamp.split('T')[0], inputTokens, outputTokens,
              cacheReadTokens, cacheCreationTokens,
              totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
            })

            if (!sessionMap.has(sessionId)) {
              sessionMap.set(sessionId, { sessionId, model, project: projectName, projectPath, timestamp: data.timestamp, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 })
            }
            const session = sessionMap.get(sessionId)
            session.inputTokens += inputTokens
            session.outputTokens += outputTokens
            session.cacheReadTokens += cacheReadTokens
            session.cacheCreationTokens += cacheCreationTokens
            if (data.timestamp > session.timestamp) session.timestamp = data.timestamp

            const projectPathKey = projectPath || 'unknown'
            if (!projectMap.has(projectPathKey)) {
              projectMap.set(projectPathKey, { name: projectName, path: projectPathKey, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 })
            }
            projectMap.get(projectPathKey).sessions.add(sessionId)
          }
        } catch (parseError) { /* 跳过解析失败的行 */ }
      }
    } catch (fileError) {
      console.error('读取文件失败:', filePath, fileError)
    }
  },

  _buildProjectPathMap(projectsDir) {
    const projectPathMap = new Map()
    try {
      if (!fs.existsSync(projectsDir)) return projectPathMap
      const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)

      for (const folderName of projectFolders) {
        const folderPath = path.join(projectsDir, folderName)
        const files = fs.readdirSync(folderPath)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => ({ name: f, path: path.join(folderPath, f), mtime: fs.statSync(path.join(folderPath, f)).mtime.getTime() }))
          .sort((a, b) => b.mtime - a.mtime)

        if (files.length > 0) {
          try {
            const content = fs.readFileSync(files[0].path, { encoding: 'utf-8' })
            const lines = content.split('\n').filter(line => line.trim())
            for (const line of lines) {
              try {
                const data = JSON.parse(line)
                if (data.cwd) { projectPathMap.set(folderName, data.cwd); break }
              } catch (e) { /* 继续下一行 */ }
            }
          } catch (e) {
            console.error('读取文件失败:', files[0].path, e)
          }
        }
      }
    } catch (error) {
      console.error('构建项目路径映射失败:', error)
    }
    return projectPathMap
  },

  _calculateStats(messageRecords, sessionMap) {
    const allRecords = Array.from(sessionMap.values()).map(session => ({
      ...session,
      totalTokens: session.inputTokens + session.outputTokens + session.cacheReadTokens + session.cacheCreationTokens
    }))
    allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    const summary = messageRecords.reduce((acc, record) => {
      acc.inputTokens += record.inputTokens
      acc.outputTokens += record.outputTokens
      acc.cacheReadTokens += record.cacheReadTokens
      acc.cacheCreationTokens += record.cacheCreationTokens
      acc.totalTokens += record.totalTokens
      return acc
    }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, messageCount: messageRecords.length, sessionCount: sessionMap.size })

    const modelMap = new Map()
    messageRecords.forEach(record => {
      if (!modelMap.has(record.model)) modelMap.set(record.model, { name: record.model, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 })
      const stat = modelMap.get(record.model)
      stat.sessions.add(record.sessionId)
      stat.tokens += record.totalTokens
      stat.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
      stat.outputTokens += record.outputTokens
    })
    const modelStats = Array.from(modelMap.values()).map(s => ({ ...s, sessions: s.sessions.size })).sort((a, b) => b.tokens - a.tokens)

    const projectMap = new Map()
    messageRecords.forEach(record => {
      const projectPathKey = record.projectPath || 'unknown'
      const projectDisplayName = projectPathKey !== 'unknown' ? path.basename(projectPathKey) : 'unknown'
      if (!projectMap.has(projectPathKey)) {
        const exists = projectPathKey !== 'unknown' ? fs.existsSync(projectPathKey) : false
        projectMap.set(projectPathKey, { name: projectDisplayName, path: projectPathKey, exists, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 })
      }
      const stat = projectMap.get(projectPathKey)
      stat.sessions.add(record.sessionId)
      stat.tokens += record.totalTokens
      stat.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
      stat.outputTokens += record.outputTokens
    })
    const projectStats = Array.from(projectMap.values()).map(s => ({ ...s, sessions: s.sessions.size })).sort((a, b) => b.tokens - a.tokens)

    const contributionMap = new Map()
    messageRecords.forEach(record => {
      const dateKey = record.timestamp.split('T')[0]
      if (!contributionMap.has(dateKey)) contributionMap.set(dateKey, { date: dateKey, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
      const day = contributionMap.get(dateKey)
      day.tokens += record.totalTokens
      day.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
      day.outputTokens += record.outputTokens
      if (!day.models[record.model]) day.models[record.model] = { inputTokens: 0, outputTokens: 0 }
      day.models[record.model].inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
      day.models[record.model].outputTokens += record.outputTokens
    })
    const contributions = Array.from(contributionMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    const avgTokensPerSession = sessionMap.size > 0 ? Math.round(summary.totalTokens / sessionMap.size) : 0
    const recentSessions = Array.from(sessionMap.values())
      .map(s => ({ ...s, totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheCreationTokens }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)

    return { records: allRecords, summary, modelStats, projectStats, contributions, avgTokensPerSession, recentSessions }
  },

  _processAllUsageData(projectsDir) {
    const projectPathMap = this._buildProjectPathMap(projectsDir)
    const sessionMap = new Map()
    const projectMap = new Map()
    const messageRecords = []
    const jsonlFiles = this._findAllJsonlFiles(projectsDir)
    for (const filePath of jsonlFiles) {
      this._processSingleJsonlFile(filePath, messageRecords, sessionMap, projectMap, projectPathMap)
    }
    return { messageRecords, sessionMap, projectMap }
  },

  _fillEmptyContributions(contributions) {
    const now = new Date()
    const totalDays = 365
    const dateMap = new Map()
    for (const day of contributions) dateMap.set(day.date, day)

    const result = []
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateKey = d.toISOString().split('T')[0]
      result.push(dateMap.get(dateKey) || { date: dateKey, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
    }
    return result
  },

  readClaudeUsage() {
    try {
      const homeDir = window.utools.getPath('home')
      const projectsDir = path.join(homeDir, '.claude', 'projects')
      if (!fs.existsSync(projectsDir)) return this._emptyResult()

      console.log('开始全量处理...')
      const processedData = this._processAllUsageData(projectsDir)
      const stats = this._calculateStats(processedData.messageRecords, processedData.sessionMap)

      // 合并历史热力图数据
      const history = getHeatmapHistory()
      const liveMap = new Map()
      for (const day of stats.contributions) liveMap.set(day.date, day)

      const merged = []
      for (const [date, histDay] of Object.entries(history)) {
        if (!liveMap.has(date)) merged.push({ date, ...histDay })
      }
      for (const day of stats.contributions) {
        const histDay = history[day.date]
        merged.push(histDay && histDay.tokens > day.tokens ? { date: day.date, ...histDay } : day)
      }
      merged.sort((a, b) => a.date.localeCompare(b.date))

      const contributions = this._fillEmptyContributions(merged)
      setTimeout(() => saveHeatmapHistory(contributions), 0)

      console.log(`处理完成: ${processedData.messageRecords.length} 条消息记录`)
      return { ...stats, contributions, messageRecords: processedData.messageRecords }
    } catch (error) {
      console.error('读取 Claude usage 数据失败:', error)
      return this._emptyResult()
    }
  },

  getMcpUsage() {
    try {
      const homeDir = window.utools.getPath('home')
      const projectsDir = path.join(homeDir, '.claude', 'projects')
      if (!fs.existsSync(projectsDir)) return {}

      const mcpUsage = {}
      const jsonlFiles = this._findAllJsonlFiles(projectsDir)
      for (const filePath of jsonlFiles) {
        try {
          const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
          const lines = content.split('\n').filter(line => line.trim())
          for (const line of lines) {
            try {
              const data = JSON.parse(line)
              if (data.type !== 'assistant' || !data.message?.content) continue
              const content = data.message.content
              if (!Array.isArray(content)) continue
              for (const block of content) {
                if (block.type === 'tool_use' && block.name && block.name.startsWith('mcp__')) {
                  // mcp__{server}__{tool} -> extract server name
                  const parts = block.name.split('__')
                  if (parts.length >= 3) {
                    const serverName = parts.slice(1, -1).join('__')
                    if (!mcpUsage[serverName]) mcpUsage[serverName] = { usageCount: 0, lastUsedAt: null }
                    mcpUsage[serverName].usageCount++
                    const ts = data.timestamp ? new Date(data.timestamp).getTime() : 0
                    if (ts > mcpUsage[serverName].lastUsedAt) mcpUsage[serverName].lastUsedAt = ts
                  }
                }
              }
            } catch (e) { /* skip */ }
          }
        } catch (e) { /* skip file */ }
      }
      return mcpUsage
    } catch (e) {
      console.error('读取 MCP usage 失败:', e)
      return {}
    }
  },

  copyClaudeCommand(projectPath) {
    if (!projectPath || projectPath === 'unknown') return { success: false, error: '无效的项目路径' }
    try {
      window.utools.copyText(`cd "${projectPath}" && claude`)
      return { success: true }
    } catch (error) {
      console.error('复制命令失败:', error)
      return { success: false, error: error.message }
    }
  }
}

// 辅助函数：递归查找 SKILL.md
function _findSkillMd(dir, depth = 0) {
  const results = []
  const skillMd = path.join(dir, 'SKILL.md')
  if (fs.existsSync(skillMd)) results.push({ skillMdPath: skillMd, skillDir: dir, depth })
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) results.push(..._findSkillMd(path.join(dir, entry.name), depth + 1))
    }
  } catch (e) { /* ignore */ }
  return results
}
