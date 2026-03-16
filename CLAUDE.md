# CLAUDE.md

## Project Overview

- **Project Name**: CCSwitch
- **Type**: uTools Plugin (Claude Code Config Switcher)
- **Core Functionality**: 管理并快速切换 Claude Code 的 API 配置（Key、Base URL、Model）
- **Target Users**: 使用 Claude Code 并需要切换不同 API 配置的用户

## Tech Stack

- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite
- **UI Library**: TDesign Vue Next
- **Platform**: uTools (Electron-based desktop tool platform)

## Project Structure

```
CCSwitch/
├── index.html              # Entry HTML
├── package.json             # Dependencies & scripts
├── vite.config.js           # Vite configuration
├── jsconfig.json            # JS config for IDE
├── public/
│   ├── logo.png             # App logo
│   ├── plugin.json          # uTools plugin manifest
│   └── preload/
│       └── services.js      # Preload script (Node.js APIs)
└── src/
    ├── main.js              # Vue app entry
    ├── main.css             # Global styles
    ├── App.vue              # Root component (router)
    └── Switch/
        └── index.vue        # Main feature component
```

## Key Features

1. **读取当前配置**: 从 `~/.claude/settings.json` 读取当前 Claude 配置
2. **保存配置**: 将配置加密存储到 uTools 本地数据库
3. **切换配置**: 一键切换到保存的配置
4. **导入/导出**: 支持两种方式：
   - **文件方式**: JSON 格式导出/导入配置文件
   - **字符串方式**: 压缩加密后的配置字符串，支持剪贴板复制/粘贴
5. **加密存储**: 使用 AES-256-CBC 加密存储 API Key
6. **配置去重**: 导出字符串时自动对重复的 key 和 URL 进行引用去重

## Important Files

- `src/Switch/index.vue` - 主组件，包含所有业务逻辑
- `public/preload/services.js` - 提供 Node.js API（文件系统操作、加密）
- `public/plugin.json` - uTools 插件配置

## Commands

```bash
npm run dev     # Development mode (localhost:5173)
npm run build   # Build for production
```

## Key Implementation Details

- 配置存储在 uTools 数据库（`ccswitch_config_` 前缀）
- API Key 使用固定密钥加密（SHA256 哈希）
- 配置导出文件格式：`_id` 为 `DB_PREFIX + timestamp + random`，包含 `name`, `key`(加密), `baseUrl`, `model`, `updatedAt`

### 字符串导出格式

导出流程：配置数组 → 字段简化 + 去重 → JSON → zlib 压缩 → Base64 → 字符替换加密

**字段命名**（带数字后缀，从1开始）：
- `n1`, `n2`... - 配置名称 (name)
- `k1`, `k2`... - API Key
- `u1`, `u2`... - Base URL
- `m1`, `m2`... - Model

**去重引用**：
- 如果 key 重复，使用 `k1` 引用第一个配置的 key
- 如果 URL 重复，使用 `u1` 引用第一个配置的 URL

**加密方式**：
- 字符替换加密（Base64 字符集 ↔ 打乱字符集），保持长度不变
- 解密时反向替换还原为 Base64