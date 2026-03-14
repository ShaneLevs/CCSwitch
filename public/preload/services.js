const fs = require('node:fs')
const path = require('node:path')

const CLAUDE_SETTINGS_PATH = path.join(window.utools.getPath('home'), '.claude', 'settings.json')

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
  }
}
