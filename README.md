# CCConfig

多应用 AI 配置管理工具 — 一款 [uTools](https://u.tools/) 插件，支持 **Claude Code**、**OpenCode**、**Pi Agent**、**omp** 四个 AI 工具的 API 配置切换、MCP/Skill/Plugin 管理以及使用统计分析。

## 功能特性

- **四应用切换** — Claude Code / OpenCode / Pi Agent / omp 独立配置，一键切换
- **配置管理** — 读取、保存、切换各应用的 API 配置（Claude 的 `settings.json`、OpenCode 的 `opencode.json`、Pi 的 `models.json`、omp 的 `models.yml` + `modelRoles`）
- **MCP 配置** — 管理各应用的 MCP Server，支持工具发现画布
- **Skill 管理** — 从 SkillHub / 魔搭社区一键安装 Skill（OpenCode 无原生 Skill 概念，见 Plugin）
- **Plugin / Extension 管理** — Claude Marketplace 仓库 + 插件生命周期、OpenCode plugin 数组、Pi Extension (npm/git)
- **使用统计** — Token 用量、模型分布、GitHub 风格贡献墙热力图；Claude 支持 DB 缓存加速二次打开（不持久化历史，清理 JSONL 后统计如实归零）
- **Pi 模型 CRUD** — 供应商/模型增删、名称和 ID 可编辑、自动从 `/models` API 拉取模型列表、设置默认模型自动切换供应商
- **导入导出** — 支持 JSON 文件方式或压缩加密字符串方式
- **密钥加密** — API Key 使用 AES-256-CBC 加密存储到 uTools 数据库
- **深色模式** — 自动跟随系统主题切换

## 安装

### 方式一：uTools 插件商店

在 uTools 插件商店搜索 **CCConfig** 即可安装。

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

在 uTools 中输入以下关键词唤起插件（点击运行时默认执行第一个关键词）：

| 关键词 | 功能 |
|--------|------|
| `Claude Code配置` | 打开 Claude Code 配置管理 |
| `OpenCode配置` | 打开 OpenCode 配置管理 |
| `Pi Agents配置` | 打开 Pi Agent 配置管理 |
| `omp配置` | 打开 omp 配置管理 |
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
│   ├── index.vue              # 主界面（应用切换 + 4/5-tab 视图，OpenCode 无 Skill tab）
│   ├── ConfigView.vue         # Claude 配置管理
│   ├── McpView.vue            # Claude MCP 配置
│   ├── SkillView.vue          # Claude Skill 管理
│   ├── UsageView.vue          # Claude 使用统计
│   ├── ContributionGrid.vue   # 贡献墙热力图
│   ├── OpenCodeConfigView.vue # OpenCode provider CRUD
│   ├── OpenCodeMcpView.vue    # OpenCode MCP 管理
│   ├── OpenCodePluginView.vue # OpenCode plugin 管理
│   ├── OpenCodeUsageView.vue  # OpenCode 使用统计（opencode.db）
│   ├── PiConfigView.vue       # Pi 供应商/模型 CRUD
│   ├── PiMcpView.vue          # Pi MCP（来自扩展）
│   ├── PiSkillView.vue        # Pi Skill（来自扩展）
│   ├── PiPluginView.vue       # Pi Extension 管理
│   ├── PiUsageView.vue        # Pi 使用统计
│   ├── OmpConfigView.vue      # omp 模型角色 (modelRoles) + 供应商/模型 CRUD
│   └── styles/                # 组件样式
├── composables/               # Vue Composables
├── constants.js               # 常量定义
├── main.css / theme.css       # 全局样式与主题变量
public/
├── preload/
│   ├── services.js            # 服务入口 → window.services
│   └── services/
│       ├── config.js          # Claude settings/claude.json I/O，含 uTools DB 缓存读写
│       ├── crypto.js          # AES-256-CBC 加密 + 替换加密
│       ├── mcp.js             # MCP 管理 + SDK 工具发现（STDIO/HTTP/SSE）
│       ├── opencode.js        # OpenCode config CRUD + SQLite/子进程双读 + 模型名解析
│       ├── pi.js              # Pi Agent 全功能服务层（/providers /models /extensions /sessions）
│       ├── omp.js             # omp modelRoles + models.yml providers CRUD（js-yaml 纯文件读写）
│       └── usage.js           # 共享统计聚合（Claude + OpenCode + Pi 都用 calculateStats）
├── plugin.json                # uTools 插件配置
└── logo.png / icon-opencode.png / icon-pi.png
```

## 数据流

```
Claude:
  ~/.claude/settings.json  ←→  uTools DB（AES-256-CBC 加密）
  ~/.claude/projects/**/*.jsonl  →  UsageView 通过 readClaudeUsage() 全量解析
                                  → signature = file_count:max_mtime 校验 → DB 缓存命中秒开
                                  → 不持久化热力图历史；清理 JSONL 后统计如实归零

OpenCode:
  ~/.config/opencode.json (json5)  ←→  uTools DB
  使用统计：
    数据目录（全平台）：~/.local/share/opencode/opencode.db
    回退候选：%LOCALAPPDATA%\opencode\ → ~/AppData/Local/opencode\ → storage/*.json
    读取路径：原生 node:sqlite → 子进程 --experimental-sqlite（Electron 沙箱回退）
    模型名：session.model 列存 JSON {"id":"...","providerID":"..."}，需取 .id 字段
    usage.calculateStats 汇总 tokens_* 五列（input/output/reasoning/cache_read/cache_write）

Pi Agent:
  ~/.pi/agent/settings.json + models.json  + extensions  ←→  uTools DB
  ~/.pi/agent/sessions/**/*.jsonl  →  解析 & 聚合  →  使用统计
  特殊 schema：cost 必须含 {input, output, cacheRead, cacheWrite} 四项；contextWindow 为 0 则省略

omp:
  ~/.omp/agent/config.yml modelRoles  →  js-yaml 直接读写（load → 改 modelRoles → dump 写回）
  ~/.omp/agent/models.yml providers    →  js-yaml 直接读写
  模型引用格式：provider/model[:thinkingLevel]，无前缀引用编辑时自动补全带前缀
  删除供应商/模型前检查 modelRoles 引用，被引用时拒绝删除
  纯文件读写，不依赖 omp 二进制 / bun 运行时
```

## 开发

```bash
npm run dev     # 启动开发服务器 http://localhost:5173
npm run build   # 构建生产版本到 dist/
```

## License

MIT
