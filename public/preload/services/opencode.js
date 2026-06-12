const fs = require('node:fs')
const path = require('node:path')
const JSON5 = require('json5')

const OPENCODE_DIR = path.join(window.utools.getPath('home'), '.config', 'opencode')
const OPENCODE_CONFIG_PATH = path.join(OPENCODE_DIR, 'opencode.json')

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

module.exports = {
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
}
