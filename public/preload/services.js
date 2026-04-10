const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')

const CLAUDE_SETTINGS_PATH = path.join(window.utools.getPath('home'), '.claude', 'settings.json')
const CLAUDE_JSON_PATH = path.join(window.utools.getPath('home'), '.claude.json')
const CLAUDE_SKILLS_PATH = path.join(window.utools.getPath('home'), '.claude', 'skills')

const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update('ccswitch-encryption-key')
  .digest()

const IV_LENGTH = 16

const encrypt = (text) => {
  if (!text) return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

const decrypt = (encryptedText) => {
  if (!encryptedText) return ''
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return encryptedText
  }
}

const findJsonlFiles = (dir) => {
  const results = []
  try {
    if (!fs.existsSync(dir)) {
      return results
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findJsonlFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath)
      }
    }
  } catch (error) {
    console.error('查找 jsonl 文件失败:', error)
  }
  return results
}

window.services = {
  readClaudeSettings() {
    try {
      if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
        return null
      }
      const content = fs.readFileSync(CLAUDE_SETTINGS_PATH, { encoding: 'utf-8' })
      return JSON.parse(content)
    } catch (error) {
      console.error('读取 Claude 配置失败:', error)
      return null
    }
  },

  writeClaudeSettings(settings) {
    try {
      const dir = path.dirname(CLAUDE_SETTINGS_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), { encoding: 'utf-8' })
      return true
    } catch (error) {
      console.error('写入 Claude 配置失败:', error)
      return false
    }
  },

  getClaudeSettingsPath() {
    return CLAUDE_SETTINGS_PATH
  },

  // 读取 ~/.claude.json
  readClaudeJson() {
    try {
      if (!fs.existsSync(CLAUDE_JSON_PATH)) {
        return {}
      }
      const content = fs.readFileSync(CLAUDE_JSON_PATH, { encoding: 'utf-8' })
      return JSON.parse(content)
    } catch (error) {
      console.error('读取 Claude JSON 配置失败:', error)
      return {}
    }
  },

  // 写入 ~/.claude.json
  writeClaudeJson(data) {
    try {
      fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
      return true
    } catch (error) {
      console.error('写入 Claude JSON 配置失败:', error)
      return false
    }
  },

  // 获取 Claude JSON 文件路径
  getClaudeJsonPath() {
    return CLAUDE_JSON_PATH
  },

  // 获取所有 MCP 配置
  getMcpServers() {
    const config = this.readClaudeJson()
    return config.mcpServers || {}
  },

  // 添加/更新 MCP 配置
  upsertMcpServer(name, serverConfig) {
    const config = this.readClaudeJson()
    if (!config.mcpServers) {
      config.mcpServers = {}
    }
    config.mcpServers[name] = serverConfig
    return this.writeClaudeJson(config)
  },

  // 删除 MCP 配置
  deleteMcpServer(name) {
    const config = this.readClaudeJson()
    if (config.mcpServers && config.mcpServers[name]) {
      delete config.mcpServers[name]
      return this.writeClaudeJson(config)
    }
    return false
  },

  // 获取所有 Skills 列表（只读）
  getSkills() {
    try {
      if (!fs.existsSync(CLAUDE_SKILLS_PATH)) {
        return []
      }

      // 读取 skillUsage 信息
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
          skills.push({
            name: skillName,
            frontmatter,
            disabled: false,
            usageCount: usage.usageCount || 0,
            lastUsedAt: usage.lastUsedAt || null
          })
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
            skills.push({
              name: skillName,
              frontmatter,
              disabled: true,
              usageCount: usage.usageCount || 0,
              lastUsedAt: usage.lastUsedAt || null
            })
          } catch (e) {
            console.error('读取 skill 文件失败:', skillMdPath, e)
          }
        }
      }

      return skills.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error('读取 skills 目录失败:', error)
      return []
    }
  },

  // 禁用 Skill
  disableSkill(skillName) {
    try {
      const skillPath = path.join(CLAUDE_SKILLS_PATH, skillName)
      const disabledDir = path.join(CLAUDE_SKILLS_PATH, '.disabled')
      const targetPath = path.join(disabledDir, skillName)

      if (!fs.existsSync(skillPath)) {
        return { success: false, error: 'Skill 不存在' }
      }

      // 创建 .disabled 目录
      if (!fs.existsSync(disabledDir)) {
        fs.mkdirSync(disabledDir, { recursive: true })
      }

      // 移动到 .disabled 目录
      fs.renameSync(skillPath, targetPath)

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 启用 Skill
  enableSkill(skillName) {
    try {
      const disabledDir = path.join(CLAUDE_SKILLS_PATH, '.disabled')
      const skillPath = path.join(disabledDir, skillName)
      const targetPath = path.join(CLAUDE_SKILLS_PATH, skillName)

      if (!fs.existsSync(skillPath)) {
        return { success: false, error: 'Skill 不存在' }
      }

      // 移动回主目录
      fs.renameSync(skillPath, targetPath)

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 删除 Skill
  deleteSkill(skillName, isDisabled) {
    try {
      let skillPath
      if (isDisabled) {
        skillPath = path.join(CLAUDE_SKILLS_PATH, '.disabled', skillName)
      } else {
        skillPath = path.join(CLAUDE_SKILLS_PATH, skillName)
      }

      if (!fs.existsSync(skillPath)) {
        return { success: false, error: 'Skill 不存在' }
      }

      // 递归删除目录
      fs.rmSync(skillPath, { recursive: true, force: true })

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // 获取 Skills 目录路径
  getSkillsPath() {
    // 确保目录存在
    if (!fs.existsSync(CLAUDE_SKILLS_PATH)) {
      fs.mkdirSync(CLAUDE_SKILLS_PATH, { recursive: true })
    }
    return CLAUDE_SKILLS_PATH
  },

  // 从 SkillHub 获取 skill 信息
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
          try {
            resolve({ source: 'skillhub', data: JSON.parse(data) })
          } catch (e) {
            reject(new Error('解析响应失败'))
          }
        })
      }).on('error', reject)
    })
  },

  // 从魔搭社区获取 skill 信息
  fetchModelScopeSkillInfo(skillPath) {
    const https = require('node:https')
    return new Promise((resolve, reject) => {
      // skillPath 格式: @MiniMax-AI/minimax-xlsx
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
            if (json.Code !== 200 || !json.Data) {
              reject(new Error(json.Message || '获取失败'))
            } else {
              resolve({ source: 'modelscope', data: json.Data })
            }
          } catch (e) {
            reject(new Error('解析响应失败'))
          }
        })
      }).on('error', reject)
    })
  },

  // 安装 Skill (SkillHub)
  async installSkill(slug, version, onProgress) {
    const https = require('node:https')
    const { execSync } = require('node:child_process')

    // 下载 zip
    const zipUrl = `https://skillhub-1388575217.cos.accelerate.myqcloud.com/skills/${slug}/${version}.zip`
    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    const zipPath = path.join(tempDir, `${slug}-${version}.zip`)
    const extractDir = path.join(tempDir, slug)

    // 创建临时目录
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true })
    }

    // 下载文件
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(zipPath)
      https.get(zipUrl, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // 处理重定向
          https.get(res.headers.location, (res2) => {
            const totalSize = parseInt(res2.headers['content-length'], 10)
            let downloaded = 0
            res2.on('data', chunk => {
              downloaded += chunk.length
              if (onProgress && totalSize) {
                onProgress(Math.round(downloaded / totalSize * 100))
              }
            })
            res2.pipe(file)
          }).on('error', reject)
        } else {
          const totalSize = parseInt(res.headers['content-length'], 10)
          let downloaded = 0
          res.on('data', chunk => {
            downloaded += chunk.length
            if (onProgress && totalSize) {
              onProgress(Math.round(downloaded / totalSize * 100))
            }
          })
          res.pipe(file)
        }
      }).on('error', reject)
      file.on('finish', () => file.close(resolve))
    })

    // 使用系统自带工具解压
    if (window.utools.isMacOS() || window.utools.isLinux()) {
      // macOS/Linux 使用 unzip
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' })
    } else if (window.utools.isWindows()) {
      // Windows 使用 PowerShell Expand-Archive
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' })
    }

    // 递归查找 SKILL.md，返回最浅层的（层级越浅越可能是主 skill）
    const findSkillMd = (dir, depth = 0) => {
      const results = []

      // 检查当前目录
      const skillMd = path.join(dir, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        results.push({ skillMdPath: skillMd, skillDir: dir, depth })
      }

      // 检查子目录
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subResults = findSkillMd(path.join(dir, entry.name), depth + 1)
          results.push(...subResults)
        }
      }

      return results
    }

    const allSkillMds = findSkillMd(extractDir)
    if (allSkillMds.length === 0) {
      throw new Error('压缩包中未找到 SKILL.md 文件')
    }

    // 按深度排序，取最浅的
    allSkillMds.sort((a, b) => a.depth - b.depth)
    const skillInfo = allSkillMds[0]

    const skillMdContent = fs.readFileSync(skillInfo.skillMdPath, { encoding: 'utf-8' })
    const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m)
    const skillName = nameMatch ? nameMatch[1].trim() : slug

    // 目标目录
    const targetDir = path.join(CLAUDE_SKILLS_PATH, skillName)

    // 清理临时文件
    fs.rmSync(zipPath, { force: true })

    return {
      skillName,
      extractDir: skillInfo.skillDir,
      targetDir,
      exists: fs.existsSync(targetDir),
      source: 'skillhub'
    }
  },

  // 安装 Skill (魔搭社区)
  async installSkillFromModelScope(skillPath, onProgress) {
    const https = require('node:https')
    const { execSync } = require('node:child_process')

    // skillPath 格式: @MiniMax-AI/minimax-xlsx
    const encodedPath = skillPath.replace(/@/g, '%40')
    const zipUrl = `https://www.modelscope.cn/skills/${encodedPath}/archive/zip/master.zip`

    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    const safeName = skillPath.replace(/[\/@]/g, '-')
    const zipPath = path.join(tempDir, `${safeName}.zip`)
    const extractDir = path.join(tempDir, safeName)

    // 创建临时目录
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // 下载文件（处理重定向）
    await new Promise((resolve, reject) => {
      const doDownload = (url, redirectCount = 0) => {
        if (redirectCount > 10) {
          return reject(new Error('重定向次数过多'))
        }

        https.get(url, {
          headers: {
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'accept': '*/*'
          }
        }, (res) => {
          // 处理重定向
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
            const location = res.headers.location
            if (!location) {
              return reject(new Error('重定向缺少 location'))
            }
            res.resume() // 清空当前响应
            doDownload(location, redirectCount + 1)
            return
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`下载失败: HTTP ${res.statusCode}`))
          }

          const totalSize = parseInt(res.headers['content-length'], 10) || 0
          let downloaded = 0
          const file = fs.createWriteStream(zipPath)

          res.on('data', chunk => {
            downloaded += chunk.length
            if (onProgress && totalSize > 0) {
              onProgress(Math.round(downloaded / totalSize * 100))
            }
          })

          res.pipe(file)

          file.on('finish', () => {
            file.close(resolve)
          })

          file.on('error', (err) => {
            fs.unlinkSync(zipPath)
            reject(err)
          })
        }).on('error', reject)
      }

      doDownload(zipUrl)
    })

    // 验证文件是否下载成功
    if (!fs.existsSync(zipPath)) {
      throw new Error('下载文件不存在')
    }
    const stats = fs.statSync(zipPath)
    if (stats.size < 1000) {
      throw new Error('下载文件过小，可能下载失败')
    }

    // 使用系统自带工具解压
    if (window.utools.isMacOS() || window.utools.isLinux()) {
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' })
    } else if (window.utools.isWindows()) {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'pipe' })
    }

    // 递归查找 SKILL.md，返回最浅层的（层级越浅越可能是主 skill）
    const findSkillMd = (dir, depth = 0) => {
      const results = []

      // 检查当前目录
      const skillMd = path.join(dir, 'SKILL.md')
      if (fs.existsSync(skillMd)) {
        results.push({ skillMdPath: skillMd, skillDir: dir, depth })
      }

      // 检查子目录
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subResults = findSkillMd(path.join(dir, entry.name), depth + 1)
          results.push(...subResults)
        }
      }

      return results
    }

    const allSkillMds = findSkillMd(extractDir)
    if (allSkillMds.length === 0) {
      throw new Error('压缩包中未找到 SKILL.md 文件')
    }

    // 按深度排序，取最浅的
    allSkillMds.sort((a, b) => a.depth - b.depth)
    const skillInfo = allSkillMds[0]

    const skillMdContent = fs.readFileSync(skillInfo.skillMdPath, { encoding: 'utf-8' })
    const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m)
    const skillName = nameMatch ? nameMatch[1].trim() : skillPath.split('/').pop()

    const targetDir = path.join(CLAUDE_SKILLS_PATH, skillName)

    // 清理临时 zip 文件
    fs.unlinkSync(zipPath)

    return {
      skillName,
      extractDir: skillInfo.skillDir,
      targetDir,
      exists: fs.existsSync(targetDir),
      source: 'modelscope'
    }
  },

  // 完成 Skill 安装（移动到目标目录）
  completeSkillInstall(skillName, extractDir) {
    const targetDir = path.join(CLAUDE_SKILLS_PATH, skillName)

    // 确保目标目录存在
    if (!fs.existsSync(CLAUDE_SKILLS_PATH)) {
      fs.mkdirSync(CLAUDE_SKILLS_PATH, { recursive: true })
    }

    // 如果目标存在，先删除
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true })
    }

    // 移动目录
    fs.renameSync(extractDir, targetDir)

    // 清理临时目录
    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    return true
  },

  // 取消安装（清理临时文件）
  cancelSkillInstall(extractDir) {
    const tempDir = path.join(window.utools.getPath('temp'), 'ccswitch-skill-install')
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    return true
  },

  encryptKey: encrypt,
  decryptKey: decrypt,

  exportConfigsToFile(filePath, configs) {
    const data = {
      version: '1.0',
      exportedAt: Date.now(),
      app: 'ccswitch',
      configs
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
    return true
  },

  importConfigsFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content)
  },

  compressConfigs(configs) {
    const json = JSON.stringify(configs)
    const compressed = zlib.deflateSync(Buffer.from(json))
    return compressed.toString('base64')
  },

  decompressConfigs(compressedStr) {
    try {
      const buffer = Buffer.from(compressedStr, 'base64')
      const decompressed = zlib.inflateSync(buffer)
      return JSON.parse(decompressed.toString())
    } catch (error) {
      console.error('解压配置失败:', error)
      return null
    }
  },

  // 简单字符替换加密（Base64字符集 → 打乱字符集）
  encryptString(str) {
    if (!str) return ''
    // Base64字符集
    const fromChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    // 打乱后的字符集（固定映射）
    const toChars =   'QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm9876543210-_='
    return str.split('').map(c => {
      const idx = fromChars.indexOf(c)
      return idx >= 0 ? toChars[idx] : c
    }).join('')
  },

  // 解密（打乱字符集 → Base64字符集）
  decryptString(str) {
    if (!str) return ''
    const fromChars = 'QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm9876543210-_='
    const toChars =   'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    return str.split('').map(c => {
      const idx = fromChars.indexOf(c)
      return idx >= 0 ? toChars[idx] : c
    }).join('')
  },

  // 获取缓存键（带 nativeId 区分不同电脑）
  _getUsageCacheKey() {
    const nativeId = window.utools.getNativeId()
    return `ccswitch_usage_cache_${nativeId}`
  },

  // 空结果模板
  _emptyResult() {
    return {
      records: [],
      summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, sessionCount: 0 },
      modelStats: [],
      projectStats: [],
      contributions: [],
      avgTokensPerSession: 0,
      recentSessions: [],
      messageRecords: [],
      lastProcessedTime: 0
    }
  },

  // 查找新的 jsonl 文件（mtime > lastProcessedTime）
  _findNewJsonlFiles(projectsDir, lastProcessedTime) {
    const results = []
    try {
      if (!fs.existsSync(projectsDir)) {
        return results
      }
      const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(projectsDir, entry.name)
        if (entry.isDirectory()) {
          results.push(...this._findNewJsonlFiles(fullPath, lastProcessedTime))
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const stat = fs.statSync(fullPath)
          if (stat.mtime.getTime() > lastProcessedTime) {
            results.push({ path: fullPath, mtime: stat.mtime.getTime() })
          }
        }
      }
    } catch (error) {
      console.error('查找新 jsonl 文件失败:', error)
    }
    return results
  },

  // 处理单个 jsonl 文件
  _processSingleJsonlFile(filePath, messageRecords, sessionMap, projectMap, projectPathMap) {
    const homeDir = window.utools.getPath('home')
    const projectsDir = path.join(homeDir, '.claude', 'projects')

    try {
      // 从文件路径获取项目文件夹名
      const relativePath = path.relative(projectsDir, filePath)
      const folderName = relativePath.split(path.sep)[0] || 'unknown'

      // 从映射中获取真实路径和项目名
      const projectPath = projectPathMap.get(folderName) || 'unknown'
      const projectName = projectPath !== 'unknown' ? path.basename(projectPath) : 'unknown'

      // 读取文件内容
      const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
      const lines = content.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const data = JSON.parse(line)

          // 只处理 assistant 类型的响应（包含 usage 数据）
          if (data.type !== 'assistant' || !data.message?.usage) continue

          const usage = data.message.usage
          const inputTokens = usage.input_tokens || 0
          const outputTokens = usage.output_tokens || 0
          const cacheReadTokens = usage.cache_read_input_tokens || 0
          const cacheCreationTokens = usage.cache_creation_input_tokens || 0
          const model = data.message.model || 'unknown'
          const sessionId = data.sessionId || 'unknown'

          // 只保留有意义的记录
          if (inputTokens + outputTokens > 0) {
            // 记录每条消息的信息（用于按消息时间准确统计）
            messageRecords.push({
              sessionId,
              model,
              project: projectName,
              projectPath: projectPath,
              timestamp: data.timestamp,
              date: data.timestamp.split('T')[0], // YYYY-MM-DD 格式
              inputTokens,
              outputTokens,
              cacheReadTokens,
              cacheCreationTokens,
              totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
            })

            // 同时维护会话聚合数据（用于会话列表展示）
            if (!sessionMap.has(sessionId)) {
              sessionMap.set(sessionId, {
                sessionId,
                model,
                project: projectName,
                projectPath: projectPath,
                timestamp: data.timestamp,
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0
              })
            }
            const session = sessionMap.get(sessionId)
            session.inputTokens += inputTokens
            session.outputTokens += outputTokens
            session.cacheReadTokens += cacheReadTokens
            session.cacheCreationTokens += cacheCreationTokens
            // 更新为最新时间戳
            if (data.timestamp > session.timestamp) {
              session.timestamp = data.timestamp
            }

            // 更新 projectMap（修复 projectMap 参数未被使用的问题）
            const projectPathKey = projectPath || 'unknown'
            if (!projectMap.has(projectPathKey)) {
              projectMap.set(projectPathKey, {
                name: projectName,
                path: projectPathKey,
                sessions: new Set(),
                tokens: 0,
                inputTokens: 0,
                outputTokens: 0
              })
            }
            const projectStat = projectMap.get(projectPathKey)
            projectStat.sessions.add(sessionId)
          }
        } catch (parseError) {
          // 跳过解析失败的行
        }
      }
    } catch (fileError) {
      console.error('读取文件失败:', filePath, fileError)
    }
  },

  // 处理指定文件列表（只处理新文件，不包含旧数据）
  _processJsonlFiles(filePaths, sessionMap, projectMap, projectPathMap) {
    const messageRecords = [] // 只包含新数据，不包含旧数据

    // 处理新文件
    for (const fileInfo of filePaths) {
      this._processSingleJsonlFile(fileInfo.path, messageRecords, sessionMap, projectMap, projectPathMap)
    }

    return { messageRecords, sessionMap, projectMap }
  },

  // 构建项目路径映射
  _buildProjectPathMap(projectsDir) {
    const projectPathMap = new Map()

    try {
      if (!fs.existsSync(projectsDir)) {
        return projectPathMap
      }

      const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      for (const folderName of projectFolders) {
        const folderPath = path.join(projectsDir, folderName)
        // 找到该文件夹下最新的 jsonl 文件
        const files = fs.readdirSync(folderPath)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => ({
            name: f,
            path: path.join(folderPath, f),
            mtime: fs.statSync(path.join(folderPath, f)).mtime.getTime()
          }))
          .sort((a, b) => b.mtime - a.mtime)

        if (files.length > 0) {
          // 在最新文件中查找 cwd 字段
          const latestFile = files[0]
          try {
            const content = fs.readFileSync(latestFile.path, { encoding: 'utf-8' })
            const lines = content.split('\n').filter(line => line.trim())
            for (const line of lines) {
              try {
                const data = JSON.parse(line)
                if (data.cwd) {
                  projectPathMap.set(folderName, data.cwd)
                  break
                }
              } catch (e) {
                // 继续下一行
              }
            }
          } catch (e) {
            console.error('读取文件失败:', latestFile.path, e)
          }
        }
      }
    } catch (error) {
      console.error('构建项目路径映射失败:', error)
    }

    return projectPathMap
  },

  // 从 messageRecords 计算完整统计数据
  _calculateStats(messageRecords, sessionMap) {
    // 转换为数组并计算 totalTokens（四个字段相加）
    const allRecords = Array.from(sessionMap.values()).map(session => ({
      ...session,
      totalTokens: session.inputTokens + session.outputTokens + session.cacheReadTokens + session.cacheCreationTokens
    }))

    // 按时间排序
    allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    // 计算汇总数据
    const summary = messageRecords.reduce((acc, record) => {
      acc.inputTokens += record.inputTokens
      acc.outputTokens += record.outputTokens
      acc.cacheReadTokens += record.cacheReadTokens
      acc.cacheCreationTokens += record.cacheCreationTokens
      acc.totalTokens += record.totalTokens
      return acc
    }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, messageCount: messageRecords.length, sessionCount: sessionMap.size })

    // 计算模型使用分布
    const modelMap = new Map()
    messageRecords.forEach(record => {
      if (!modelMap.has(record.model)) {
        modelMap.set(record.model, { name: record.model, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 })
      }
      const stat = modelMap.get(record.model)
      stat.sessions.add(record.sessionId)
      stat.tokens += record.totalTokens
      stat.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
      stat.outputTokens += record.outputTokens
    })
    const modelStats = Array.from(modelMap.values())
      .map(stat => ({ ...stat, sessions: stat.sessions.size }))
      .sort((a, b) => b.tokens - a.tokens)

    // 计算项目使用分布
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
    const projectStats = Array.from(projectMap.values())
      .map(stat => ({ ...stat, sessions: stat.sessions.size }))
      .sort((a, b) => b.tokens - a.tokens)

    // 计算贡献墙数据
    const now = new Date()
    const contributionMap = new Map()
    const totalDays = 365
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateKey = d.toISOString().split('T')[0]
      contributionMap.set(dateKey, { date: dateKey, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
    }
    messageRecords.forEach(record => {
      const dateKey = record.timestamp.split('T')[0]
      if (contributionMap.has(dateKey)) {
        const day = contributionMap.get(dateKey)
        day.tokens += record.totalTokens
        day.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
        day.outputTokens += record.outputTokens
        if (!day.models[record.model]) {
          day.models[record.model] = { inputTokens: 0, outputTokens: 0 }
        }
        day.models[record.model].inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
        day.models[record.model].outputTokens += record.outputTokens
      }
    })
    const contributions = Array.from(contributionMap.values())

    // 平均每会话 tokens
    const avgTokensPerSession = sessionMap.size > 0 ? Math.round(summary.totalTokens / sessionMap.size) : 0

    // 最近 10 个会话
    const recentSessions = Array.from(sessionMap.values())
      .map(session => ({
        ...session,
        totalTokens: session.inputTokens + session.outputTokens + session.cacheReadTokens + session.cacheCreationTokens
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)

    return {
      records: allRecords,
      summary,
      modelStats,
      projectStats,
      contributions,
      avgTokensPerSession,
      recentSessions
    }
  },

  // 全量处理（复用原有逻辑）
  _processAllUsageData(projectsDir) {
    const projectPathMap = this._buildProjectPathMap(projectsDir)
    const sessionMap = new Map()
    const projectMap = new Map()
    const messageRecords = []

    // 遍历所有 jsonl 文件处理 usage 数据
    const jsonlFiles = findJsonlFiles(projectsDir)

    for (const filePath of jsonlFiles) {
      this._processSingleJsonlFile(filePath, messageRecords, sessionMap, projectMap, projectPathMap)
    }

    return { messageRecords, sessionMap, projectMap }
  },

  // 读取 Claude Code usage 数据（支持增量缓存）
  readClaudeUsage(forceRefresh = false) {
    try {
      const homeDir = window.utools.getPath('home')
      const projectsDir = path.join(homeDir, '.claude', 'projects')

      if (!fs.existsSync(projectsDir)) {
        return this._emptyResult()
      }

      // 尝试获取缓存
      const cacheKey = this._getUsageCacheKey()
      const cachedRaw = window.utools.db.get(cacheKey)
      console.log('db.get 结果:', cachedRaw ? { _id: cachedRaw._id, _rev: cachedRaw._rev, hasData: !!cachedRaw.data } : null)
      const cachedData = cachedRaw ? cachedRaw.data : null

      // 如果强制刷新或无缓存，执行全量处理
      if (forceRefresh || !cachedData) {
        console.log('执行全量处理...')
        const processedData = this._processAllUsageData(projectsDir)
        const stats = this._calculateStats(processedData.messageRecords, processedData.sessionMap)

        // 计算最新的 mtime 作为 lastProcessedTime
        const jsonlFiles = findJsonlFiles(projectsDir)
        let lastProcessedTime = 0
        for (const filePath of jsonlFiles) {
          const stat = fs.statSync(filePath)
          if (stat.mtime.getTime() > lastProcessedTime) {
            lastProcessedTime = stat.mtime.getTime()
          }
        }

        const result = {
          ...stats,
          messageRecords: processedData.messageRecords,
          lastProcessedTime
        }

        // 写入缓存
        const putResult = window.utools.db.put({
          _id: cacheKey,
          data: result,
          _rev: cachedRaw ? cachedRaw._rev : undefined
        })
        console.log('db.put 结果:', putResult)
        if (!putResult || !putResult.ok) {
          console.error('缓存写入失败:', putResult)
        } else {
          console.log('全量处理完成，已缓存')
        return result
      }

      // 有缓存，检查是否有新文件
      const newFiles = this._findNewJsonlFiles(projectsDir, cachedData.lastProcessedTime)

      if (newFiles.length === 0) {
        console.log('无新文件，直接返回缓存')
        return cachedData
      }

      console.log(`发现 ${newFiles.length} 个新文件，执行增量处理...`)

      // 增量处理
      const projectPathMap = this._buildProjectPathMap(projectsDir)

      // 从缓存数据重建 cachedSessionMap 和 cachedProjectMap
      const cachedSessionMap = new Map()
      const cachedProjectMap = new Map()
      for (const record of cachedData.messageRecords) {
        // 重建 cachedSessionMap
        if (!cachedSessionMap.has(record.sessionId)) {
          cachedSessionMap.set(record.sessionId, {
            sessionId: record.sessionId,
            model: record.model,
            project: record.project,
            projectPath: record.projectPath,
            timestamp: record.timestamp,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0
          })
        }
        const session = cachedSessionMap.get(record.sessionId)
        session.inputTokens += record.inputTokens
        session.outputTokens += record.outputTokens
        session.cacheReadTokens += record.cacheReadTokens
        session.cacheCreationTokens += record.cacheCreationTokens
        if (record.timestamp > session.timestamp) {
          session.timestamp = record.timestamp
        }

        // 重建 cachedProjectMap
        const projectPathKey = record.projectPath || 'unknown'
        if (!cachedProjectMap.has(projectPathKey)) {
          cachedProjectMap.set(projectPathKey, {
            name: record.project,
            path: projectPathKey,
            sessions: new Set(),
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0
          })
        }
        const projectStat = cachedProjectMap.get(projectPathKey)
        projectStat.sessions.add(record.sessionId)
      }

      // 只处理新文件，传入已重建的 sessionMap 和 projectMap
      const incrementalData = this._processJsonlFiles(newFiles, cachedSessionMap, cachedProjectMap, projectPathMap)

      // 合并 messageRecords：缓存数据 + 新数据（增量数据已包含在 sessionMap 中）
      const mergedMessageRecords = [...cachedData.messageRecords, ...incrementalData.messageRecords]

      // 计算完整统计（使用合并后的 messageRecords 和已更新的 sessionMap）
      const stats = this._calculateStats(mergedMessageRecords, incrementalData.sessionMap)

      // 更新 lastProcessedTime
      let newLastProcessedTime = cachedData.lastProcessedTime
      for (const fileInfo of newFiles) {
        if (fileInfo.mtime > newLastProcessedTime) {
          newLastProcessedTime = fileInfo.mtime
        }
      }

      const result = {
        ...stats,
        messageRecords: mergedMessageRecords,
        lastProcessedTime: newLastProcessedTime
      }

      // 更新缓存
      window.utools.db.put({
        _id: cacheKey,
        data: result,
        _rev: cachedRaw._rev
      })

      console.log('增量处理完成，已更新缓存')
      return result
    } catch (error) {
      console.error('读取 Claude usage 数据失败:', error)
      return this._emptyResult()
    }
  },

  copyClaudeCommand(projectPath) {
    if (!projectPath || projectPath === 'unknown') {
      return { success: false, error: '无效的项目路径' }
    }
    const command = `cd "${projectPath}" && claude`
    try {
      window.utools.copyText(command)
      return { success: true }
    } catch (error) {
      console.error('复制命令失败:', error)
      return { success: false, error: error.message }
    }
  }
}
