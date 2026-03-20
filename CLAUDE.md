# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **Project Name**: CCSwitch
- **Type**: uTools Plugin (Claude Code Config Switcher)
- **Core Functionality**: 管理 Claude Code 的 API 配置切换 + 使用统计分析
- **Target Users**: 使用 Claude Code 的开发者

## Tech Stack

- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite
- **UI Library**: TDesign Vue Next
- **Platform**: uTools (Electron-based desktop tool platform)

## Commands

```bash
npm run dev     # Development mode (localhost:5173)
npm run build   # Build for production
```

## Architecture

```
src/Switch/
├── index.vue           # Main component with tabs (Config/Usage)
├── UsageView.vue       # Usage statistics view (tokens, models)
└── ContributionGrid.vue # GitHub-style contribution heatmap

public/preload/
└── services.js         # Node.js APIs: file I/O, crypto, usage data parsing
```

**Data Flow:**
- Config management: `~/.claude/settings.json` ↔ uTools DB (encrypted)
- Usage stats: `~/.claude/projects/**/*.jsonl` → parsed & aggregated

**Key Services (preload/services.js):**
- `readClaudeSettings()` / `writeClaudeSettings()` - Claude config file
- `encryptKey()` / `decryptKey()` - AES-256-CBC encryption
- `readClaudeUsage()` - Parse JSONL session files for usage stats

## Key Features

1. **配置管理**: 读取/保存/切换 Claude API 配置
2. **导入导出**: 文件方式(JSON) 或 字符串方式(压缩加密)
3. **使用统计**: Token用量、模型分布、贡献墙热力图