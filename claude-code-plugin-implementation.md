# OpenCovibe Claude Code Plugin 实现详解

> 本文档详细介绍 OpenCovibe 中 Claude Code 插件系统的两个核心功能：**Marketplace 仓库管理**和**插件生命周期管理**。

---

## 目录

- [架构概览](#架构概览)
- [功能一：Marketplace 仓库管理](#功能一marketplace-仓库管理)
  - [1.1 列出已注册仓库](#11-列出已注册仓库)
  - [1.2 添加仓库](#12-添加仓库)
  - [1.3 移除仓库](#13-移除仓库)
  - [1.4 更新仓库](#14-更新仓库)
  - [1.5 仓库来源校验](#15-仓库来源校验)
- [功能二：插件生命周期管理](#功能二插件生命周期管理)
  - [2.1 浏览 Marketplace 插件](#21-浏览-marketplace-插件)
  - [2.2 列出已安装插件](#22-列出已安装插件)
  - [2.3 安装插件](#23-安装插件)
  - [2.4 卸载插件](#24-卸载插件)
  - [2.5 启用/禁用插件](#25-启用禁用插件)
  - [2.6 更新插件](#26-更新插件)
  - [2.7 核心执行引擎](#27-核心执行引擎)
  - [2.8 输入校验](#28-输入校验)
- [前端 API 层](#前端-api-层)
- [关键数据结构](#关键数据结构)

---

## 架构概览

OpenCovibe 的插件系统分为三层：

```
┌─────────────────────────────────────────────────┐
│  前端 Svelte 页面                                │
│  src/routes/plugins/+page.svelte                │
│  ├── Skills Tab  (社区技能 / 独立技能)            │
│  ├── Plugins Tab (Marketplace / Installed)       │
│  ├── MCP Tab / Hooks Tab / Agents Tab            │
└─────────────┬───────────────────────────────────┘
              │ Tauri IPC (invoke)
┌─────────────▼───────────────────────────────────┐
│  前端 API 层                                     │
│  src/lib/api.ts                                 │
│  (35 个插件相关函数)                              │
└─────────────┬───────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────┐
│  Rust 命令层                                     │
│  src-tauri/src/commands/plugins.rs              │
│  - 参数校验 (validate_plugin_name / validate_scope)│
│  - cwd 解析 (validate_plugin_cwd)                │
│  - 路由到存储层或 CLI 执行                        │
└──────┬────────────────────┬─────────────────────┘
       │                    │
       │  文件系统读写        │  CLI 进程执行
       ▼                    ▼
┌──────────────┐  ┌─────────────────────────┐
│ storage/     │  │ claude plugin ...        │
│ plugins.rs   │  │ (tokio::process::Command)│
│              │  │ 30 秒超时                 │
│ 读取:        │  │ 自动检测 claude 路径       │
│  known_mar-  │  │ 注入 PATH                │
│  ketplaces   │  │ 移除 CLAUDECODE 环境变量   │
│  .json       │  └─────────────────────────┘
│  marketplace │
│  .json       │
│  install-    │
│  counts-     │
│  cache.json  │
└──────────────┘
```

**核心设计原则**：OpenCovibe 不是重新实现 Claude Code 的插件系统，而是作为 **GUI 代理层** —— 浏览/查询类操作直接读取 `~/.claude/plugins/` 下的 JSON 文件，生命周期类操作透传 `claude plugin` CLI 命令。

---

## 功能一：Marketplace 仓库管理

Marketplace 仓库管理负责注册、浏览、更新和移除插件市场源。所有仓库元数据存储在 `~/.claude/plugins/known_marketplaces.json` 中。

### 1.1 列出已注册仓库

**Rust 命令**: `list_marketplaces`

**实现路径**: `commands/plugins.rs:29` → `storage/plugins.rs:66`

**实现方式**：纯文件系统读取，不调用 CLI。

#### 执行流程

```
1. 读取 ~/.claude/plugins/known_marketplaces.json
2. 对每个仓库，读取 {install_location}/.claude-plugin/marketplace.json
   获取 plugin_count
3. 返回 MarketplaceInfo 列表
```

#### 关键代码

**文件**: `src-tauri/src/storage/plugins.rs`，第 66–97 行

```rust
pub fn list_marketplaces() -> Vec<MarketplaceInfo> {
    let known_path = plugins_dir().join("known_marketplaces.json");
    let entries: HashMap<String, KnownMarketplaceEntry> = match read_json(&known_path) {
        Some(v) => v,
        None => return vec![],
    };

    let mut result = Vec::new();
    for (name, entry) in &entries {
        let manifest_path = PathBuf::from(&entry.install_location)
            .join(".claude-plugin")
            .join("marketplace.json");
        let plugin_count = read_json::<MarketplaceManifest>(&manifest_path)
            .map(|m| m.plugins.len())
            .unwrap_or(0);

        result.push(MarketplaceInfo {
            name: name.clone(),
            source: entry.source.clone(),
            install_location: entry.install_location.clone(),
            last_updated: entry.last_updated.clone(),
            plugin_count,
        });
    }

    result
}
```

#### 依赖的数据文件

**`known_marketplaces.json`** 的结构：

```json
{
  "claude-plugins-official": {
    "source": "https://github.com/anthropics/claude-plugins-official",
    "installLocation": "/home/user/.claude/plugins/cache/claude-plugins-official",
    "lastUpdated": "2025-01-15T10:30:00Z"
  }
}
```

**`marketplace.json`** 的结构（位于每个仓库的 `.claude-plugin/` 目录下）：

```json
{
  "plugins": [
    {
      "name": "frontend-design",
      "description": "Frontend design and UI/UX assistance",
      "version": "1.2.0",
      "author": { "name": "Anthropic" },
      "category": "development",
      "homepage": "https://github.com/anthropics/frontend-design",
      "source": "./plugins/frontend-design",
      "tags": ["ui", "react", "css"],
      "strict": false
    }
  ]
}
```

#### 反序列化结构体

```rust
#[derive(Deserialize)]
struct KnownMarketplaceEntry {
    pub source: serde_json::Value,
    pub install_location: String,      // serde rename: "installLocation"
    pub last_updated: Option<String>,  // serde rename: "lastUpdated"
}

#[derive(Deserialize)]
struct MarketplaceManifest {
    pub plugins: Vec<MarketplacePlugin>,  // #[serde(default)]
}
```

#### 前端调用

**文件**: `src/lib/api.ts`，第 1001–1004 行

```typescript
export async function listMarketplaces(): Promise<MarketplaceInfo[]> {
  return invoke<MarketplaceInfo[]>("list_marketplaces");
}
```

**文件**: `src/routes/plugins/+page.svelte`，第 290 行（`onMount` 中并发加载）

```typescript
const results = await Promise.allSettled([
  listMarketplacePlugins(),
  listInstalledPlugins(),
  listStandaloneSkills(projectCwd || undefined),
  listMarketplaces(),          // ← 与其他数据并发加载
  listCodexSkills(projectCwd || undefined),
  listCodexInstalledPlugins(),
]);
```

---

### 1.2 添加仓库

**Rust 命令**: `add_marketplace`

**实现路径**: `commands/plugins.rs:177` → `storage/plugins.rs` (`run_plugin_command` + `validate_marketplace_source`)

**实现方式**：调用 `claude plugin marketplace add <source>` CLI 命令。

#### 执行流程

```
1. 前端收集用户输入的 source（URL / GitHub owner/repo / 本地路径）
2. 命令层调用 validate_marketplace_source(&source) 做安全校验
3. 通过 run_plugin_command 执行 CLI 命令
4. 返回 PluginOperationResult { success, message }
```

#### 关键代码 — 命令层

**文件**: `src-tauri/src/commands/plugins.rs`，第 177–192 行

```rust
#[tauri::command]
pub async fn add_marketplace(source: String) -> Result<PluginOperationResult, String> {
    log::debug!("[plugins] add_marketplace: source={}", source);
    crate::storage::plugins::validate_marketplace_source(&source)?;

    let result =
        crate::storage::plugins::run_plugin_command(
            &["marketplace", "add", &source], None
        ).await?;

    Ok(PluginOperationResult {
        success: result.success,
        message: if result.success {
            result.stdout.trim().to_string()
        } else {
            result.stderr.trim().to_string()
        },
    })
}
```

#### 执行的 CLI 命令

```bash
claude plugin marketplace add <source>
```

实际示例：
```bash
claude plugin marketplace add https://github.com/anthropics/claude-plugins-official
claude plugin marketplace add owner/repo
claude plugin marketplace add /path/to/local/marketplace
```

#### 前端调用

**文件**: `src/lib/api.ts`，第 1153–1156 行

```typescript
export async function addMarketplace(source: string): Promise<PluginOperationResult> {
  return invoke<PluginOperationResult>("add_marketplace", { source });
}
```

**文件**: `src/routes/plugins/+page.svelte`，第 818–841 行

```typescript
async function handleAddMarketplace() {
  const source = newMarketplaceSource.trim();
  if (!source) return;
  operationLoading = "__marketplace_add";
  try {
    const result = await addMarketplace(source);
    showToast(
      result.success
        ? t("plugin_addedMarketplace")
        : t("plugin_failedOp", { error: result.message }),
      result.success ? "success" : "error",
    );
    if (result.success) {
      newMarketplaceSource = "";
      [plugins, marketplaces] = await Promise.all([
        listMarketplacePlugins(), listMarketplaces()
      ]);
    }
  } catch (e) {
    showToast(t("plugin_errorGeneric", { error: String(e) }), "error");
  } finally {
    operationLoading = null;
  }
}
```

---

### 1.3 移除仓库

**Rust 命令**: `remove_marketplace`

**实现路径**: `commands/plugins.rs:194` → `storage/plugins.rs` (`run_plugin_command`)

**实现方式**：调用 `claude plugin marketplace remove <name>` CLI 命令。

#### 关键代码

**文件**: `src-tauri/src/commands/plugins.rs`，第 194–211 行

```rust
#[tauri::command]
pub async fn remove_marketplace(name: String) -> Result<PluginOperationResult, String> {
    log::debug!("[plugins] remove_marketplace: name={}", name);
    crate::storage::plugins::validate_plugin_name(&name)?;

    let result =
        crate::storage::plugins::run_plugin_command(
            &["marketplace", "remove", &name], None
        ).await?;

    Ok(PluginOperationResult {
        success: result.success,
        message: if result.success {
            result.stdout.trim().to_string()
        } else {
            result.stderr.trim().to_string()
        },
    })
}
```

#### 执行的 CLI 命令

```bash
claude plugin marketplace remove <name>
```

示例：
```bash
claude plugin marketplace remove claude-plugins-official
```

#### 前端调用

**文件**: `src/routes/plugins/+page.svelte`，第 843–872 行。前端在执行前会弹出确认对话框：

```typescript
async function handleRemoveMarketplace(name: string) {
  confirmAction = {
    title: t("plugin_removeMarketplaceTitle"),
    message: t("plugin_removeMarketplaceMsg", { name }),
    onConfirm: async () => {
      operationLoading = `__mp_${name}`;
      const result = await removeMarketplace(name);
      // 成功后刷新 marketplace 列表和插件列表
      if (result.success) {
        [plugins, marketplaces] = await Promise.all([
          listMarketplacePlugins(), listMarketplaces(),
        ]);
      }
    },
  };
}
```

---

### 1.4 更新仓库

**Rust 命令**: `update_marketplace`

**实现路径**: `commands/plugins.rs:213` → `storage/plugins.rs` (`run_plugin_command`)

**实现方式**：调用 `claude plugin marketplace update [name]` CLI 命令。不传 `name` 时更新所有仓库。

#### 关键代码

**文件**: `src-tauri/src/commands/plugins.rs`，第 213–235 行

```rust
#[tauri::command]
pub async fn update_marketplace(name: Option<String>) -> Result<PluginOperationResult, String> {
    log::debug!("[plugins] update_marketplace: name={:?}", name);
    if let Some(ref n) = name {
        crate::storage::plugins::validate_plugin_name(n)?;
    }

    let args: Vec<&str> = match &name {
        Some(n) => vec!["marketplace", "update", n.as_str()],
        None => vec!["marketplace", "update"],
    };

    let result = crate::storage::plugins::run_plugin_command(&args, None).await?;

    Ok(PluginOperationResult {
        success: result.success,
        message: if result.success {
            result.stdout.trim().to_string()
        } else {
            result.stderr.trim().to_string()
        },
    })
}
```

#### 执行的 CLI 命令

```bash
# 更新指定仓库
claude plugin marketplace update claude-plugins-official

# 更新所有仓库
claude plugin marketplace update
```

---

### 1.5 仓库来源校验

**函数**: `validate_marketplace_source`

**文件**: `src-tauri/src/storage/plugins.rs`，第 758–777 行

```rust
pub fn validate_marketplace_source(source: &str) -> Result<(), String> {
    if source.is_empty() {
        return Err("Marketplace source cannot be empty".to_string());
    }
    if source.len() > 1024 {
        return Err("Marketplace source too long".to_string());
    }
    // 禁止 Shell 元字符，防止命令注入
    let dangerous = [
        ';', '|', '&', '`', '$', '(', ')', '{', '}', '<', '>', '\n', '\r',
    ];
    for c in &dangerous {
        if source.contains(*c) {
            return Err(format!("Invalid character '{}' in marketplace source", c));
        }
    }
    Ok(())
}
```

**校验规则**：
| 规则 | 说明 |
|------|------|
| 非空检查 | source 不能为空字符串 |
| 长度限制 | 最大 1024 字符 |
| 危险字符过滤 | 拒绝 `;` `\|` `&` `` ` `` `$` `(` `)` `{` `}` `<` `>` `\n` `\r` |

接受的 source 格式示例：
- `https://github.com/user/repo.git`
- `owner/repo`
- `/path/to/local/marketplace`

---

## 功能二：插件生命周期管理

插件生命周期管理涵盖：浏览 Marketplace、安装、卸载、启用、禁用、更新插件。所有改变状态的操作都通过执行 `claude plugin` CLI 命令完成；只读浏览操作直接读取本地 JSON 文件。

### 2.1 浏览 Marketplace 插件

**Rust 命令**: `list_marketplace_plugins`

**实现路径**: `commands/plugins.rs:34` → `storage/plugins.rs:100`

**实现方式**：纯文件系统读取，不调用 CLI。遍历所有已注册仓库的 `marketplace.json`，收集插件列表并丰富元数据。

#### 执行流程

```
1. 调用 list_marketplaces() 获取所有已注册仓库
2. 读取 ~/.claude/plugins/install-counts-cache.json 获取安装次数
3. 对每个仓库:
   a. 读取 {install_location}/.claude-plugin/marketplace.json
   b. 为每个插件标注 marketplace_name
   c. 从 counts_map 查找 install_count (key = "pluginName@marketplaceName")
   d. 如果插件 source 以 "./" 开头 (本地插件):
      → 调用 discover_plugin_components() 扫描子目录
   e. 否则 (外部插件): 使用默认空 PluginComponents
4. 按 install_count 降序排序
```

#### 关键代码

**文件**: `src-tauri/src/storage/plugins.rs`，第 100–167 行

```rust
pub fn list_marketplace_plugins() -> Vec<MarketplacePlugin> {
    let marketplaces = list_marketplaces();

    // 加载安装次数缓存
    let counts_path = plugins_dir().join("install-counts-cache.json");
    let counts_map: HashMap<String, u64> = read_json::<InstallCountsCache>(&counts_path)
        .map(|cache| {
            cache.counts.into_iter()
                .map(|e| (e.plugin, e.unique_installs))
                .collect()
        })
        .unwrap_or_default();

    let mut all_plugins = Vec::new();

    for mp in &marketplaces {
        let manifest_path = PathBuf::from(&mp.install_location)
            .join(".claude-plugin")
            .join("marketplace.json");
        let manifest: MarketplaceManifest = match read_json(&manifest_path) {
            Some(m) => m,
            None => continue,
        };

        for mut plugin in manifest.plugins {
            plugin.marketplace_name = Some(mp.name.clone());

            let count_key = format!("{}@{}", plugin.name, mp.name);
            plugin.install_count = counts_map.get(&count_key).copied();

            // 本地插件 → 发现组件
            let is_local = plugin.source.as_ref()
                .and_then(|s| s.as_str())
                .map(|s| s.starts_with("./"))
                .unwrap_or(false);

            if is_local {
                if let Some(rel_path) = plugin.source.as_ref()
                    .and_then(|s| s.as_str())
                {
                    let plugin_dir = PathBuf::from(&mp.install_location)
                        .join(rel_path);
                    plugin.components = discover_plugin_components(
                        &plugin_dir, &plugin.lsp_servers
                    );
                }
            }

            all_plugins.push(plugin);
        }
    }

    // 按安装次数降序排序
    all_plugins.sort_by(|a, b| {
        let a_count = a.install_count.unwrap_or(0);
        let b_count = b.install_count.unwrap_or(0);
        b_count.cmp(&a_count)
    });

    all_plugins
}
```

#### 组件发现

**函数**: `discover_plugin_components`

**文件**: `src-tauri/src/storage/plugins.rs`，第 170–214 行

对本地插件目录进行组件扫描，识别插件包含的能力：

```rust
fn discover_plugin_components(
    plugin_dir: &Path,
    lsp_servers_json: &Option<serde_json::Value>,
) -> PluginComponents {
    // skills:  扫描 skills/ 下的子目录名
    let skills = list_subdir_names(&plugin_dir.join("skills"));

    // commands: 递归扫描 commands/ 下的 .md 文件
    let mut commands = Vec::new();
    visit_md_stems(&plugin_dir.join("commands"), "", 0,
        &mut |name, _| commands.push(name));

    // agents:  递归扫描 agents/ 下的 .md 文件
    let mut agents = Vec::new();
    visit_md_stems(&plugin_dir.join("agents"), "", 0,
        &mut |name, _| agents.push(name));

    // hooks:  检查 hooks/ 目录或 hooks.json 文件是否存在
    let hooks = plugin_dir.join("hooks").is_dir()
             || plugin_dir.join("hooks.json").is_file();

    // mcp_servers: 解析 .mcp.json 的 key 列表
    let mcp_servers = if let Some(mcp) =
        read_json::<serde_json::Map<String, serde_json::Value>>(
            &plugin_dir.join(".mcp.json"))
    {
        mcp.keys().cloned().collect()
    } else {
        vec![]
    };

    // lsp_servers: 从 marketplace.json 的 lspServers 字段读取
    let lsp_servers = match lsp_servers_json {
        Some(serde_json::Value::Object(map)) => map.keys().cloned().collect(),
        _ => vec![],
    };

    PluginComponents { skills, commands, agents, hooks, mcp_servers, lsp_servers }
}
```

**插件目录结构示例**：

```
.claude-plugin/
├── marketplace.json        ← 插件列表清单
└── plugins/
    └── frontend-design/
        ├── skills/          → skills 组件列表
        │   ├── react-best-practices/
        │   └── css-architecture/
        ├── commands/        → commands 组件列表
        │   ├── design-review.md
        │   └── opsx/
        │       └── apply.md
        ├── agents/          → agents 组件列表
        │   └── ui-reviewer.md
        ├── hooks/           → hooks 存在标记 (bool)
        ├── hooks.json       → hooks 存在标记 (bool)
        └── .mcp.json        → mcp_servers 列表
```

#### 前端 UI 展示

**文件**: `src/routes/plugins/+page.svelte`，第 1940–2069 行

前端以卡片网格展示插件（带搜索、分类过滤、scope 选择器）：

```svelte
<!-- 每个插件卡片包含: -->
<div class="rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
  <!-- 插件名 + 版本 + 作者 -->
  <span>{plugin.name}</span>
  <span>v{plugin.version}</span>
  <span>{plugin.author.name}</span>

  <!-- 描述 -->
  <p>{plugin.description}</p>

  <!-- 组件标签 (skills/commands/agents/hooks/mcp/lsp) -->
  {#each componentBadges as badge}
    {#if hasComponent(plugin.components, badge.key)}
      <span class="badge">{badge.label()}</span>
    {/if}
  {/each}

  <!-- 安装按钮 -->
  <button onclick={() => handleInstall(plugin.name)}>
    Install
  </button>
</div>
```

组件标签的像素映射：

```typescript
const componentBadges = [
  { key: "skills",      label: "Skills",      color: "rose" },
  { key: "commands",    label: "Commands",    color: "blue" },
  { key: "agents",      label: "Agents",      color: "purple" },
  { key: "hooks",       label: "Hooks",       color: "amber" },
  { key: "mcp_servers", label: "MCP",         color: "teal" },
  { key: "lsp_servers", label: "LSP",         color: "green" },
];
```

---

### 2.2 列出已安装插件

**Rust 命令**: `list_installed_plugins`

**实现路径**: `commands/plugins.rs:95` → `storage/plugins.rs:791`

**实现方式**：执行 `claude plugin list --json` CLI 命令，解析 JSON 输出。

#### 关键代码

**文件**: `src-tauri/src/storage/plugins.rs`，第 791–808 行

```rust
pub async fn list_installed_plugins_cli() -> Result<Vec<InstalledPlugin>, String> {
    let result = run_plugin_command(&["list", "--json"], None).await?;
    if !result.success {
        return Err(format!("CLI error: {}", result.stderr.trim()));
    }

    let plugins: Vec<InstalledPlugin> = serde_json::from_str(result.stdout.trim())
        .map_err(|e| {
            log::warn!("[plugins] failed to parse installed plugins JSON: {}", e);
            format!("Failed to parse plugin list: {}", e)
        })?;

    Ok(plugins)
}
```

#### 执行的 CLI 命令

```bash
claude plugin list --json
```

CLI 输出示例：
```json
[
  {
    "name": "frontend-design",
    "description": "Frontend design and UI/UX assistance",
    "version": "1.2.0",
    "scope": "user",
    "enabled": true
  }
]
```

#### 前端调用

**文件**: `src/lib/api.ts`，第 1103–1106 行

```typescript
export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("list_installed_plugins");
}
```

---

### 2.3 安装插件

**Rust 命令**: `install_plugin(name, scope, cwd?)`

**实现路径**: `commands/plugins.rs:131` → 共享帮助函数 `plugin_lifecycle_op`

#### 执行流程

```
1. 校验插件名 (validate_plugin_name)
2. 校验 scope (validate_scope)
3. 校验/解析 cwd (validate_plugin_cwd)
4. 执行 CLI: claude plugin install <name> --scope <scope>
   (如有 cwd，设置 current_dir)
5. 返回 PluginOperationResult { success, message }
```

#### 执行的 CLI 命令

```bash
# 用户级安装
claude plugin install frontend-design --scope user

# 项目级安装
claude plugin install frontend-design --scope project
# (cwd = /path/to/project)

# 本地安装
claude plugin install ./my-custom-plugin --scope local
```

#### 前端调用

**文件**: `src/routes/plugins/+page.svelte`，第 705–727 行

```typescript
async function handleInstall(pluginName: string) {
  operationLoading = pluginName;
  try {
    const result = await installPlugin(
      pluginName, installScope,
      needsCwd(installScope) ? projectCwd : undefined,
    );
    showToast(
      result.success
        ? t("plugin_installedPlugin", { name: pluginName })
        : t("plugin_failedOp", { error: result.message }),
      result.success ? "success" : "error",
    );
    if (result.success) await refreshPluginData();
  } catch (e) {
    showToast(t("plugin_errorInstalling", { ... }), "error");
  } finally {
    operationLoading = null;
  }
}
```

前端使用 `installScope` state 变量（user / project / local 三选一），用户在 UI 中切换：

```svelte
<div class="flex rounded-md border border-border p-0.5 shrink-0">
  <button onclick={() => (installScope = "user")}>User</button>
  <button onclick={() => (installScope = "project")}>Project</button>
  <button onclick={() => (installScope = "local")}>Local</button>
</div>
```

---

### 2.4 卸载插件

**Rust 命令**: `uninstall_plugin(name, scope, cwd?)`

**实现路径**: `commands/plugins.rs:140` → 共享帮助函数 `plugin_lifecycle_op`

#### 执行的 CLI 命令

```bash
claude plugin uninstall <name> --scope <scope>
```

#### 前端调用

**文件**: `src/routes/plugins/+page.svelte`，第 729–755 行。卸载前弹出确认对话框：

```typescript
async function handleUninstall(plugin: InstalledPlugin) {
  const scope = (plugin.scope as string) ?? "user";
  const cwd = resolvePluginCwd(plugin);
  confirmAction = {
    title: t("plugin_uninstallTitle"),
    message: t("plugin_uninstallMsg", { name: plugin.name }),
    onConfirm: async () => {
      const result = await uninstallPlugin(plugin.name, scope, cwd);
      if (result.success) await refreshPluginData();
    },
  };
}
```

---

### 2.5 启用/禁用插件

**Rust 命令**: `enable_plugin(name, scope, cwd?)` / `disable_plugin(name, scope, cwd?)`

**实现路径**: `commands/plugins.rs:149` / `commands/plugins.rs:158` → 共享帮助函数 `plugin_lifecycle_op`

#### 执行的 CLI 命令

```bash
# 启用
claude plugin enable <name> --scope <scope>

# 禁用
claude plugin disable <name> --scope <scope>
```

#### 前端调用

**文件**: `src/routes/plugins/+page.svelte`，第 757–792 行

```typescript
async function handleToggleEnabled(plugin: InstalledPlugin) {
  const action = plugin.enabled !== false ? "disable" : "enable";
  const scope = (plugin.scope as string) ?? "user";
  const cwd = resolvePluginCwd(plugin);
  const fn = plugin.enabled !== false ? disablePlugin : enablePlugin;
  const result = await fn(plugin.name, scope, cwd);
  showToast(
    result.success
      ? (plugin.enabled !== false
          ? t("plugin_disabledPlugin", { name: plugin.name })
          : t("plugin_enabledPlugin", { name: plugin.name }))
      : t("plugin_failedOp", { error: result.message }),
    result.success ? "success" : "error",
  );
  if (result.success) await refreshPluginData();
}
```

UI 上每个已安装插件显示启用/禁用切换按钮：

```svelte
<button
  class="{plugin.enabled !== false
    ? 'text-green-600 border-green-500/30'
    : 'text-muted-foreground'}"
  onclick={() => handleToggleEnabled(plugin)}
>
  {plugin.enabled !== false ? "Enabled" : "Disabled"}
</button>
```

---

### 2.6 更新插件

**Rust 命令**: `update_plugin(name, scope, cwd?)`

**实现路径**: `commands/plugins.rs:167` → 共享帮助函数 `plugin_lifecycle_op`

#### 执行的 CLI 命令

```bash
claude plugin update <name> --scope <scope>
```

---

### 2.7 核心执行引擎

所有插件生命周期操作（install / uninstall / enable / disable / update）共享同一个帮助函数和底层执行引擎。

#### 共享帮助函数 `plugin_lifecycle_op`

**文件**: `src-tauri/src/commands/plugins.rs`，第 102–129 行

```rust
async fn plugin_lifecycle_op(
    verb: &str,        // "install" | "uninstall" | "enable" | "disable" | "update"
    name: &str,        // 插件名称
    scope: &str,       // "user" | "project" | "local" | "managed"
    cwd: Option<&str>, // 工作目录 (project/local 时必传)
) -> Result<PluginOperationResult, String> {
    // 1. 输入校验
    crate::storage::plugins::validate_plugin_name(name)?;
    crate::storage::plugins::validate_scope(scope)?;
    let effective_cwd = validate_plugin_cwd(scope, cwd)?;

    // 2. 拼装参数并执行 CLI
    let result = crate::storage::plugins::run_plugin_command(
        &[verb, name, "--scope", scope],
        effective_cwd,
    ).await?;

    // 3. 包装结果
    Ok(PluginOperationResult {
        success: result.success,
        message: if result.success {
            result.stdout.trim().to_string()   // 成功时取 stdout
        } else {
            result.stderr.trim().to_string()   // 失败时取 stderr
        },
    })
}
```

#### 底层执行函数 `run_plugin_command`

**文件**: `src-tauri/src/storage/plugins.rs`，第 480–553 行

这是整个插件系统的 **核心执行引擎**。所有需要通过 CLI 完成的操作最终都调用此函数。

```rust
const PLUGIN_CMD_TIMEOUT: Duration = Duration::from_secs(30);

pub async fn run_plugin_command(
    args: &[&str],
    cwd: Option<&str>,
) -> Result<PluginCommandResult, String> {
    // 1. 解析 claude 二进制路径 (自动检测安装位置)
    let claude_bin = resolve_claude_path();

    // 2. 获取增强后的 PATH (包含常见安装路径)
    let path_env = augmented_path();

    // 3. 构建命令
    let mut cmd = Command::new(&claude_bin);
    cmd.arg("plugin");                  // 子命令: plugin
    for arg in args { cmd.arg(arg); }   // 追加参数: install frontend-design --scope user
    if let Some(dir) = cwd {
        cmd.current_dir(dir);           // 设置工作目录 (project/local scope)
    }
    cmd.env("PATH", &path_env)          // 注入 PATH 环境变量
       .env_remove("CLAUDECODE")        // 移除 CLAUDECODE 变量, 允许嵌套运行
       .stdin(std::process::Stdio::null())
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped());

    // 4. Windows: 隐藏控制台窗口
    cmd.hide_console().kill_on_drop(true);

    // 5. 启动子进程
    let child = cmd.spawn().map_err(|e| {
        format!("Failed to spawn claude: {}", e)
    })?;

    // 6. 等待进程结束 (30 秒超时)
    let result = timeout(PLUGIN_CMD_TIMEOUT, child.wait_with_output()).await;

    // 7. 处理结果
    match result {
        Ok(Ok(output)) => {
            Ok(PluginCommandResult {
                success: output.status.success(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code(),
            })
        }
        Ok(Err(e)) => Err(format!("Process error: {}", e)),
        Err(_) => Err(format!(
            "Command timed out after {}s", PLUGIN_CMD_TIMEOUT.as_secs()
        )),
    }
}
```

#### 命令生成逻辑总结

| 操作 | 子命令参数 | CLI 完整命令 |
|------|-----------|-------------|
| 安装 | `["install", name, "--scope", scope]` | `claude plugin install frontend-design --scope user` |
| 卸载 | `["uninstall", name, "--scope", scope]` | `claude plugin uninstall frontend-design --scope user` |
| 启用 | `["enable", name, "--scope", scope]` | `claude plugin enable frontend-design --scope user` |
| 禁用 | `["disable", name, "--scope", scope]` | `claude plugin disable frontend-design --scope user` |
| 更新 | `["update", name, "--scope", scope]` | `claude plugin update frontend-design --scope user` |
| 列出已安装 | `["list", "--json"]` | `claude plugin list --json` |
| 添加仓库 | `["marketplace", "add", source]` | `claude plugin marketplace add owner/repo` |
| 移除仓库 | `["marketplace", "remove", name]` | `claude plugin marketplace remove my-registry` |
| 更新仓库 | `["marketplace", "update", name]` | `claude plugin marketplace update my-registry` |

---

### 2.8 输入校验

#### 插件名校验

**文件**: `src-tauri/src/storage/plugins.rs`，第 555–573 行

```rust
pub fn validate_plugin_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Plugin name cannot be empty".to_string());
    }
    if name.len() > 256 {
        return Err("Plugin name too long".to_string());
    }
    // 允许: [a-zA-Z0-9] + - + _ + . + @ + /
    // 禁止: 空格, ;, `, |, 等 shell 元字符
    let valid = name.chars().all(|c|
        c.is_alphanumeric() || c == '-' || c == '_'
        || c == '.' || c == '@' || c == '/'
    );
    if !valid {
        return Err(format!("Invalid characters in plugin name: {}", name));
    }
    Ok(())
}
```

#### Scope 校验

**文件**: `src-tauri/src/storage/plugins.rs`，第 780–788 行

```rust
pub fn validate_scope(scope: &str) -> Result<(), String> {
    match scope {
        "user" | "project" | "local" | "managed" => Ok(()),
        _ => Err(format!(
            "Invalid scope '{}': must be user, project, local, or managed",
            scope
        )),
    }
}
```

#### CWD 校验

**文件**: `src-tauri/src/storage/plugins.rs`，第 9–26 行（commands 层）

```rust
fn validate_plugin_cwd<'a>(scope: &str, cwd: Option<&'a str>) -> Result<Option<&'a str>, String> {
    if scope == "project" || scope == "local" {
        match cwd {
            Some(dir) if !dir.is_empty() => {
                if !std::path::Path::new(dir).is_dir() {
                    return Err(format!("Working directory does not exist: {}", dir));
                }
                Ok(Some(dir))
            }
            _ => Err(format!(
                "Scope '{}' requires a working directory (cwd)", scope
            )),
        }
    } else {
        Ok(None)  // user / managed scope 不需要 cwd
    }
}
```

**Scope 与 CWD 关系**：

| Scope | 需要 cwd | 说明 |
|-------|---------|------|
| `user` | 否 | 安装到 `~/.claude/` |
| `managed` | 否 | 托管模式 |
| `project` | 是 | 安装到项目 `.claude/` 目录 |
| `local` | 是 | 安装到项目本地目录 |

---

## 前端 API 层

**文件**: `src/lib/api.ts`，第 999–1210 行

前端通过 Tauri IPC 调用后端 Rust 命令，所有插件相关的 API 函数签名如下：

```typescript
// ── Marketplace ──
listMarketplaces(): Promise<MarketplaceInfo[]>
listMarketplacePlugins(): Promise<MarketplacePlugin[]>
addMarketplace(source: string): Promise<PluginOperationResult>
removeMarketplace(name: string): Promise<PluginOperationResult>
updateMarketplace(name?: string): Promise<PluginOperationResult>

// ── 已安装插件 ──
listInstalledPlugins(): Promise<InstalledPlugin[]>
installPlugin(name: string, scope: string, cwd?: string): Promise<PluginOperationResult>
uninstallPlugin(name: string, scope: string, cwd?: string): Promise<PluginOperationResult>
enablePlugin(name: string, scope: string, cwd?: string): Promise<PluginOperationResult>
disablePlugin(name: string, scope: string, cwd?: string): Promise<PluginOperationResult>
updatePlugin(name: string, scope: string, cwd?: string): Promise<PluginOperationResult>
```

每个 API 函数的实现模式一致：

```typescript
export async function installPlugin(
  name: string, scope: string, cwd?: string,
): Promise<PluginOperationResult> {
  return invoke<PluginOperationResult>("install_plugin", { name, scope, cwd });
}
```

`invoke<T>(cmd, args)` 是 Tauri IPC 调用的封装，它会通过 transport 层将命令名和参数传递给 Rust 后端。

---

## 关键数据结构

> 以下为 Rust 端的模型定义，位于 `src-tauri/src/models.rs`。前端 TypeScript 端有对应的类型定义（`src/lib/types.ts`），结构一致。

### MarketplacePlugin — Marketplace 中的插件

```rust
pub struct MarketplacePlugin {
    pub name: String,                                    // 插件名
    pub description: String,                             // 描述
    pub version: Option<String>,                         // 版本号
    pub author: Option<PluginAuthor>,                    // 作者 { name, email? }
    pub category: Option<String>,                        // 分类 (development, security, ...)
    pub homepage: Option<String>,                        // 主页 URL
    pub source: Option<serde_json::Value>,               // 来源 (字符串或对象)
    pub tags: Vec<String>,                               // 标签列表
    pub strict: Option<bool>,                            // 严格模式
    pub lsp_servers: Option<serde_json::Value>,          // LSP 服务器配置
    pub marketplace_name: Option<String>,                // [enriched] 所属仓库名
    pub install_count: Option<u64>,                      // [enriched] 安装次数
    pub components: PluginComponents,                    // [enriched] 组件列表
}
```

### PluginComponents — 插件组件

```rust
pub struct PluginComponents {
    pub skills: Vec<String>,       // skills/ 子目录名
    pub commands: Vec<String>,     // commands/ 下的 .md 文件名
    pub agents: Vec<String>,       // agents/ 下的 .md 文件名
    pub hooks: bool,               // hooks/ 目录或 hooks.json 是否存在
    pub mcp_servers: Vec<String>,  // .mcp.json 的 key 列表
    pub lsp_servers: Vec<String>,  // lspServers 字段
}
```

### MarketplaceInfo — 仓库元数据

```rust
pub struct MarketplaceInfo {
    pub name: String,                  // 仓库名
    pub source: serde_json::Value,     // 来源 (URL 或 GitHub owner/repo)
    pub install_location: String,      // 本地安装路径
    pub last_updated: Option<String>,  // 最后更新时间
    pub plugin_count: usize,          // 含有的插件数量
}
```

### InstalledPlugin — 已安装插件

```rust
pub struct InstalledPlugin {
    pub name: String,                              // 插件名 (id 别名)
    pub description: String,                       // 描述
    pub version: Option<String>,                   // 版本号
    pub scope: Option<String>,                     // 安装作用域
    pub enabled: Option<bool>,                     // 是否启用
    pub marketplace: Option<String>,               // 来源仓库
    pub plugin_id: Option<String>,                 // 插件 ID
    pub agent: Option<String>,                     // "claude" | "codex"
    pub project_path: Option<String>,              // 项目路径 (project scope)
    pub extra: serde_json::Map<String, Value>,     // 额外字段 (flatten)
}
```

### PluginOperationResult — 操作结果

```rust
pub struct PluginOperationResult {
    pub success: bool,     // 操作是否成功
    pub message: String,   // 成功时为 stdout, 失败时为 stderr
}
```

---

## 总结

OpenCovibe 的 Claude Code 插件系统采用**分层代理架构**：

1. **查询类操作**（列出 Marketplace、浏览插件）直接读取 `~/.claude/plugins/` 下的 JSON 配置文件，速度快且不依赖 CLI 进程
2. **变更类操作**（安装/卸载/启用/禁用/更新插件、管理仓库）统一通过 `run_plugin_command()` 执行 `claude plugin` CLI 命令，保证与 Claude Code 原生命令行为完全一致
3. **组件发现**对本地插件进行目录扫描，识别 skills / commands / agents / hooks / MCP servers / LSP servers 六种组件类型
4. **安全性**通过多层校验（插件名白名单字符、scope 枚举、cwd 路径验证、仓库来源危险字符过滤、30 秒命令超时）确保操作安全
