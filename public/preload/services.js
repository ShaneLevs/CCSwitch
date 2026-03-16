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
  }
}
