# CCConfig

Claude Code 配置管理工具 — 一款 [uTools](https://u.tools/) 插件，用于管理 Claude Code 的 API 配置切换、MCP/Skill 配置以及使用统计分析。

## 功能特性

- **配置管理** — 读取、保存、切换 `~/.claude/settings.json` 中的 API 配置
- **MCP 配置** — 管理 Claude Code 的 MCP Server 配置
- **Skill 管理** — 从 SkillHub / 魔搭社区一键安装 Skill
- **使用统计** — Token 用量、模型分布、GitHub 风格贡献墙热力图
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
├── main.js                 # 入口，主题初始化
├── App.vue                 # 根组件
├── Switch/
│   ├── index.vue           # 主界面（Tab 切换）
│   ├── ConfigView.vue      # 配置管理视图
│   ├── McpView.vue         # MCP 配置视图
│   ├── SkillView.vue       # Skill 管理视图
│   ├── UsageView.vue       # 使用统计视图
│   ├── ContributionGrid.vue # 贡献墙热力图
│   └── styles/             # 组件样式
├── composables/            # Vue Composables
├── assets/                 # 静态资源
├── constants.js            # 常量定义
├── main.css                # 全局样式
└── theme.css               # 主题变量
public/
├── preload/
│   └── services.js         # Node.js 服务层（文件 I/O、加密、数据解析）
├── plugin.json             # uTools 插件配置
└── logo.png                # 插件图标
```

## 数据流

```
~/.claude/settings.json  ←→  uTools DB（加密存储）
~/.claude/projects/**/*.jsonl  →  解析 & 聚合  →  使用统计
```

## 开发

```bash
npm run dev     # 启动开发服务器 http://localhost:5173
npm run build   # 构建生产版本到 dist/
```

## License

MIT
