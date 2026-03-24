const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')

const CLAUDE_SETTINGS_PATH = path.join(window.utools.getPath('home'), '.claude', 'settings.json')

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

  // 读取 Claude Code usage 数据
  readClaudeUsage() {
    try {
      const homeDir = window.utools.getPath('home')
      const projectsDir = path.join(homeDir, '.claude', 'projects')

      const emptyResult = {
        records: [],
        summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, totalTokens: 0, sessionCount: 0 },
        modelStats: [],
        projectStats: [],
        contributions: [],
        avgTokensPerSession: 0,
        recentSessions: []
      }

      if (!fs.existsSync(projectsDir)) {
        return emptyResult
      }

      const sessionMap = new Map() // sessionId -> { inputTokens, outputTokens, cacheReadTokens, model, timestamp, project }
      const projectMap = new Map() // projectPath -> { inputTokens, outputTokens, totalTokens, sessions }
      const messageRecords = [] // 每条消息的记录，用于按时间准确统计

      // 先获取所有项目文件夹，为每个项目确定真实路径
      const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)

      // 项目文件夹名 -> 真实路径的映射
      const projectPathMap = new Map()

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

      // 遍历所有 jsonl 文件处理 usage 数据
      const jsonlFiles = findJsonlFiles(projectsDir)

      for (const filePath of jsonlFiles) {
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
              }
            } catch (parseError) {
              // 跳过解析失败的行
            }
          }
        } catch (fileError) {
          console.error('读取文件失败:', filePath, fileError)
        }
      }

      // 转换为数组并计算 totalTokens（四个字段相加）
      const allRecords = Array.from(sessionMap.values()).map(session => ({
        ...session,
        totalTokens: session.inputTokens + session.outputTokens + session.cacheReadTokens + session.cacheCreationTokens
      }))

      // 按时间排序
      allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      // 计算汇总数据（使用每条消息的记录）
      const summary = messageRecords.reduce((acc, record) => {
        acc.inputTokens += record.inputTokens
        acc.outputTokens += record.outputTokens
        acc.cacheReadTokens += record.cacheReadTokens
        acc.cacheCreationTokens += record.cacheCreationTokens
        acc.totalTokens += record.totalTokens
        return acc
      }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, messageCount: messageRecords.length, sessionCount: sessionMap.size })

      // 计算模型使用分布（使用每条消息的记录）
      const modelMap = new Map()
      messageRecords.forEach(record => {
        if (!modelMap.has(record.model)) {
          modelMap.set(record.model, { name: record.model, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 })
        }
        const stat = modelMap.get(record.model)
        stat.sessions.add(record.sessionId)
        stat.tokens += record.totalTokens
        // 输入 = input + cacheCreation + cacheRead
        stat.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
        stat.outputTokens += record.outputTokens
      })
      const modelStats = Array.from(modelMap.values())
        .map(stat => ({ ...stat, sessions: stat.sessions.size }))
        .sort((a, b) => b.tokens - a.tokens)

      // 计算项目使用分布（使用 projectPath 作为 key，避免同名项目冲突）
      messageRecords.forEach(record => {
        const projectPathKey = record.projectPath || 'unknown'
        const projectDisplayName = projectPathKey !== 'unknown' ? path.basename(projectPathKey) : 'unknown'
        if (!projectMap.has(projectPathKey)) {
          const exists = projectPathKey !== 'unknown' ? fs.existsSync(projectPathKey) : false
          projectMap.set(projectPathKey, { name: projectDisplayName, path: projectPathKey, exists, sessions: new Set(), tokens: 0, inputTokens: 0, outputTokens: 0 })
        }
        const stat = projectMap.get(projectPathKey)
        stat.sessions.add(record.sessionId) // 使用 Set 去重计数
        stat.tokens += record.totalTokens
        // 输入 = input + cacheCreation + cacheRead
        stat.inputTokens += record.inputTokens + record.cacheCreationTokens + record.cacheReadTokens
        stat.outputTokens += record.outputTokens
      })
      const projectStats = Array.from(projectMap.values())
        .map(stat => ({ ...stat, sessions: stat.sessions.size })) // Set 转为数量
        .sort((a, b) => b.tokens - a.tokens)

      // 计算贡献墙数据（按每条消息的时间准确统计）
      const now = new Date()
      const contributionMap = new Map() // date -> { tokens, inputTokens, outputTokens, models: { modelName: { inputTokens, outputTokens } } }
      const totalDays = 365
      for (let i = totalDays - 1; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const dateKey = d.toISOString().split('T')[0]
        contributionMap.set(dateKey, { date: dateKey, tokens: 0, inputTokens: 0, outputTokens: 0, models: {} })
      }
      // 使用每条消息的记录，按消息实际时间归属日期
      messageRecords.forEach(record => {
        const dateKey = record.timestamp.split('T')[0]
        if (contributionMap.has(dateKey)) {
          const day = contributionMap.get(dateKey)
          day.tokens += record.totalTokens
          // 输入 = input + cacheCreation + cacheRead
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
    } catch (error) {
      console.error('读取 Claude usage 数据失败:', error)
        return {
          records: [],
          summary: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, sessionCount: 0 },
          modelStats: [],
          projectStats: [],
          contributions: [],
          avgTokensPerSession: 0,
          recentSessions: []
        }
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
