# CCConfig

多应用 AI 配置管理工具 — 一款 [uTools](https://u.tools/) 插件，支持 **Claude Code**、**OpenCode**、**Pi Agent** 三个 AI 工具的 API 配置切换、MCP/Skill/Plugin 管理以及使用统计分析。

## 功能特性

- **三应用切换** — Claude Code / OpenCode / Pi Agent 独立配置，一键切换
- **配置管理** — 读取、保存、切换各应用的 API 配置（Claude 的 `settings.json`、OpenCode 的 `opencode.json`、Pi 的 `models.json`）
- **MCP 配置** — 管理各应用的 MCP Server，支持工具发现画布
- **Skill 管理** — 从 SkillHub / 魔搭社区一键安装 Skill
- **Plugin / Extension 管理** — Claude Marketplace 仓库 + 插件生命周期、OpenCode plugin 数组、Pi Extension (npm/git)
- **使用统计** — Token 用量、模型分布、GitHub 风格贡献墙热力图
- **Pi 模型 CRUD** — 供应商/模型增删、自动从 `/models` API 拉取模型列表、切换供应商自动同步默认模型
- **导入导出** — 支持 JSON 文件方式或压缩加密字符串方式
- **密钥加密** — API Key 使用 AES-256-CBC 加密存储到 uTools 数据库
- **深色模式** — 自动跟随系统主题切换

## 安装

### 方式一：uTools 插件商店

在 uTools 插件商店搜索 **CCConfig** 或 **Claude配置切换** 即可安装。

### 方式二：本地开发

```bash
# 克隆仓库
git clone https://github.com/<your-username>/CCSwitch.git
cd CCSwitch

# 安装依赖
npm install

# 开发模式（localhost:5173）
npm run dev

# 构建生产版本
npm run build
```

构建产物在 `dist/` 目录，可通过 uTools 开发者工具加载。

## 使用方式

在 uTools 中输入以下关键词唤起插件：

| 关键词 | 功能 |
|--------|------|
| `CCConfig` | 打开配置管理 |
| `Claude配置切换` | 打开配置管理 |
| `切换Claude配置` | 打开配置管理 |
| 粘贴 SkillHub / 魔搭链接 | 自动进入 Skill 安装 |

## 技术栈

- [Vue 3](https://vuejs.org/) (Composition API + `<script setup>`)
- [Vite](https://vitejs.dev/)
- [TDesign Vue Next](https://tdesign.tencent.com/vue-next)
- [uTools API](https://u.tools/docs/developer/api.html)

## 项目结构

```
src/
├── main.js                    # 入口，主题初始化
├── App.vue                    # 根组件
├── Switch/
│   ├── index.vue              # 主界面（应用切换 + 5-tab 视图）
│   ├── ConfigView.vue         # Claude 配置管理
│   ├── McpView.vue            # Claude MCP 配置
│   ├── SkillView.vue          # Claude Skill 管理
│   ├── UsageView.vue          # Claude 使用统计
│   ├── ContributionGrid.vue   # 贡献墙热力图
│   ├── OpenCodeConfigView.vue # OpenCode provider CRUD
│   ├── OpenCodeMcpView.vue    # OpenCode MCP 管理
│   ├── OpenCodePluginView.vue # OpenCode plugin 管理
│   ├── PiConfigView.vue       # Pi 供应商/模型 CRUD
│   ├── PiMcpView.vue          # Pi MCP（来自扩展）
│   ├── PiSkillView.vue        # Pi Skill（来自扩展）
│   ├── PiPluginView.vue       # Pi Extension 管理
│   ├── PiUsageView.vue        # Pi 使用统计
│   └── styles/                # 组件样式
├── composables/               # Vue Composables
├── constants.js               # 常量定义
├── main.css / theme.css       # 全局样式与主题变量
public/
├── preload/
│   ├── services.js            # 服务入口 → window.services
│   └── services/
│       ├── config.js          # Claude settings/claude.json I/O
│       ├── crypto.js          # AES-256-CBC 加密
│       ├── mcp.js             # MCP 管理 + SDK 工具发现
│       ├── opencode.js        # OpenCode config CRUD (json5)
│       ├── pi.js              # Pi Agent 全功能服务层
│       └── usage.js           # 共享 JSONL 解析（Claude + Pi）
├── plugin.json                # uTools 插件配置
└── logo.png / icon-opencode.png / icon-pi.png
```

## 数据流

```
Claude:
  ~/.claude/settings.json  ←→  uTools DB（加密存储）
  ~/.claude/projects/**/*.jsonl  →  解析 & 聚合  →  使用统计

OpenCode:
  ~/.config/opencode.json (json5)  ←→  uTools DB
  %LOCALAPPDATA%\opencode\opencode.db (SQLite) 或 storage/ (JSON)  →  解析 & 聚合  →  使用统计

Pi Agent:
  ~/.pi/agent/settings.json + models.json  ←→  uTools DB
  ~/.pi/agent/sessions/**/*.jsonl  →  解析 & 聚合  →  使用统计
```

## 开发

```bash
npm run dev     # 启动开发服务器 http://localhost:5173
npm run build   # 构建生产版本到 dist/
```

## License

MIT
